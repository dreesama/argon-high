from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field

class SafeZoneBox(BaseModel):
    name: str
    y_min_px: int
    y_max_px: int
    description: str

class FramingAnalysisResult(BaseModel):
    source_width: int
    source_height: int
    target_width: int = 1080
    target_height: int = 1920
    crop_x: int
    crop_y: int
    crop_width: int
    crop_height: int
    manual_offset_applied: int = 0
    tracking_mode: Literal["auto_face_tracked", "center_safe_area", "manual_calibrated"]
    confidence: float
    framing_stability_score: int = Field(default=95, ge=0, le=100)
    safe_zones: List[SafeZoneBox] = Field(default_factory=list)
    explanation: str

class FramingCalculateRequest(BaseModel):
    source_asset_id: str
    manual_offset_x: int = Field(default=0, ge=-100, le=100)
    crop_mode: str = "split-screen-podcast"
    target_width: int = 1080
    target_height: int = 1920
