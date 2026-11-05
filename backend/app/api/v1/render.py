from typing import Optional
from pathlib import Path
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Header, Query, status
from fastapi.responses import FileResponse
from ...core.auth import AuthenticatedUser, get_current_user
from ...core.config import settings
from ...core.logging import logger
from ...schemas.render import RenderJobCreate, RenderJobStatus
from ...schemas.framing import FramingAnalysisResult, FramingCalculateRequest
from ...services.job_queue import job_queue_service
from ...services.framing_service import framing_service
from ...services.ffmpeg_service import ffmpeg_service
from ...db.database import db_manager
from .media import SOURCE_REGISTRY

router = APIRouter(prefix="/render", tags=["FFmpeg 9:16 Video Rendering Engine"])

def _verify_job_access(
    job: RenderJobStatus,
    token: Optional[str],
    authorization: Optional[str],
    user_workspace_id: Optional[str] = None,
):
    """
    Strict render media authorization check.
    Rejects forged or unverified bearer headers, invalid access tokens, and cross-workspace access.
    """
    # 1. If query token is provided, evaluate token authentication first
    if token:
        # Check signed job download token
        if token == job.download_token:
            if job.token_expires_at_iso:
                try:
                    exp_time = datetime.fromisoformat(job.token_expires_at_iso)
                    if datetime.now(timezone.utc) > exp_time:
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail="Forbidden: Media access token has expired.",
                        )
                except (ValueError, TypeError):
                    pass

            if user_workspace_id and job.workspace_id and user_workspace_id != job.workspace_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Forbidden: Access denied to tenant workspace '{job.workspace_id}'.",
                )
            return True

        # Check if token is a registered user API token
        user_record = db_manager.get_user_by_token(token)
        if user_record:
            user_workspaces = [m["id"] for m in db_manager.get_user_workspaces(user_record["id"])]
            if job.workspace_id and job.workspace_id not in user_workspaces:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Forbidden: Access denied to job in workspace '{job.workspace_id}'. Cross-workspace access rejected.",
                )
            return True

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Invalid media access token.",
        )

    # 2. Bearer Header Authentication Check (when no query token is passed)
    if authorization:
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            bearer_token = parts[1]
        elif len(parts) == 1 and not parts[0].lower().startswith("bearer"):
            bearer_token = parts[0]
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid authorization header format. Use 'Bearer <token>'",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_record = db_manager.get_user_by_token(bearer_token)
        if not user_record:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized: Invalid or expired bearer token.",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user_workspaces = [m["id"] for m in db_manager.get_user_workspaces(user_record["id"])]
        if job.workspace_id and job.workspace_id not in user_workspaces:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Access denied to job in workspace '{job.workspace_id}'. Cross-workspace access rejected.",
            )
        return True

    # 3. Unauthenticated requests are strictly rejected
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized: Valid access token or bearer credentials required.",
        headers={"WWW-Authenticate": "Bearer"},
    )

@router.post("/jobs", response_model=RenderJobStatus, status_code=status.HTTP_202_ACCEPTED)
async def create_render_job(
    params: RenderJobCreate,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Submits a vertical 9:16 (1080x1920) FFmpeg rendering job to the background processing queue.
    """
    params.workspace_id = current_user.workspace_id or params.workspace_id

    source_id = params.source_asset_id
    owner_ws = None
    if source_id in SOURCE_REGISTRY:
        owner_ws = SOURCE_REGISTRY[source_id]["response"].workspace_id
        input_path = SOURCE_REGISTRY[source_id]["file_path"]
    else:
        conn = db_manager.get_connection()
        row = conn.execute("SELECT workspace_id, file_path FROM source_assets WHERE id = ?;", (source_id,)).fetchone()
        conn.close()
        if not row or not Path(row["file_path"]).exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Source asset '{source_id}' not found in authoritative records.",
            )
        owner_ws = row["workspace_id"]
        input_path = Path(row["file_path"])

    if not owner_ws or owner_ws not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to source asset in workspace '{owner_ws}'.",
        )

    if params.end_sec <= params.start_sec:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"End time ({params.end_sec}s) must be greater than start time ({params.start_sec}s).",
        )

    job_status = await job_queue_service.enqueue_render_job(params, input_path)
    logger.info(f"Render job {job_status.job_id} enqueued for source {source_id} [{params.start_sec}s - {params.end_sec}s]")
    return job_status

@router.get("/jobs/{job_id}", response_model=RenderJobStatus)
async def get_render_job_status(
    job_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Polls the current status, progress percentage, and output inspection of a render job.
    """
    job = job_queue_service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Render job '{job_id}' not found.",
        )
    if job.workspace_id and job.workspace_id not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to render job in workspace '{job.workspace_id}'.",
        )
    return job

