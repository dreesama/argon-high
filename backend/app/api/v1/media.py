import os
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends, Header, Query, status
from fastapi.responses import FileResponse
from ...core.config import settings
from ...core.logging import logger
from ...core.auth import AuthenticatedUser, get_current_user
from ...schemas.media import MediaUploadResponse, MediaInspectionResult
from ...services.ffmpeg_service import ffmpeg_service
from ...db.database import db_manager

router = APIRouter(prefix="/media", tags=["Media Ingestion & Source Inspection"])

# Memory registry of uploaded sources
SOURCE_REGISTRY: dict = {}

@router.post("/upload", response_model=MediaUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_source_video(
    file: UploadFile = File(...),
    campaign_id: str = Form("cmp-argon-flagship"),
    title: str = Form(""),
    creator_name: str = Form(""),
    authorization_proof: str = Form("Sponsor Direct Release Agreement #AGY-2026"),
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Accepts user-authorized MP4 video file, saves to storage, and executes FFprobe stream inspection.
    """
    # 1. Validate file extension and MIME
    original_filename = file.filename or "uploaded_source.mp4"
    ext = Path(original_filename).suffix.lower()
    if ext not in [".mp4", ".mov", ".m4v", ".webm"]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported media format '{ext}'. Only authorized MP4, MOV, or WEBM containers are permitted.",
        )

    # 2. Generate secure file storage path
    source_asset_id = f"src-{uuid.uuid4().hex[:12]}"
    saved_filename = f"{source_asset_id}_{Path(original_filename).name}"
    file_path = settings.UPLOAD_DIR / saved_filename

    # 3. Stream write to disk while monitoring size
    total_bytes = 0
    try:
        with open(file_path, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                total_bytes += len(chunk)
                if total_bytes > settings.MAX_UPLOAD_BYTES:
                    buffer.close()
                    file_path.unlink(missing_ok=True)
                    raise HTTPException(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        detail=f"File exceeds maximum authorized upload size of {settings.MAX_UPLOAD_BYTES // (1024*1024)}MB",
                    )
                buffer.write(chunk)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to write uploaded file: {e}")
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error saving upload: {str(e)}",
        )

    # 4. Strict Magic Bytes Header Validation (Security Check)
    if total_bytes < 16:
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty or too small to be a valid video container.",
        )

    try:
        with open(file_path, "rb") as f:
            header = f.read(32)
            # MP4/MOV has 'ftyp' in bytes 4..12 or moov
            is_mp4 = b"ftyp" in header or b"moov" in header
            is_webm = header.startswith(b"\x1a\x45\xdf\xa3")
            if not (is_mp4 or is_webm):
                file_path.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="File header does not match authorized MP4, MOV, or WebM container magic bytes.",
                )
    except HTTPException:
        raise
    except Exception as e:
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to verify media container headers: {e}",
        )

    # 5. Perform FFprobe Inspection
    try:
        inspection = ffmpeg_service.inspect_media(file_path)
    except Exception as e:
        file_path.unlink(missing_ok=True)
        logger.error(f"FFprobe inspection failed for uploaded file: {e}")
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Media inspection failed: Corrupted or unreadable MP4 stream ({str(e)})",
        )

    # Validate duration limit (max 60 minutes)
    if inspection.duration_sec > 3600.0:
        file_path.unlink(missing_ok=True)
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="Source video duration exceeds maximum processing limit of 60 minutes.",
        )

    resolution_str = (
        f"{inspection.video_stream.width}x{inspection.video_stream.height}"
        if inspection.video_stream
        else "Unknown"
    )
    fps_val = inspection.video_stream.fps if inspection.video_stream else 30.0
    audio_lufs_val = inspection.audio_stream.lufs if inspection.audio_stream and inspection.audio_stream.lufs else -14.0

    response = MediaUploadResponse(
        source_asset_id=source_asset_id,
        workspace_id=current_user.workspace_id,
        campaign_id=campaign_id,
        title=title or Path(original_filename).stem,
        filename=saved_filename,
        file_size_bytes=total_bytes,
        duration_sec=inspection.duration_sec,
        resolution=resolution_str,
        fps=fps_val,
        audio_lufs=audio_lufs_val,
        inspection=inspection,
        authorization_proof=authorization_proof,
    )

    # Cache metadata and file path
    SOURCE_REGISTRY[source_asset_id] = {
        "file_path": file_path,
        "response": response,
    }

    # Persist durable source asset record to database
    try:
        conn = db_manager.get_connection()
        conn.execute("""
        INSERT OR REPLACE INTO source_assets (
            id, workspace_id, campaign_id, title, filename, file_path, file_size_bytes,
            duration_sec, resolution, fps, audio_lufs, authorization_proof, inspection_json, created_at_iso
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            source_asset_id,
            current_user.workspace_id,
            campaign_id,
            title or Path(original_filename).stem,
            saved_filename,
            str(file_path),
            total_bytes,
            inspection.duration_sec,
            resolution_str,
            fps_val,
            audio_lufs_val,
            authorization_proof,
            inspection.model_dump_json(),
            datetime.now(timezone.utc).isoformat(),
        ))
        conn.commit()
        conn.close()
    except Exception as db_err:
        logger.warning(f"Could not persist source asset to SQLite DB: {db_err}")

    logger.info(f"Source asset {source_asset_id} uploaded and inspected successfully: {total_bytes} bytes, {inspection.duration_sec}s")
    return response

@router.get("", response_model=List[MediaUploadResponse])
async def list_source_assets(
    campaign_id: Optional[str] = None,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Lists authorized source assets belonging to the authenticated workspace.
    Enforces tenant isolation by workspace_id.
    """
    conn = db_manager.get_connection()
    if campaign_id:
        rows = conn.execute("""
            SELECT id, workspace_id, campaign_id, title, filename, file_size_bytes,
                   duration_sec, resolution, fps, audio_lufs, authorization_proof, inspection_json, created_at_iso
            FROM source_assets
            WHERE workspace_id = ? AND campaign_id = ?
            ORDER BY created_at_iso DESC;
        """, (current_user.workspace_id, campaign_id)).fetchall()
    else:
        rows = conn.execute("""
            SELECT id, workspace_id, campaign_id, title, filename, file_size_bytes,
                   duration_sec, resolution, fps, audio_lufs, authorization_proof, inspection_json, created_at_iso
            FROM source_assets
            WHERE workspace_id = ?
            ORDER BY created_at_iso DESC;
        """, (current_user.workspace_id,)).fetchall()
    conn.close()

    results = []
    for r in rows:
        insp = None
        if r["inspection_json"]:
            try:
                insp = MediaInspectionResult.model_validate_json(r["inspection_json"])
            except Exception:
                pass
        results.append(MediaUploadResponse(
            source_asset_id=r["id"],
            workspace_id=r["workspace_id"],
            campaign_id=r["campaign_id"],
            title=r["title"],
            filename=r["filename"],
            file_size_bytes=r["file_size_bytes"],
            duration_sec=r["duration_sec"],
            resolution=r["resolution"],
            fps=r["fps"],
            audio_lufs=r["audio_lufs"],
            inspection=insp or MediaInspectionResult(duration_sec=r["duration_sec"], file_size_bytes=r["file_size_bytes"], container_format="mp4"),
            authorization_proof=r["authorization_proof"],
        ))
    return results

@router.get("/{source_id}/inspect", response_model=MediaInspectionResult)
async def inspect_source(
    source_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Re-runs or returns cached FFprobe stream inspection for a source asset.
    Enforces workspace isolation so tenants cannot inspect other workspaces' media.
    """
    owner_ws = None
    owner_ws = None
    if source_id in SOURCE_REGISTRY:
        owner_ws = SOURCE_REGISTRY[source_id]["response"].workspace_id
        file_path = SOURCE_REGISTRY[source_id]["file_path"]
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
        file_path = Path(row["file_path"])

    # Verify workspace ownership
    if not owner_ws or owner_ws not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to source asset in workspace '{owner_ws}'.",
        )

    return ffmpeg_service.inspect_media(file_path)

@router.get("/{source_id}/stream")
async def stream_source_video(
    source_id: str,
    token: Optional[str] = None,
    authorization: Optional[str] = Header(None),
    x_workspace_id: Optional[str] = Header(None),
):
    """
    Serves the source video file for authorized browser playback.
    Strictly enforces authentication & workspace authorization to protect private media.
    Zero unauthenticated access or hard-coded token bypasses.
    """
    # 1. Resolve user / token credentials strictly
    auth_user: Optional[AuthenticatedUser] = None
    if authorization:
        auth_user = await get_current_user(authorization=authorization, x_workspace_id=x_workspace_id)
    elif token:
        user_record = db_manager.get_user_by_token(token)
        if not user_record:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Unauthorized: Invalid or expired access token.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        user_id = user_record["id"]
        memberships = db_manager.get_user_workspaces(user_id)
        if not memberships:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: User '{user_id}' has no verified workspace memberships.",
            )
        authorized_ws = [m["id"] for m in memberships]
        eff_ws = x_workspace_id if (x_workspace_id and x_workspace_id in authorized_ws) else authorized_ws[0]
        eff_role = next((m.get("role", "operator") for m in memberships if m["id"] == eff_ws), "operator")
        auth_user = AuthenticatedUser(
            user_id=user_id,
            workspace_id=eff_ws,
            role=eff_role,
            email=user_record.get("email"),
            authorized_workspaces=authorized_ws,
            permissions=[eff_role],
        )
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Access token or bearer credentials required to stream private media.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 2. Locate Source Asset & Determine Authoritative Workspace Ownership
    owner_ws = None
    if source_id in SOURCE_REGISTRY:
        owner_ws = SOURCE_REGISTRY[source_id]["response"].workspace_id
        file_path = SOURCE_REGISTRY[source_id]["file_path"]
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
        file_path = Path(row["file_path"])

    # 3. Enforce Strict Workspace Isolation
    if not owner_ws or owner_ws not in auth_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to source asset in workspace '{owner_ws}'. Cross-workspace access rejected.",
        )

    return FileResponse(path=file_path, media_type="video/mp4")
