from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

class VideoStreamMetadata(BaseModel):
    codec_name: str
    width: int
    height: int
    aspect_ratio: str
    fps: float
    duration_sec: float
    bit_rate: Optional[int] = None
    pixel_format: Optional[str] = None

class AudioStreamMetadata(BaseModel):
    codec_name: str
    sample_rate: int
    channels: int
    bit_rate: Optional[int] = None
    lufs: Optional[float] = None

class MediaInspectionResult(BaseModel):
    is_valid: bool
    filename: str
    file_size_bytes: int
    container_format: str
    duration_sec: float
    video_stream: Optional[VideoStreamMetadata] = None
    audio_stream: Optional[AudioStreamMetadata] = None
    compliance_aspect_ratio_ok: bool
    compliance_duration_ok: bool
    warnings: List[str] = Field(default_factory=list)
    raw_probe: Optional[Dict[str, Any]] = None

class MediaUploadResponse(BaseModel):
    source_asset_id: str
    workspace_id: str
    campaign_id: str
    title: str
    filename: str
    file_size_bytes: int
    duration_sec: float
    resolution: str
    fps: float
    audio_lufs: float
    inspection: MediaInspectionResult
    authorization_proof: str
