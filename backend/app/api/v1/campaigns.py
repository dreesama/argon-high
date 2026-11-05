from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends, status

from ...core.auth import AuthenticatedUser, get_current_user
from ...core.logging import logger
from ...schemas.campaign import (
    CampaignBriefIngestRequest,
    CampaignRecord,
    CampaignRuleUpdateRequest,
)
from ...services.campaign_service import campaign_service

router = APIRouter(prefix="/campaigns", tags=["Campaign Intelligence & Brief Parser"])

@router.post("/ingest-brief", response_model=CampaignRecord, status_code=status.HTTP_201_CREATED)
async def ingest_campaign_brief(
    req: CampaignBriefIngestRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Ingests raw sponsor brief, extracts structured compliance rules, platforms, duration bounds,
    disclosures, and licensing evidence without inventing unstated defaults.
    """
    # Enforce workspace scoping
    req.workspace_id = current_user.workspace_id or req.workspace_id
    record = campaign_service.ingest_brief(req)
    return record

@router.get("", response_model=List[CampaignRecord])
async def list_campaigns(
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Lists campaigns belonging to the authenticated operator's workspace.
    """
    return campaign_service.list_campaigns(workspace_id=current_user.workspace_id)

@router.get("/{campaign_id}", response_model=CampaignRecord)
async def get_campaign(
    campaign_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Retrieves campaign brief details, structured extracted rules, evidence quotes, and unknown fields.
    """
    camp = campaign_service.get_campaign(campaign_id)
    if not camp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign '{campaign_id}' not found.",
        )
    if camp.workspace_id and camp.workspace_id not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to campaign in workspace '{camp.workspace_id}'.",
        )
    return camp

@router.put("/{campaign_id}/rules/{rule_id}", response_model=CampaignRecord)
async def update_campaign_rule(
    campaign_id: str,
    rule_id: str,
    req: CampaignRuleUpdateRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Human operator editing endpoint: allows human verification, value updates, or notes on an extracted rule.
    """
    camp = campaign_service.get_campaign(campaign_id)
    if not camp:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Campaign '{campaign_id}' not found.",
        )
    if camp.workspace_id and camp.workspace_id not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to campaign in workspace '{camp.workspace_id}'.",
        )
    updated = campaign_service.update_rule(campaign_id, rule_id, req)
    if not updated:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Rule '{rule_id}' or campaign '{campaign_id}' not found.",
        )
    return updated
