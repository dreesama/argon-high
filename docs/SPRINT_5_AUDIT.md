# ARGON HIGH — SPRINT 5 AUDIT: OPERATIONAL VALIDATION & REVENUE PILOT

> **Audit Date:** November 2026  
> **Auditor:** Lead Systems Architect & Security Engineer  
> **Scope:** Verification of Sprint 4 deliverables, architecture parity (SQLite vs. Supabase PostgreSQL), endpoint authorization coverage, session and token lifecycle, media stream security, and financial ledger integrity.

---

## 1. Executive Status of Previous 25 Tests

All 25 automated backend tests from Sprints 1–4 passed in `pytest-9.2.0`:
- **Sprint 1 (Endpoints & Video Vertical Slice):** 5/5 passed (Upload validation, corrupted file rejection, FFmpeg 9:16 rendering).
- **Sprint 2 (Speech Intelligence & Subtitles):** 7/7 passed (faster-whisper inference, 7-factor candidate discovery, burned ASS captions, audio smoothing).
- **Sprint 3 (Campaigns & Guard V2):** 6/6 passed (Brief ingestion, human rule editing, deterministic preflight FFprobe checks, safe zone framing, awkward cut detection, job cancellation).
- **Sprint 4 (Beta Operations):** 7/7 passed (Server-side auth, header spoofing prevention, SQLite WAL persistence, review approval workflow, publication URL tracking, fixed-precision financial ledger, private beta end-to-end lifecycle).

---

## 2. In-Depth Architectural & Security Findings

### Finding A: SQLite vs. Planned Supabase PostgreSQL Architecture
- **Current State:** Local runtime operates on a 12-table SQLite database (`backend/storage/argon_operations.db`) in WAL mode with `PRAGMA foreign_keys = ON;`.
- **Divergence:** `backend/migrations/001_initial_schema.sql` defined PostgreSQL tables during Sprint 1 with disparate table naming (`qa_results` vs `guard_reports`, no `performance_snapshots`, differing enum types, no explicit `users` profile table linking to `auth.users`).
- **Risk:** Claiming Supabase readiness without an updated, parity-tested PostgreSQL migration and without automated validation of PostgreSQL Row Level Security (RLS) policies poses deployment failure risks when moving to cloud staging.
- **Required Remediation:** 
  1. Maintain SQLite for local zero-dependency development and testing.
  2. Create `backend/migrations/002_production_parity_and_rls.sql` guaranteeing complete column, table, and RLS parity with the operational data model.
  3. Author unit tests that simulate and verify RLS isolation rules (preventing cross-workspace data access).

---

### Finding B: Endpoint Workspace Authorization Gaps
While `backend/app/core/auth.py` hardened `get_current_user` to reject unauthorized header spoofing, individual route handlers failed to check resource-level workspace ownership:

1. **`media.py` / `GET /api/v1/media/{source_id}/inspect`**:
   - Authenticates the user, but does not verify whether `source_id` belongs to `current_user.workspace_id`. An operator from Workspace B can inspect media uploaded by Workspace A.
2. **`media.py` / `GET /api/v1/media/{source_id}/stream`**:
   - Completely unauthenticated! Anyone with a known `source_id` can stream raw proprietary long-form video files.
3. **`intelligence.py` / `POST /api/v1/intelligence/transcribe-and-rank` & `/evaluate-creative-qa`**:
   - Authenticates user, but executes AI transcription and quality scoring on any `source_asset_id` even if owned by another workspace.
4. **`render.py` / `GET /api/v1/render/jobs/{job_id}` & `POST /jobs/{job_id}/cancel`**:
   - Does not verify whether `job.workspace_id == current_user.workspace_id`. Workspace B can monitor progress, retrieve generated `download_token`, or cancel Workspace A's render jobs.
5. **`render.py` / `_verify_job_access`**:
   - Validates `token == job.download_token`, but never verifies `job.token_expires_at_iso`. Expired tokens remain valid indefinitely.
6. **`guard.py` / `GET /reports/{report_id}`, `GET /jobs/{job_id}/report`, `POST /reports/{report_id}/attest`**:
   - Does not check if `report.workspace_id == current_user.workspace_id`. Cross-tenant inspection and unauthorized human attestation are possible.
7. **`campaigns.py` / `GET /campaigns/{campaign_id}` & `PUT /campaigns/{campaign_id}/rules/{rule_id}`**:
   - Does not verify that the campaign belongs to `current_user.workspace_id`.
