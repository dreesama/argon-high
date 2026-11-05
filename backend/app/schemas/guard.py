from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field

ComplianceCheckStatus = Literal["PASS", "FAIL", "WARNING", "UNKNOWN", "HUMAN_REVIEW_REQUIRED"]
CheckCategory = Literal["deterministic_file", "heuristic_visual", "editorial_attestation"]

class ComplianceCheckItem(BaseModel):
    check_id: str
    category: CheckCategory
    title: str
    description: str
    status: ComplianceCheckStatus
    measured_value: Optional[Any] = None
    expected_value: Optional[Any] = None
    is_blocking: bool = True
    evidence: Optional[str] = None
    reviewer_notes: Optional[str] = None
    attested_by: Optional[str] = None
    attested_at_iso: Optional[str] = None

class GuardValidationRequest(BaseModel):
    job_id: str
    campaign_id: Optional[str] = None
    clip_id: Optional[str] = None
    workspace_id: str = "ws-argon-core"

class RuleAttestationRequest(BaseModel):
    check_id: str
    attestation_status: Literal["PASS", "FAIL"]
    reviewer_notes: str = Field(..., min_length=3)
    attested_by: str = "Lead Operator"

class GuardValidationReport(BaseModel):
    report_id: str
    job_id: str
    clip_id: Optional[str] = None
    campaign_id: Optional[str] = None
    workspace_id: str = "ws-argon-core"
    overall_status: Literal["PASS", "FAIL", "REQUIRES_REVIEW"]
    is_export_ready: bool
    summary: str
    checks: List[ComplianceCheckItem] = Field(default_factory=list)
    total_checks: int
    passed_count: int
    failed_count: int
    warning_count: int
    unknown_count: int
    review_required_count: int
    validated_at_iso: str
    compliance_disclaimer: str = (
        "Argon Guard V2 certifies technical file integrity and deterministic stream parameters. "
        "Editorial context, licensing, and sponsor brief adherence require human operator attestation."
    )
