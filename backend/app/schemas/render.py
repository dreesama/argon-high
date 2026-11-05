from typing import Optional, Dict, Any
from pydantic import BaseModel, Field

class RenderJobCreate(BaseModel):
    source_asset_id: str
    clip_id: Optional[str] = None
    campaign_id: Optional[str] = "cmp-argon-flagship"
    workspace_id: str = "ws-argon-core"
    idempotency_key: Optional[str] = None
    title: Optional[str] = "Vertical 9:16 Render"
    start_sec: float = Field(ge=0.0)
    end_sec: float = Field(gt=0.0)
    target_width: int = 1080
    target_height: int = 1920
    crop_mode: str = "split-screen-podcast"
    face_track_offset_x: int = 0
    burn_captions: bool = True
    caption_preset: str = "kinetic-lime"
    include_watermark: bool = True
    watermark_text: Optional[str] = "ARGON HIGH VERIFIED"
    normalize_audio_lufs: bool = True
    fade_audio: bool = True
    codec: str = "libx264"

class RenderOutputInspection(BaseModel):
    is_valid_mp4: bool
    width: int
    height: int
    aspect_ratio: str
    duration_sec: float
    video_codec: str
    audio_codec: str
    file_size_bytes: int
    bit_rate: Optional[int] = None

class RenderJobStatus(BaseModel):
    job_id: str
    clip_id: Optional[str] = None
    workspace_id: str = "ws-argon-core"
    status: str  # queued, processing, completed, failed, cancelled
    progress_pct: int
    started_at_iso: Optional[str] = None
    completed_at_iso: Optional[str] = None
    duration_sec: float
    output_filename: Optional[str] = None
    output_inspection: Optional[RenderOutputInspection] = None
    burned_captions_preset: Optional[str] = None
    download_token: Optional[str] = None
    token_expires_at_iso: Optional[str] = None
    error_message: Optional[str] = None
    cancellation_reason: Optional[str] = None
    download_url: Optional[str] = None
    preview_url: Optional[str] = None
