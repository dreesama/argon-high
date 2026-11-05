from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class ExtractedRuleItem(BaseModel):
    rule_id: str
    category: str = Field(description="platforms | duration | hashtags | mentions | disclosures | prohibited | branding | payout | permissions | approval")
    title: str
    description: str
    value: Any
    evidence_quote: Optional[str] = None
    confidence: float = Field(default=0.9, ge=0.0, le=1.0)
    status: str = Field(default="extracted", description="extracted | human_verified | human_modified | unknown")
    is_mandatory: bool = True
    notes: Optional[str] = None

class CampaignBriefIngestRequest(BaseModel):
    campaign_id: Optional[str] = None
    title: str = Field(..., min_length=2)
    sponsor_name: str = Field(..., min_length=2)
    brief_text: str = Field(..., min_length=10)
    workspace_id: str = "ws-argon-core"
    is_synthetic: bool = False

class CampaignRuleUpdateRequest(BaseModel):
    value: Any
    status: str = "human_modified"
    notes: Optional[str] = None

class CampaignRecord(BaseModel):
    campaign_id: str
    workspace_id: str = "ws-argon-core"
    title: str
    sponsor_name: str
    raw_brief_text: str
    brief_version: int = 1
    extracted_rules: List[ExtractedRuleItem] = Field(default_factory=list)
    eligible_platforms: List[str] = Field(default_factory=list)
    min_duration_sec: Optional[float] = None
    max_duration_sec: Optional[float] = None
    required_hashtags: List[str] = Field(default_factory=list)
    required_mentions: List[str] = Field(default_factory=list)
    required_disclosures: List[str] = Field(default_factory=list)
    prohibited_words: List[str] = Field(default_factory=list)
    prohibited_topics: List[str] = Field(default_factory=list)
    payout_cap_usd: Optional[float] = None
    cpm_usd: Optional[float] = None
    deadline_iso: Optional[str] = None
    licensing_terms: Optional[str] = None
    unknown_fields: List[str] = Field(default_factory=list)
    is_synthetic: bool = False
    created_at_iso: str
    updated_at_iso: str