@router.post("/jobs/{job_id}/cancel", response_model=RenderJobStatus)
async def cancel_render_job(
    job_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Cancels an active or queued render job immediately.
    """
    job = job_queue_service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Render job '{job_id}' not found.",
        )
    if job.workspace_id and job.workspace_id not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to render job in workspace '{job.workspace_id}'.",
        )
    job = await job_queue_service.cancel_job(job_id)
    return job

@router.post("/cleanup")
async def cleanup_render_cache(
    hours: int = Query(48, ge=1, le=720),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Prunes cached WAV, ASS, and MP4 render artifacts older than retention hours.
    """
    return job_queue_service.cleanup_old_renders(retention_hours=hours)

@router.post("/framing/calculate", response_model=FramingAnalysisResult)
async def calculate_smart_framing(
    req: FramingCalculateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Computes smooth horizontal crop coordinates, safe visual action zones, and tracking metadata.
    """
    source_id = req.source_asset_id
    owner_ws = None
    if source_id in SOURCE_REGISTRY:
        owner_ws = SOURCE_REGISTRY[source_id]["response"].workspace_id
        input_path = SOURCE_REGISTRY[source_id]["file_path"]
    else:
        conn = db_manager.get_connection()
        row = conn.execute("SELECT workspace_id, file_path FROM source_assets WHERE id = ?;", (source_id,)).fetchone()
        conn.close()
        if not row or not Path(row["file_path"]).exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Source asset '{source_id}' not found in authoritative records.",
            )
        owner_ws = row["workspace_id"]
        input_path = Path(row["file_path"])

    if not owner_ws or owner_ws not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to source asset in workspace '{owner_ws}'.",
        )

    insp = ffmpeg_service.inspect_media(input_path)
    w = insp.video_stream.width if insp.video_stream else 1920
    h = insp.video_stream.height if insp.video_stream else 1080

    return framing_service.calculate_framing(
        source_width=w,
        source_height=h,
        target_width=req.target_width,
        target_height=req.target_height,
        crop_mode=req.crop_mode,
        manual_offset_x=req.manual_offset_x,
        media_path=input_path,
    )

@router.get("/output/{job_id}/preview")
async def preview_rendered_clip(
    job_id: str,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    x_workspace_id: Optional[str] = Header(None),
):
    """
    Streams the verified 1080x1920 vertical MP4 for real in-browser video playback.
    Requires matching job token, workspace match, or authenticated bearer session.
    """
    job = job_queue_service.get_job(job_id)
    if not job or not job.output_filename:
        raise HTTPException(status_code=404, detail="Job or output not found")

    _verify_job_access(job, token, authorization, user_workspace_id=x_workspace_id)

    file_path = settings.RENDER_DIR / job.output_filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Rendered file does not exist on disk")

    return FileResponse(
        path=file_path,
        media_type="video/mp4",
        filename=job.output_filename,
    )

@router.get("/output/{job_id}/download")
async def download_rendered_clip(
    job_id: str,
    token: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
    x_workspace_id: Optional[str] = Header(None),
):
    """
    Downloads the verified 1080x1920 vertical MP4 file as an attachment.
    Requires matching job token, workspace match, or authenticated bearer session.
    """
    job = job_queue_service.get_job(job_id)
    if not job or not job.output_filename:
        raise HTTPException(status_code=404, detail="Job or output not found")

    _verify_job_access(job, token, authorization, user_workspace_id=x_workspace_id)

    file_path = settings.RENDER_DIR / job.output_filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Rendered file does not exist on disk")

    return FileResponse(
        path=file_path,
        media_type="video/mp4",
        filename=f"argon_vertical_1080x1920_{job_id}.mp4",
        headers={"Content-Disposition": f"attachment; filename=argon_vertical_1080x1920_{job_id}.mp4"},
    )
