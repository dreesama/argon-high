import json
import threading
from pathlib import Path
from typing import Dict, List, Optional
from ..schemas.render import RenderJobStatus
from ..core.config import settings
from ..core.logging import logger

class JobStore:
    def __init__(self, persistence_file: Optional[Path] = None):
        self.persistence_file = persistence_file or (settings.STORAGE_DIR / "jobs_db.json")
        self._lock = threading.Lock()
        self._jobs: Dict[str, RenderJobStatus] = {}
        self._load_from_disk()

    def _load_from_disk(self):
        with self._lock:
            if self.persistence_file.exists():
                try:
                    data = json.loads(self.persistence_file.read_text(encoding="utf-8"))
                    for job_id, job_dict in data.items():
                        self._jobs[job_id] = RenderJobStatus(**job_dict)
                    logger.info(f"Loaded {len(self._jobs)} durable jobs from {self.persistence_file.name}")
                except Exception as e:
                    logger.error(f"Failed to load jobs from {self.persistence_file}: {e}")
                    self._jobs = {}
            else:
                self._jobs = {}

    def _save_to_disk(self):
        try:
            self.persistence_file.parent.mkdir(parents=True, exist_ok=True)
            serializable = {jid: job.model_dump() for jid, job in self._jobs.items()}
            self.persistence_file.write_text(json.dumps(serializable, indent=2), encoding="utf-8")
        except Exception as e:
            logger.error(f"Failed to persist jobs to {self.persistence_file}: {e}")

    def save_job(self, job: RenderJobStatus):
        with self._lock:
            self._jobs[job.job_id] = job
            self._save_to_disk()
            try:
                from ..db.database import db_manager
                conn = db_manager.get_connection()
                conn.execute("""
                INSERT OR REPLACE INTO processing_jobs (
                    id, workspace_id, clip_id, source_asset_id, status, progress_pct,
                    duration_sec, output_filename, output_inspection_json,
                    burned_captions_preset, download_token, error_message,
                    cancellation_reason, started_at_iso, completed_at_iso
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
                """, (
                    job.job_id,
                    job.workspace_id or "ws-argon-core",
                    job.clip_id,
                    job.clip_id or "src-unknown",
                    job.status,
                    job.progress_pct,
                    job.duration_sec,
                    job.output_filename,
                    job.output_inspection.model_dump_json() if job.output_inspection else None,
                    job.burned_captions_preset,
                    job.download_token,
                    job.error_message,
                    job.cancellation_reason,
                    job.started_at_iso,
                    job.completed_at_iso,
                ))
                conn.commit()
                conn.close()
            except Exception as db_err:
                logger.warning(f"Could not sync job {job.job_id} to SQLite: {db_err}")

    def get_job(self, job_id: str) -> Optional[RenderJobStatus]:
        with self._lock:
            return self._jobs.get(job_id)

    def list_jobs(self) -> List[RenderJobStatus]:
        with self._lock:
            return list(self._jobs.values())

job_store = JobStore()
