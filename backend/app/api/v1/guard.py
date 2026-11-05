from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, status

from ...core.auth import AuthenticatedUser, get_current_user
from ...core.logging import logger
from ...schemas.guard import (
    GuardValidationRequest,
    GuardValidationReport,
    RuleAttestationRequest,
)
from ...services.guard_service import guard_service

router = APIRouter(prefix="/guard", tags=["Argon Guard V2 Pre-Flight Compliance Engine"])

@router.post("/validate-clip", response_model=GuardValidationReport, status_code=status.HTTP_200_OK)
async def validate_clip_compliance(
    req: GuardValidationRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Runs genuine FFprobe/FFmpeg pre-flight validation on the actual rendered vertical MP4:
    checks resolution (1080x1920), 9:16 aspect ratio, H.264 codec, AAC audio, duration bounds,
    framerate, file integrity, burned captions, and separates deterministic checks from human editorial review.
    """
    try:
        report = guard_service.validate_clip_render(
            job_id=req.job_id,
            campaign_id=req.campaign_id,
            clip_id=req.clip_id,
            workspace_id=current_user.workspace_id or req.workspace_id,
        )
        return report
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(fnf))
    except ValueError as val_err:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(val_err))
    except Exception as e:
        logger.error(f"Guard validation failed unexpectedly: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Validation failed: {str(e)}")

@router.get("/reports/{report_id}", response_model=GuardValidationReport)
async def get_guard_report(
    report_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    report = guard_service.get_report(report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if report.workspace_id and report.workspace_id not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to Guard report in workspace '{report.workspace_id}'.",
        )
    return report

@router.get("/jobs/{job_id}/report", response_model=GuardValidationReport)
async def get_report_for_job(
    job_id: str,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    report = guard_service.get_report_for_job(job_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"No Guard report found for job '{job_id}'")
    if report.workspace_id and report.workspace_id not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to Guard report in workspace '{report.workspace_id}'.",
        )
    return report

@router.post("/reports/{report_id}/attest", response_model=GuardValidationReport)
async def submit_rule_attestation(
    report_id: str,
    attestation: RuleAttestationRequest,
    current_user: AuthenticatedUser = Depends(get_current_user),
):
    """
    Human operator attestation endpoint: allows operators to attest prohibited topics,
    source content licensing, or disclosures to move clip toward export-ready status.
    """
    report = guard_service.get_report(report_id)
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    if report.workspace_id and report.workspace_id not in current_user.authorized_workspaces:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: Access denied to Guard report in workspace '{report.workspace_id}'.",
        )
    updated = guard_service.attest_rule(report_id, attestation)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Check '{attestation.check_id}' not found in report")
    return updated
