from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class TrimRecommendation(BaseModel):
    suggested_start_sec: float
    suggested_end_sec: float
    adjustment_reason: str
    confidence: float

class CreativeQAReport(BaseModel):
    clip_id: str
    source_asset_id: str
    start_sec: float
    end_sec: float
    duration_sec: float
    awkward_start_detected: bool = False
    awkward_start_reason: Optional[str] = None
    awkward_ending_detected: bool = False
    awkward_ending_reason: Optional[str] = None
    excessive_silence_detected: bool = False
    silence_ratio_pct: float = 0.0
    subtitle_overflow_risk: bool = False
    max_words_per_second: float = 0.0
    framing_stability_score: int = Field(default=92, ge=0, le=100)
    suggested_adjustments: Optional[TrimRecommendation] = None
    editorial_warnings: List[str] = Field(default_factory=list)
    heuristic_model_disclaimer: str = (
        "Retention predictions, hook velocity, and virality scores are experimental algorithmic heuristics "
        "designed for operator triage. They are not guaranteed predictors of social platform distribution."
    )
