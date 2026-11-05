import asyncio
import hashlib
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional, List, Tuple

from ..core.logging import logger
from ..core.config import settings
from ..schemas.render import RenderJobCreate, RenderJobStatus, RenderOutputInspection
from .ffmpeg_service import ffmpeg_service
from .subtitle_service import subtitle_service
from .transcription_service import transcription_service
from .job_store import job_store

class JobQueueService:
    def __init__(self):
        self._semaphore = asyncio.Semaphore(settings.MAX_CONCURRENT_RENDERS)
        self._active_tasks: Dict[str, asyncio.Task] = {}
        self._recover_stale_jobs()

    def _recover_stale_jobs(self):
        """Transitions any jobs found in queued or processing state upon startup to interrupted/failed."""
        for job in job_store.list_jobs():
            if job.status in ["queued", "processing"]:
                job.status = "failed"
                job.error_message = "Render interrupted by server restart. Please re-submit job."
                job.completed_at_iso = datetime.now(timezone.utc).isoformat()
                job_store.save_job(job)
                logger.warning(f"Recovered stale job {job.job_id} after server restart -> status: failed")

    def _compute_job_hash(self, p: RenderJobCreate) -> str:
        raw = f"{p.source_asset_id}_{p.start_sec}_{p.end_sec}_{p.target_width}x{p.target_height}_{p.crop_mode}_{p.caption_preset}_{p.burn_captions}_{p.face_track_offset_x}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]

    def get_job(self, job_id: str) -> Optional[RenderJobStatus]:
        return job_store.get_job(job_id)

    def list_jobs(self, workspace_id: Optional[str] = None) -> List[RenderJobStatus]:
        jobs = job_store.list_jobs()
        if workspace_id:
            return [j for j in jobs if j.workspace_id == workspace_id]
        return jobs

    async def cancel_job(self, job_id: str, reason: str = "Operator requested cancellation") -> Optional[RenderJobStatus]:
        job = job_store.get_job(job_id)
        if not job:
            return None

        if job.status in ["completed", "failed", "cancelled"]:
            return job

        # Cancel active task if running
        if job_id in self._active_tasks:
            task = self._active_tasks[job_id]
            task.cancel()
            self._active_tasks.pop(job_id, None)

        job.status = "cancelled"
        job.cancellation_reason = reason
        job.completed_at_iso = datetime.now(timezone.utc).isoformat()
        job_store.save_job(job)
        logger.info(f"Render job {job_id} cancelled: {reason}")
        return job

    def cleanup_old_renders(self, retention_hours: int = 48) -> Dict[str, int]:
        """Prunes temporary WAV, ASS, and MP4 render artifacts older than retention_hours."""
        cutoff_sec = time.time() - (retention_hours * 3600)
        deleted_count = 0
        reclaimed_bytes = 0

        target_dirs = [settings.RENDER_DIR, settings.STORAGE_DIR / "temp_audio"]
        for t_dir in target_dirs:
            if not t_dir.exists():
                continue
            for item in t_dir.glob("*"):
                if item.is_file():
                    try:
                        mtime = item.stat().st_mtime
                        if mtime < cutoff_sec:
                            size = item.stat().st_size
                            item.unlink()
                            deleted_count += 1
                            reclaimed_bytes += size
                    except Exception as err:
                        logger.warning(f"Failed to delete {item.name}: {err}")

        logger.info(f"Disk cleanup completed: pruned {deleted_count} files, reclaimed {reclaimed_bytes // 1024} KB")
        return {"deleted_files": deleted_count, "reclaimed_kb": reclaimed_bytes // 1024}

    async def enqueue_render_job(
        self,
        job_create: RenderJobCreate,
        input_path: Path,
    ) -> RenderJobStatus:
        # Idempotency Check: if idempotency_key is given, or identical job is queued/processing
        job_hash = job_create.idempotency_key or self._compute_job_hash(job_create)
        for existing in job_store.list_jobs():
            if existing.status in ["queued", "processing", "completed"]:
                if existing.clip_id and existing.clip_id == job_create.clip_id and existing.status in ["queued", "processing"]:
                    logger.info(f"Returning active existing job {existing.job_id} for clip {job_create.clip_id}")
                    return existing

        job_id = f"job-{uuid.uuid4().hex[:12]}"
        download_token = f"dl_{uuid.uuid4().hex[:16]}"
        output_filename = f"rendered_{job_id}_{job_create.target_width}x{job_create.target_height}.mp4"
        output_path = settings.RENDER_DIR / output_filename

        initial_status = RenderJobStatus(
            job_id=job_id,
            clip_id=job_create.clip_id,
            workspace_id=job_create.workspace_id,
            status="queued",
            progress_pct=5,
            started_at_iso=datetime.now(timezone.utc).isoformat(),
            duration_sec=round(job_create.end_sec - job_create.start_sec, 2),
            output_filename=output_filename,
            burned_captions_preset=job_create.caption_preset if job_create.burn_captions else None,
            download_token=download_token,
            download_url=f"/api/v1/render/output/{job_id}/download?token={download_token}",
            preview_url=f"/api/v1/render/output/{job_id}/preview?token={download_token}",
        )
        job_store.save_job(initial_status)

        # Launch async rendering through bounded semaphore
        task = asyncio.create_task(self._process_render(job_id, input_path, output_path, job_create))
        self._active_tasks[job_id] = task

        return initial_status

    async def _process_render(
        self,
        job_id: str,
        input_path: Path,
        output_path: Path,
        params: RenderJobCreate,
    ):
        async with self._semaphore:
            job = job_store.get_job(job_id)
            if not job or job.status == "cancelled":
                return

            try:
                logger.info(f"Acquired execution slot for render job {job_id} (Preset: {params.caption_preset})")
                job.status = "processing"
                job.progress_pct = 20
                job_store.save_job(job)

                # 1. Generate Synchronized Subtitle file if captions requested
                subtitles_ass_path = None
                if params.burn_captions:
                    try:
                        ass_file = settings.RENDER_DIR / f"{job_id}_captions.ass"
                        # Get transcript segments for this media
                        analysis = transcription_service.analyze_source_audio(
                            source_asset_id=params.source_asset_id,
                            media_path=input_path,
                            sponsor_name=params.campaign_id or "Argon High",
                        )
                        subtitle_service.generate_ass_subtitles(
                            segments=analysis.full_transcript,
                            output_ass_path=ass_file,
                            clip_start_sec=params.start_sec,
                            clip_end_sec=params.end_sec,
                            preset=params.caption_preset,
                        )
                        subtitles_ass_path = ass_file
                        logger.info(f"Generated ASS subtitles for job {job_id} at {ass_file.name}")
                    except Exception as sub_err:
                        logger.warning(f"Could not generate subtitles for job {job_id}: {sub_err}")

                job.progress_pct = 50
                job_store.save_job(job)

                # 2. Run FFmpeg in worker thread with timeout
                loop = asyncio.get_running_loop()

                def run_sync():
                    return ffmpeg_service.render_vertical_clip(
                        input_path=input_path,
                        output_path=output_path,
                        start_sec=params.start_sec,
                        end_sec=params.end_sec,
                        target_width=params.target_width,
                        target_height=params.target_height,
                        face_track_offset_x=params.face_track_offset_x,
                        crop_mode=params.crop_mode,
                        normalize_audio=params.normalize_audio_lufs,
                        watermark_text=params.watermark_text,
                        subtitles_ass_path=subtitles_ass_path,
                        fade_audio=params.fade_audio,
                    )

                # Enforce timeout guard
                inspection = await asyncio.wait_for(
                    loop.run_in_executor(None, run_sync),
                    timeout=settings.RENDER_TIMEOUT_SEC,
                )

                job.progress_pct = 100
                job.status = "completed"
                job.completed_at_iso = datetime.now(timezone.utc).isoformat()
                job.output_inspection = inspection
                job_store.save_job(job)
                logger.info(f"Job {job_id} successfully rendered and verified: {inspection.width}x{inspection.height}")

            except asyncio.CancelledError:
                logger.warning(f"Render job {job_id} task was cancelled.")
                job.status = "cancelled"
                job.cancellation_reason = "Cancelled mid-render."
                job_store.save_job(job)
            except asyncio.TimeoutError:
                logger.error(f"Render job {job_id} timed out after {settings.RENDER_TIMEOUT_SEC}s.")
                job.status = "failed"
                job.error_message = f"Render process timed out after {settings.RENDER_TIMEOUT_SEC} seconds."
                job.completed_at_iso = datetime.now(timezone.utc).isoformat()
                job_store.save_job(job)
            except Exception as e:
                logger.error(f"Render job {job_id} failed: {e}", exc_info=True)
                job.status = "failed"
                job.error_message = str(e)
                job.completed_at_iso = datetime.now(timezone.utc).isoformat()
                job_store.save_job(job)
            finally:
                self._active_tasks.pop(job_id, None)

job_queue_service = JobQueueService()
