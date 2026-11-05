from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status

from ...core.auth import AuthenticatedUser, get_current_user
from ...core.logging import logger
from ...schemas.performance import (
    ApprovalCreateRequest,
    ApprovalRecordResponse,
    PublicationCreateRequest,
    PublicationRecordResponse,
    PerformanceSnapshotCreateRequest,
    PerformanceSnapshotResponse,
    PerformanceAggregatedSummary,
    PayoutCreateRequest,
    PayoutRecordResponse,
)
from ...services.performance_service import performance_service
from ...db.database import db_manager

router = APIRouter(prefix="/performance", tags=["Performance Lab V2 & Financial Analytics"])

# --- Approvals (Review Queue) ---

@router.post("/approvals", response_model=ApprovalRecordResponse, status_code=status.HTTP_201_CREATED)
async def submit_approval_decision(
    req: ApprovalCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Submits a review decision (approved, rejected, revision_requested) with audit notes and reviewer identity.
    Enforces that the clip belongs to the user's authorized workspace.
    """
    target_ws = req.workspace_id or current_user.workspace_id
    if target_ws not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to workspace '{target_ws}'.",
        )

    return performance_service.record_approval(
        req=req,
        user_id=current_user.user_id,
        user_name=current_user.email or "Lead Syndicate Operator",
        workspace_id=target_ws,
    )

@router.get("/approvals/clip/{clip_id}", response_model=List[ApprovalRecordResponse])
async def get_clip_approvals(
    clip_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Retrieves the decision and audit history for a clip candidate within the authorized workspace.
    """
    return performance_service.list_approvals_for_clip(clip_id=clip_id, workspace_id=current_user.workspace_id)

# --- Publications ---

@router.post("/publications", response_model=PublicationRecordResponse, status_code=status.HTTP_201_CREATED)
async def record_publication_url(
    req: PublicationCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Records a live platform publication URL (TikTok, YouTube Shorts, Reels, X Video)
    for an approved and rendered short-form clip.
    """
    target_ws = req.workspace_id or current_user.workspace_id
    if target_ws not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to workspace '{target_ws}'.",
        )

    return performance_service.record_publication(req=req, workspace_id=target_ws)

@router.get("/publications", response_model=List[PublicationRecordResponse])
async def list_workspace_publications(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Lists all active syndicated publications for the authenticated operator's workspace.
    """
    return performance_service.list_publications(workspace_id=current_user.workspace_id)

# --- Performance Snapshots & Ledger ---

@router.post("/snapshots", response_model=PerformanceSnapshotResponse, status_code=status.HTTP_201_CREATED)
async def record_performance_snapshot(
    req: PerformanceSnapshotCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Records view counts and calculates fixed-precision financial ledger metrics:
    estimated revenue, verified payout, platform fees, production costs, net profit,
    and earnings per production hour.
    """
    target_ws = req.workspace_id or current_user.workspace_id
    if target_ws not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to workspace '{target_ws}'.",
        )

    return performance_service.record_snapshot(req=req, workspace_id=target_ws)

@router.get("/snapshots", response_model=List[PerformanceSnapshotResponse])
async def list_performance_snapshots(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Lists historical view and payout snapshots for the workspace.
    """
    return performance_service.list_snapshots(workspace_id=current_user.workspace_id)

@router.get("/summary", response_model=PerformanceAggregatedSummary)
async def get_performance_summary(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Aggregates financial performance metrics, net profit, effective CPM, and hourly production yield.
    """
    return performance_service.get_aggregated_summary(workspace_id=current_user.workspace_id)

# --- Payout Disbursements & Settlement Receipts ---

@router.post("/payouts", response_model=PayoutRecordResponse, status_code=status.HTTP_201_CREATED)
async def record_payout_disbursement(
    req: PayoutCreateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Records an official settlement payout voucher or bank disbursement.
    """
    target_ws = req.workspace_id or current_user.workspace_id
    if target_ws not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to workspace '{target_ws}'.",
        )

    return performance_service.record_payout(req=req, workspace_id=target_ws)

@router.get("/payouts", response_model=List[PayoutRecordResponse])
async def list_workspace_payouts(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Lists all settlement vouchers and disbursed payouts for the workspace.
    """
    return performance_service.list_payouts(workspace_id=current_user.workspace_id)

# --- Operational Backup & Disaster Recovery ---

@router.post("/backup", status_code=status.HTTP_201_CREATED)
async def trigger_database_backup(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Triggers an atomic WAL-checkpointed backup of the relational operations database.
    """
    backup_path = db_manager.backup_database()
    return {
        "status": "success",
        "backup_file": backup_path.name,
        "backup_path": str(backup_path),
        "size_bytes": backup_path.stat().st_size,
        "created_by": current_user.user_id,
        "workspace_id": current_user.workspace_id,
    }
