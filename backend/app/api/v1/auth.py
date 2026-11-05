from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from ...core.auth import AuthenticatedUser, get_current_user
from ...db.database import db_manager

router = APIRouter(prefix="/auth", tags=["Authentication & Workspace Sessions"])

class WorkspaceMembershipInfo(BaseModel):
    id: str
    name: str
    slug: str
    tier: str
    role: str
    joined_at_iso: Optional[str] = None
    compute_credits_balance: Optional[int] = None

class AuthSessionResponse(BaseModel):
    user_id: str
    email: Optional[str] = None
    role: str
    active_workspace_id: str
    workspaces: List[WorkspaceMembershipInfo]

@router.get("/session", response_model=AuthSessionResponse)
@router.get("/me", response_model=AuthSessionResponse)
async def get_session(current_user: AuthenticatedUser = Depends(get_current_user)):
    """
    Returns the authenticated user's authoritative identity and all verified workspace memberships.
    Enforces that tenant memberships are strictly derived from server-side database records.
    """
    raw_workspaces = db_manager.get_user_workspaces(current_user.user_id)
    workspaces = [
        WorkspaceMembershipInfo(
            id=w["id"],
            name=w["name"],
            slug=w["slug"],
            tier=w["tier"],
            role=w.get("role", "operator"),
            joined_at_iso=w.get("joined_at_iso"),
            compute_credits_balance=w.get("compute_credits_balance", 0),
        )
        for w in raw_workspaces
    ]

    return AuthSessionResponse(
        user_id=current_user.user_id,
        email=current_user.email,
        role=current_user.role,
        active_workspace_id=current_user.workspace_id,
        workspaces=workspaces,
    )
