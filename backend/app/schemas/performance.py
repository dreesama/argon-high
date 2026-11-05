from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field

# Approvals
class ApprovalCreateRequest(BaseModel):
    clip_id: str
    decision: Literal["approved", "rejected", "revision_requested"]
    notes: str = Field(..., min_length=3)
    workspace_id: Optional[str] = None

class ApprovalRecordResponse(BaseModel):
    id: str
    workspace_id: str
    clip_id: str
    decision: str
    reviewer_id: str
    reviewer_name: str
    notes: str
    created_at_iso: str

# Publications
class PublicationCreateRequest(BaseModel):
    clip_id: str
    campaign_id: Optional[str] = None
    platform: Literal["tiktok", "youtube_shorts", "instagram_reels", "x_video"]
    publication_url: str = Field(..., min_length=10)
    platform_post_id: Optional[str] = None
    workspace_id: Optional[str] = None

class PublicationRecordResponse(BaseModel):
    id: str
    workspace_id: str
    clip_id: str
    campaign_id: Optional[str] = None
    platform: str
    publication_url: str
    status: str
    platform_post_id: Optional[str] = None
    published_at_iso: str

# Performance Snapshots (Financial Ledger with 4-Tier Revenue States)
class PerformanceSnapshotCreateRequest(BaseModel):
    publication_id: str
    clip_id: str
    campaign_id: str
    views_count: int = Field(ge=0)
    reported_views_count: Optional[int] = Field(default=None, ge=0)
    verified_views_count: int = Field(default=0, ge=0)
    confirmed_eligible_views_count: Optional[int] = Field(default=None, ge=0)
    cpm_usd: Optional[float] = Field(default=5.0, ge=0.0)
    payout_cap_usd: Optional[float] = Field(default=1500.0, ge=0.0)
    production_hours: Optional[float] = Field(default=None, ge=0.0)
    platform_fees_usd: float = Field(default=0.0, ge=0.0)
    production_cost_usd: float = Field(default=0.0, ge=0.0)
    actually_received_usd: Optional[float] = Field(default=None, ge=0.0)
    payment_voucher_code: Optional[str] = None
    reconciled: bool = False
    notes: Optional[str] = None
    workspace_id: Optional[str] = None

class PerformanceSnapshotResponse(BaseModel):
    id: str
    workspace_id: str
    publication_id: str
    clip_id: str
    campaign_id: str
    views_count: int
    reported_views_count: int = 0
    verified_views_count: int
    confirmed_eligible_views_count: int = 0
    cpm_usd: float
    payout_cap_usd: float
    estimated_revenue_usd: float
    reported_revenue_usd: float = 0.0
    confirmed_payable_usd: float = 0.0
    actually_received_usd: float = 0.0
    verified_payout_usd: float
    platform_fees_usd: float
    production_cost_usd: float
    net_profit_usd: float
    production_hours: Optional[float] = None
    earnings_per_hour_usd: Optional[float] = None
    earnings_per_hour_display: str = "N/A"
    reconciled: bool
    snapshot_at_iso: str
    notes: Optional[str] = None

class PerformanceAggregatedSummary(BaseModel):
    workspace_id: str
    total_publications: int
    total_views: int
    total_reported_views: int = 0
    total_verified_views: int
    total_confirmed_eligible_views: int = 0
    total_estimated_revenue_usd: float
    total_reported_revenue_usd: float = 0.0
    total_confirmed_payable_usd: float = 0.0
    total_actually_received_usd: float = 0.0
    total_verified_payout_usd: float
    total_platform_fees_usd: float
    total_production_cost_usd: float
    total_net_profit_usd: float
    average_cpm_usd: float
    total_production_hours: float
    overall_earnings_per_hour_usd: Optional[float] = None
    overall_earnings_per_hour_display: str = "N/A"
    reconciliation_status: str

# Payouts (Bank Disbursements & Payment Receipts)
class PayoutCreateRequest(BaseModel):
    campaign_id: str
    amount_usd: float = Field(gt=0.0)
    effective_cpm_usd: float = Field(ge=0.0)
    verified_views_counted: int = Field(ge=0)
    reference_code: str = Field(..., min_length=3)
    verification_state: Literal["estimated-projected", "accrued-unsettled", "campaign-confirmed", "verified-paid"] = "verified-paid"
    clip_id: Optional[str] = None
    publication_id: Optional[str] = None
    payment_voucher: Optional[Dict[str, Any]] = None
    workspace_id: Optional[str] = None

class PayoutRecordResponse(BaseModel):
    id: str
    workspace_id: str
    campaign_id: str
    clip_id: Optional[str] = None
    publication_id: Optional[str] = None
    amount_usd: float
    effective_cpm_usd: float
    verified_views_counted: int
    verification_state: str
    reference_code: str
    payment_voucher: Dict[str, Any] = {}
    disbursed_at_iso: str
    created_at_iso: str
