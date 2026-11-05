from datetime import datetime, timezone
from typing import Optional, List, Callable
from fastapi import Header, HTTPException, status, Depends
from pydantic import BaseModel
from .config import settings
from .logging import logger
from ..db.database import db_manager

# Role permission hierarchy
ROLE_HIERARCHY = {
    "owner": ["owner", "admin", "operator", "reviewer", "viewer"],
    "admin": ["admin", "operator", "reviewer", "viewer"],
    "operator": ["operator", "viewer"],
    "reviewer": ["reviewer", "viewer"],
    "viewer": ["viewer"],
}

class AuthenticatedUser(BaseModel):
    user_id: str
    workspace_id: str
    role: str
    email: Optional[str] = None
    authorized_workspaces: List[str] = []
    permissions: List[str] = []

async def get_current_user(
    authorization: Optional[str] = Header(None),
    x_workspace_id: Optional[str] = Header(None),
) -> AuthenticatedUser:
    """
    Hardened Server-Side Authentication & Workspace-Level Membership Authorization.
    Enforces strict token validation and verifies that NO authorization is granted
    based solely on client-supplied X-Workspace-Id or hard-coded fallback aliases.
    """
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header. Use 'Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )

    parts = authorization.strip().split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        token = parts[1]
    elif len(parts) == 1 and not parts[0].lower().startswith("bearer"):
        token = parts[0]
    else:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authorization header format. Use 'Bearer <token>'",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not token or len(token) < 8:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or empty bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Authoritative User Lookup by Token in Database
    user_record = db_manager.get_user_by_token(token)
    if not user_record:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired bearer token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Enforce session token expiration lifecycle
    token_expires_at = user_record.get("token_expires_at_iso")
    if token_expires_at:
        try:
            exp_dt = datetime.fromisoformat(token_expires_at)
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > exp_dt:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Unauthorized: User session token has expired. Please re-authenticate.",
                    headers={"WWW-Authenticate": "Bearer"},
                )
        except HTTPException:
            raise
        except Exception as parse_err:
            logger.warning(f"Failed to parse user session expiration timestamp: {parse_err}")

    user_id = user_record["id"]

    # 2. Resolve Verified Workspace Memberships from Database
    memberships = db_manager.get_user_workspaces(user_id)
    if not memberships:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Forbidden: User '{user_id}' has no verified workspace memberships.",
        )

    authorized_workspace_ids = [m["id"] for m in memberships]

    # 3. Strict Target Workspace Membership Check
    if x_workspace_id:
        if x_workspace_id not in authorized_workspace_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: User '{user_id}' is not a member of requested workspace '{x_workspace_id}'. Cross-tenant access denied.",
            )
        effective_workspace_id = x_workspace_id
    else:
        effective_workspace_id = authorized_workspace_ids[0]

    # Determine user role within the effective workspace
    role = next(
        (m.get("role", "operator") for m in memberships if m["id"] == effective_workspace_id),
        user_record.get("system_role", "operator")
    )

    permissions = ROLE_HIERARCHY.get(role, ["viewer"])

    return AuthenticatedUser(
        user_id=user_id,
        workspace_id=effective_workspace_id,
        role=role,
        email=user_record.get("email"),
        authorized_workspaces=authorized_workspace_ids,
        permissions=permissions,
    )

def require_role(*required_roles: str) -> Callable:
    """
    Dependency factory that verifies the authenticated user possesses one of the required roles.
    """
    async def role_checker(current_user: AuthenticatedUser = Depends(get_current_user)) -> AuthenticatedUser:
        if current_user.role not in required_roles and "owner" not in current_user.permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Forbidden: Insufficient role permissions. Required one of {list(required_roles)}, your role is '{current_user.role}'.",
            )
        return current_user
    return role_checker
