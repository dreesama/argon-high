# ARGON HIGH — SPRINT 5 IMPLEMENTATION DESIGN: OPERATIONAL VALIDATION & REVENUE PILOT

> **Document Version:** 1.0.0  
> **Target Environment:** Python 3.12, SQLite 3 (WAL mode) / PostgreSQL 16 (Supabase), React 19, Vite 8, Tailwind CSS v4, FFmpeg 7.1.1  

---

## 1. Architectural Architecture & Scope

Sprint 5 transitions Argon High into an operationally verified, revenue-ready private clipping engine with:
1. Complete resource-level workspace authorization across 100% of API endpoints.
2. Comprehensive database schema coverage (adding relational `clips`, `payouts`, and 4-tier revenue records).
3. Production PostgreSQL / Supabase migration script with battle-tested Row Level Security (RLS) policies.
4. Token expiration enforcement and private authenticated media streaming.
5. 5 realistic production campaigns with rigorous brief rules, duration constraints, and platform terms.
6. Honest 4-tier financial accounting (Estimated, Operator-Reported, Campaign-Confirmed, Actually Received) with zero-hour `"N/A"` protection.
7. Automated database backup / WAL checkpointing routine.

```
+--------------------------------------------------------------------------------------------------+
|                                  ARGON HIGH SPRINT 5 ARCHITECTURE                                |
|                                                                                                  |
|   [React 19 / Vite 8 UI Desk]                                                                    |
|        |                                                                                         |
|        +---- Bearer Token + X-Workspace-Id + Signed Short-Lived Tokens                            |
|        v                                                                                         |
|   [FastAPI Core Gateway]                                                                         |
|        |                                                                                         |
|        +---> [auth.py]: Strict server-side user token lookup + workspace_members lookup          |
|        |                                                                                         |
|        +---> [Resource Boundary Guard]: Every endpoint checks:                                   |
|        |     - source.workspace_id == current_user.workspace_id                                  |
|        |     - job.workspace_id == current_user.workspace_id                                     |
|        |     - campaign.workspace_id == current_user.workspace_id                                |
|        |     - report.workspace_id == current_user.workspace_id                                  |
|        |     - token_expires_at > now()                                                          |
|        |                                                                                         |
|        +---> [Database Engine]:                                                                  |
|        |     - Local: SQLite 3 WAL (argon_operations.db) with 13 tables + automated backup       |
|        |     - Staging: PostgreSQL 16 / Supabase with Row Level Security (RLS) policies          |
|        |                                                                                         |
|        +---> [4-Tier Financial Ledger]:                                                          |
|              1. Estimated Revenue (views * CPM)                                                  |
|              2. Operator-Reported Revenue (portal claim)                                         |
|              3. Campaign-Confirmed Payable Revenue (sponsor audited)                             |
|              4. Actually Received Payouts (settled in bank/escrow with voucher)                  |
|              * EPH = Net Profit / Hours (Displays 'N/A' when hours are 0 or null)                |
+--------------------------------------------------------------------------------------------------+
```

---

## 2. Expanded Schema Design

### SQLite & PostgreSQL Normalized Tables
1. `workspaces`: Tenant workspace records, tiers, and limits.
2. `users`: Verified operators and administrative accounts.
3. `workspace_members`: Role-based multi-tenant authorization (`owner`, `admin`, `operator`, `reviewer`).
4. `campaigns`: Persisted sponsor campaigns, contract CPMs, and caps.
5. `campaign_rules`: Extracted and human-corrected editorial requirements.
6. `source_assets`: Uploaded video metadata, inspection JSON, and storage paths.
7. `clips`: Explicit relational table tracking clip candidates (`id`, `workspace_id`, `source_asset_id`, `campaign_id`, `title`, `start_sec`, `end_sec`, `hook_score`, `caption_preset`, `crop_mode`, `review_status`, `render_status`, `created_at_iso`).
8. `processing_jobs`: Background render tickets surviving server restarts.
9. `guard_reports`: Deterministic preflight compliance validation audit logs.
10. `approvals`: Formal operator sign-off logs prior to distribution.
11. `publications`: Syndicated video URLs across TikTok, YouTube Shorts, Reels, and X Video.
12. `performance_snapshots`: 4-tier revenue snapshots and hourly yield metrics.
13. `payouts`: Settlement records with payment vouchers, transaction hashes, and disbursement receipts.