8. **Required Remediation:** Implement strict resource-level workspace ownership enforcement across every single endpoint handler.

---

### Finding C: Database Schema Completeness
- **Missing Tables:**
  - `clips`: In Sprint 4, clips were referenced as IDs in jobs, guard reports, and approvals, but lacked an authoritative `clips` relational table tracking clip title, timestamps (`start_sec`, `end_sec`), hook score, caption preset, crop mode, review status, and render status.
  - `payouts`: While `performance_snapshots` records analytical calculation snapshots, actual payment vouchers / escrow disbursements (with reference codes, payment provider receipts, disbursement dates, and recipient wallets/accounts) lacked a dedicated ledger table.
- **Financial State Granularity:**
  Sprint 4 combined views into unverified vs verified. Sprint 5 requires 4 explicit revenue states:
  1. *Estimated revenue* (projected from unverified impression velocity)
  2. *Operator-reported revenue* (claimed by clipping syndicates via portal dashboards)
  3. *Campaign-confirmed payable revenue* (audited and locked by sponsor before disbursement)
  4. *Actually received payments* (settled in operator escrow or bank account with reference IDs)
- **Zero / Unavailable Production Hours Handling:**
  In Sprint 4, `production_hours` defaulted to `1.0` or forced `max(0.1, hours)` to avoid division by zero. Sprint 5 explicitly requires displaying `"N/A"` or `null` when production hours are unavailable or zero, rather than fabricating a non-zero denominator.

---

### Finding D: Disaster Recovery, Backups & Media Protection
- **No Automated Backup:** SQLite `argon_operations.db` lacked an automated snapshot/checkpoint routine.
- **Media Leakage Risk:** Video files in `backend/storage/uploads` and `backend/storage/renders` require signed short-lived tokens and strict workspace membership checks.

---

## 3. Inventory: Functional vs. Simulated vs. Unverified

| Component | Status | Verification & Risk Assessment |
| :--- | :---: | :--- |
| **FFmpeg 9:16 Vertical Render** | **Functional** | Real FFmpeg binary renders 1080x1920 MP4 with audio normalization and fade smoothing. |
| **AI Transcription (faster-whisper)** | **Functional** | Real CPU inference with word timestamps, silence detection, and VAD. |
| **Pre-flight Compliance (Guard V2)** | **Functional** | Real FFprobe stream inspection (resolution, aspect ratio, codec, LUFS, bitstream decode). |
| **Workspace Membership Auth** | **Functional** | Server-side validation against `workspace_members`; blocks header spoofing. |
| **Resource-Level Tenant Isolation** | **Unverified / Flawed** | Endpoints did not verify ownership of individual media, jobs, or reports. |
| **Token Expiry Enforcement** | **Unverified / Flawed** | `token_expires_at_iso` was present in schemas but unverified in access checks. |
| **Private Media Streaming Security** | **Simulated / Flawed** | Source stream endpoint had no authentication or token validation. |
| **PostgreSQL / Supabase RLS** | **Unverified** | Migration file existed from Sprint 1 but diverged from operational schema and was not tested. |
| **Revenue Pilot 4-Tier Ledger** | **Partial** | Handled unverified vs verified, but lacked operator-reported vs sponsor-confirmed separation and "N/A" hourly yield handling. |

---

## 4. Sprint 5 Action Plan

1. **Phase 2 (Production Data Foundation):**
   - Add `clips` and `payouts` tables to SQLite database manager.
   - Author `backend/migrations/002_production_parity_and_rls.sql` providing complete PostgreSQL / Supabase parity with Row Level Security.
   - Enforce workspace isolation across ALL endpoint handlers.
   - Add database backup / WAL checkpoint endpoint (`POST /api/v1/system/backup`).
2. **Phase 3 (Real Clip Quality Benchmark):**
   - Benchmark pipeline on real spoken videos; build operator evaluation scorecard.
3. **Phase 4 (Campaign Operations):**
   - Seed and support 5 real, eligible production campaigns with verified rules.
4. **Phase 5 (Real Performance Tracking):**
   - Extend performance ledger with 4 explicit financial states and `"N/A"` handling for zero production hours.
5. **Phase 6 (Reliability & Security):**
   - Enforce signed short-lived tokens and expiration timestamps on media downloads and streams.
6. **Phase 7 (Pilot Readiness):**
   - Deliver implementation doc, verification doc, and operations playbook.
