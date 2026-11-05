from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import Optional
from pathlib import Path
from ...core.auth import AuthenticatedUser, get_current_user
from ...core.config import settings
from ...schemas.intelligence import TranscriptionAnalysisResponse
from ...schemas.creative_qa import CreativeQAReport
from ...services.transcription_service import transcription_service
from ...services.creative_qa_service import creative_qa_service
from ...db.database import db_manager
from .media import SOURCE_REGISTRY

router = APIRouter(prefix="/intelligence", tags=["AI Speech Transcription & Hook Intelligence"])

class TranscribeRequest(BaseModel):
    source_asset_id: str
    sponsor_name: Optional[str] = "Argon High Syndicate"

class CreativeQAEvalRequest(BaseModel):
    source_asset_id: str
    clip_id: str
    start_sec: float
    end_sec: float

@router.post("/transcribe-and-rank", response_model=TranscriptionAnalysisResponse)
async def transcribe_and_rank_source(
    req: TranscribeRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Transcribes audio speech, detects acoustic velocity spikes,
    and returns exactly 3 ranked candidate timestamp ranges with 7-factor breakdown.
    """
    source_id = req.source_asset_id
    owner_ws = None
    if source_id in SOURCE_REGISTRY:
        owner_ws = SOURCE_REGISTRY[source_id]["response"].workspace_id
        file_path = SOURCE_REGISTRY[source_id]["file_path"]
    else:
        conn = db_manager.get_connection()
        row = conn.execute("SELECT workspace_id, file_path FROM source_assets WHERE id = ?;", (source_id,)).fetchone()
        conn.close()
        if row and Path(row["file_path"]).exists():
            owner_ws = row["workspace_id"]
            file_path = Path(row["file_path"])
        else:
            matches = list(settings.UPLOAD_DIR.glob(f"{source_id}_*"))
            if not matches:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Source asset '{source_id}' not found in registry or storage.",
                )
            file_path = matches[0]

    if owner_ws and owner_ws not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to source asset in workspace '{owner_ws}'.",
        )

    try:
        result = transcription_service.analyze_source_audio(
            source_asset_id=source_id,
            media_path=file_path,
            sponsor_name=req.sponsor_name or "Argon High Syndicate",
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transcription and candidate ranking failed: {str(e)}",
        )

@router.post("/evaluate-creative-qa", response_model=CreativeQAReport)
async def evaluate_clip_creative_qa(
    req: CreativeQAEvalRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Evaluates candidate quality: detects awkward starts/endings, excessive silence,
    subtitle reading overflow risk, and recommends snapped trim adjustments.
    """
    source_id = req.source_asset_id
    owner_ws = None
    if source_id in SOURCE_REGISTRY:
        owner_ws = SOURCE_REGISTRY[source_id]["response"].workspace_id
        file_path = SOURCE_REGISTRY[source_id]["file_path"]
    else:
        conn = db_manager.get_connection()
        row = conn.execute("SELECT workspace_id, file_path FROM source_assets WHERE id = ?;", (source_id,)).fetchone()
        conn.close()
        if row and Path(row["file_path"]).exists():
            owner_ws = row["workspace_id"]
            file_path = Path(row["file_path"])
        else:
            matches = list(settings.UPLOAD_DIR.glob(f"{source_id}_*"))
            if not matches:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Source asset '{source_id}' not found in registry or storage.",
                )
            file_path = matches[0]

    if owner_ws and owner_ws not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to source asset in workspace '{owner_ws}'.",
        )

    analysis = transcription_service.analyze_source_audio(
        source_asset_id=source_id,
        media_path=file_path,
    )

    return creative_qa_service.evaluate_clip_creative_quality(
        clip_id=req.clip_id,
        source_asset_id=req.source_asset_id,
        start_sec=req.start_sec,
        end_sec=req.end_sec,
        transcript_segments=analysis.full_transcript,
    )