---

## 3. Resource-Level Workspace Authorization Matrix

Every route handler is audited and wrapped with resource-level workspace checks:

| Route | Method | Required Ownership Verification | Failure Response |
| :--- | :---: | :--- | :---: |
| `/api/v1/media/{source_id}/inspect` | GET | `source.workspace_id == user.workspace_id` | `403 Forbidden` |
| `/api/v1/media/{source_id}/stream` | GET | Signed token or `source.workspace_id == user.workspace_id` | `403 Forbidden` / `401 Unauthorized` |
| `/api/v1/intelligence/transcribe-and-rank` | POST | `source.workspace_id == user.workspace_id` | `403 Forbidden` |
| `/api/v1/intelligence/evaluate-creative-qa` | POST | `source.workspace_id == user.workspace_id` | `403 Forbidden` |
| `/api/v1/render/jobs` | POST | `source.workspace_id == user.workspace_id` | `403 Forbidden` |
| `/api/v1/render/jobs/{job_id}` | GET | `job.workspace_id == user.workspace_id` | `403 Forbidden` |
| `/api/v1/render/jobs/{job_id}/cancel` | POST | `job.workspace_id == user.workspace_id` | `403 Forbidden` |
| `/api/v1/render/output/{job_id}/preview` | GET | Valid token, not expired, matching workspace | `403 Forbidden` |
| `/api/v1/render/output/{job_id}/download` | GET | Valid token, not expired, matching workspace | `403 Forbidden` |
| `/api/v1/campaigns/{campaign_id}` | GET | `campaign.workspace_id == user.workspace_id` | `403 Forbidden` |
| `/api/v1/campaigns/{campaign_id}/rules/{rule_id}` | PUT | `campaign.workspace_id == user.workspace_id` | `403 Forbidden` |
| `/api/v1/guard/reports/{report_id}` | GET | `report.workspace_id == user.workspace_id` | `403 Forbidden` |
| `/api/v1/guard/jobs/{job_id}/report` | GET | `report.workspace_id == user.workspace_id` | `403 Forbidden` |
| `/api/v1/guard/reports/{report_id}/attest` | POST | `report.workspace_id == user.workspace_id` | `403 Forbidden` |

---

## 4. 4-Tier Financial Ledger Formulation

1. **Estimated Revenue**:
   $$\text{Estimated Revenue} = \min\left(\text{Cap}, \frac{\text{Views}}{1000} \times \text{CPM}\right)$$
2. **Operator-Reported Revenue**:
   $$\text{Reported Revenue} = \min\left(\text{Cap}, \frac{\text{Reported Views}}{1000} \times \text{CPM}\right)$$
3. **Campaign-Confirmed Payable Revenue**:
   $$\text{Confirmed Payable} = \begin{cases}
   \min\left(\text{Cap}, \frac{\text{Verified Eligible Views}}{1000} \times \text{CPM}\right) & \text{if sponsor audit confirmed} \\
   0.00 & \text{otherwise}
   \end{cases}$$
4. **Actually Received Payments**:
   Sum of vouchers in `payouts` where status is `received` / `settled`.
5. **Fixed-Precision Net Profit**:
   $$\text{Net Profit} = \text{Confirmed Payable} - \text{Platform Fees} - \text{Production Costs}$$
6. **Earnings Per Production Hour (EPH)**:
   $$\text{EPH} = \begin{cases}
   \text{round}\left(\frac{\text{Net Profit}}{\text{Production Hours}}, 2\right) & \text{if Production Hours} > 0 \\
   \text{None} \ (\text{renders as } \text{"N/A"}) & \text{if Production Hours is 0, null, or unavailable}
   \end{cases}$$
