# Argon High — Sprint 4 Implementation Plan: Private Beta & Real Operations

**Platform:** Argon High — Enterprise AI Clipping Desk & Campaign Analytics  
**Date:** November 4, 2026  
**Status:** **APPROVED FOR IMPLEMENTATION**  

---

## 1. Relational Database Architecture (`argon_operations.db`)

To ensure durable persistence that survives application restarts without requiring external unconfigured cloud services, Argon High implements an ACID-compliant, WAL-enabled relational database engine matching the Supabase PostgreSQL schema:

### Tables:
1. `workspaces`: Tenant workspace records, tier, compute budgets.
2. `users`: Operator accounts with authentication credentials and roles.
3. `workspace_members`: User-to-workspace mapping (`user_id`, `workspace_id`, `role`, `joined_at`).
4. `campaigns`: Ingested sponsor briefs, budgets, payout caps, and duration bounds.
5. `campaign_rules`: Granular extracted rules with evidence quotes and human-modified state.
6. `source_assets`: Uploaded long-form videos with FFprobe metadata, authorization proof, and file paths.
7. `clips`: Extracted clip ranges, hook scores, 7-factor virality breakdown, crop mode, and status.
8. `processing_jobs`: Background render tickets, output files, burned captions, and download tokens.
9. `guard_reports`: Pre-flight compliance validation reports with deterministic and editorial checks.
10. `approvals`: Formal multi-stage operator signoff records with decision notes and timestamps.
11. `publications`: Platform syndication records with real live URLs (TikTok, YouTube Shorts, Reels, X Video).
12. `performance_snapshots`: Fixed-precision financial ledger recording views, verified views, revenue, platform fees, production costs, net profit, and hourly production yield.

---

## 2. Hardened Server-Side Authentication & Authorization

### The Security Rule:
**"No authorization based solely on `X-Workspace-Id` or a user-supplied workspace identifier."**

### Verification Logic:
1. Caller provides `Authorization: Bearer <token>`.
2. Server validates the token against registered operator accounts:
   - Primary syndicate operator (`usr-operator-01`)
   - Compliance officer (`usr-compliance-02`)
   - Test reviewer (`usr-reviewer-03`)
3. Server resolves the user's verified workspace memberships from `workspace_members`.
4. If the request requests access to a workspace (via `X-Workspace-Id`, URL param, or body payload):
   - Server verifies: `target_workspace_id in user_workspace_memberships`.
   - If user does not belong to `target_workspace_id`, immediately return `403 Forbidden: Cross-tenant access denied`.
5. If no target workspace is requested, default to the user's primary assigned workspace.

---

## 3. Financial Analytics Engine (Performance Lab V2)

### Fixed-Precision Formulas:
- **Estimated Revenue**:
  $$\text{Est. Revenue} = \min\left(\text{Payout Cap}, \frac{\text{Estimated Views}}{1,000} \times \text{CPM}\right)$$
- **Verified Revenue**:
  $$\text{Verified Revenue} = \min\left(\text{Payout Cap}, \frac{\text{Verified Views}}{1,000} \times \text{CPM}\right)$$
- **Net Profit**:
  $$\text{Net Profit} = \text{Verified Revenue} - \text{Platform Fees} - \text{Production Costs}$$
- **Earnings Per Production Hour (EPH)**:
  $$\text{EPH} = \frac{\text{Net Profit}}{\max(0.1, \text{Production Hours})}$$

All values are calculated with exact 2-decimal fixed precision to prevent floating-point drift. Unverified view counts are strictly marked unverified until operator reconciliation.

---

## 4. Full Operator Lifecycle API Routes

- `POST /api/v1/auth/me`: Authenticates user and returns verified workspace memberships.
- `GET /api/v1/workspaces`: Lists user's authorized workspaces.
- `POST /api/v1/approvals`: Submits an approval or rejection decision with reviewer audit trail.
- `GET /api/v1/approvals/clip/{clip_id}`: Retrieves approval history for a clip.
- `POST /api/v1/publications`: Records a syndicated publication with live platform URL.
- `GET /api/v1/publications`: Lists publications for the workspace.
- `POST /api/v1/performance/snapshots`: Records view snapshots and computes financial ledger metrics.
- `GET /api/v1/performance/summary`: Returns aggregated campaign ROI, net profits, and production yields.
