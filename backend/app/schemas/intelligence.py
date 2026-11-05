from typing import List, Optional
from pydantic import BaseModel, Field

class TranscriptWordSchema(BaseModel):
    word: str
    start_sec: float
    end_sec: float
    probability: float = Field(default=1.0, ge=0.0, le=1.0)

class TranscriptSegmentSchema(BaseModel):
    id: str
    speaker: str = "Speaker 1"
    start_sec: float
    end_sec: float
    text: str
    confidence_pct: float = Field(default=95.0, ge=0.0, le=100.0)
    no_speech_prob: float = Field(default=0.02, ge=0.0, le=1.0)
    energy_score: int = Field(default=80, ge=0, le=100)
    keywords: List[str] = Field(default_factory=list)
    words: List[TranscriptWordSchema] = Field(default_factory=list)

class HookBreakdownSchema(BaseModel):
    opening_velocity: int = Field(default=85, ge=0, le=100)
    controversy_or_insight_delta: int = Field(default=80, ge=0, le=100)
    retention_cadence: int = Field(default=88, ge=0, le=100)
    sponsor_alignment: int = Field(default=90, ge=0, le=100)
    explanation: str

class SevenFactorBreakdown(BaseModel):
    opening_hook_strength: int = Field(default=88, ge=0, le=100)
    standalone_context_clarity: int = Field(default=85, ge=0, le=100)
    emotional_curiosity_intensity: int = Field(default=82, ge=0, le=100)
    narrative_completeness: int = Field(default=90, ge=0, le=100)
    speech_pacing_wpm: int = Field(default=145, ge=0, le=350)
    campaign_relevance: int = Field(default=92, ge=0, le=100)
    duration_compliance: int = Field(default=95, ge=0, le=100)
    heuristic_explanation: str = "Heuristic score derived from lexical analysis, speech velocity, and sentence boundary snapping."

class CandidateTimestampRange(BaseModel):
    candidate_id: str
    rank: int
    title: str
    start_sec: float
    end_sec: float
    duration_sec: float
    hook_score: int = Field(default=85, ge=0, le=100)
    hook_breakdown: HookBreakdownSchema
    seven_factor_breakdown: SevenFactorBreakdown
    transcript_excerpt: str
    primary_keywords: List[str] = Field(default_factory=list)
    suggested_crop_mode: str = "split-screen-podcast"
    suggested_caption_preset: str = "kinetic-lime"
    snapped_to_sentence_boundary: bool = True

class TranscriptionAnalysisResponse(BaseModel):
    source_asset_id: str
    full_transcript: List[TranscriptSegmentSchema]
    total_segments: int
    duration_sec: float
    candidates: List[CandidateTimestampRange]
    detected_language: str = "en"
    acoustic_energy_average: float = 78.4
    model_name: str = "faster-whisper-tiny-en"
    is_real_ai_inference: bool = True
    silence_ratio_pct: float = 8.5
    diarization_status: str = "Single-speaker model (multi-speaker PyAnnote token optional in enterprise tier)"
