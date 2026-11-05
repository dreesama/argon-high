# Argon High — Sprint 4 Security, Database & Operations Audit

**Platform:** Argon High — Intelligence-Driven AI Clipping & Campaign Analytics  
**Date:** November 4, 2026  
**Auditor:** Principal Full-Stack & Security Engineer  
**Status:** **AUDIT COMPLETE — CRITICAL REMEDIATIONS REQUIRED**  

---

## 1. Independent Verification of Existing Pipeline

### Automated Test Suite Baseline
- **Command:** `python -m pytest backend/tests -v`
- **Result:** **18 / 18 Passed** (Execution time: 15.87s)
- **Verified Working Components:**
  - FFprobe container and stream analysis (codecs, framerate, LUFS loudness).
  - Magic byte validation rejecting invalid binaries.
  - Real local speech recognition using `faster-whisper` (`tiny.en`, int8 CPU).
  - 7-Factor virality heuristic scoring with sentence-boundary snapping.
  - Subtitle generation across 3 presets (`kinetic-lime`, `minimal-editorial`, `founder-mono`).
  - FFmpeg 1080×1920 vertical video rendering with burned ASS subtitles and audio smoothing.
  - Structured campaign brief parsing with evidence quotes and unknown field retention.
  - Argon Guard V2 pre-flight deterministic checks and human review attestation.
  - Smart vertical framing with short-form safe zones.
  - Creative QA awkward cut detection.
  - Bounded concurrency with Semaphore and job cancellation.

### Frontend Build Baseline
- **Command:** `npm run build`
- **Result:** **Passed** (Vite v8.3.5, 2,062 modules in 884ms).

---

## 2. Security & Authorization Audit Findings

### Critical Finding 1: Insecure Header-Based Workspace Resolution (`X-Workspace-Id`)
- **Current Implementation:** In `backend/app/core/auth.py`:
  ```python
  workspace_id = x_workspace_id or settings.DEFAULT_WORKSPACE_ID
  ```
- **Vulnerability:** The server accepts `X-Workspace-Id` directly from the client request without validating whether the authenticated user actually has membership in that workspace. An authenticated user in `workspace-A` could set `X-Workspace-Id: workspace-B` and read/write assets belonging to `workspace-B`.
- **Sprint 4 Remediation:**
  - Create a server-side `workspace_members` relational registry.
  - Every user has verified workspace memberships (`user_id`, `workspace_id`, `role`).
  - If a user attempts to access or act within a workspace they are not an active member of, reject immediately with `403 Forbidden: User not a member of target workspace`.
  - Disallow authorization based solely on a client-supplied identifier.

### Critical Finding 2: Ephemeral Media Ingestion (`SOURCE_REGISTRY`)
- **Current Implementation:** In `backend/app/api/v1/media.py`:
  ```python
  SOURCE_REGISTRY: Dict[str, Dict[str, Any]] = {}
  ```
- **Vulnerability:** Uploaded source metadata, titles, sponsor names, and authorization proofs are stored in an in-memory dictionary. If the FastAPI process restarts, `SOURCE_REGISTRY` is wiped clean, breaking `/intelligence/transcribe-and-rank` and `/render/framing/calculate` unless files are scanned from disk.
- **Sprint 4 Remediation:**
  - Migrate all media records to a durable `source_assets` database table.
  - Metadata survives restarts and is scoped to `workspace_id`.

### Critical Finding 3: Media Access Token Expiration
- **Current Implementation:** `download_token` in `RenderJobStatus` was an unbounded string without an explicit cryptographic TTL / expiration timestamp.
- **Sprint 4 Remediation:**
  - Add `token_expires_at_iso` and signed timestamp verification.
  - Reject expired access tokens with `401 Unauthorized` or `403 Forbidden`.

### Critical Finding 4: Supabase Deployment vs Runtime Disconnect
- **Current State:**
  - PostgreSQL schema and RLS policies are documented in `backend/migrations/001_initial_schema.sql`.
  - However, the local backend runtime operates on disparate JSON files (`jobs_db.json`, `campaigns_db.json`, `guard_reports_db.json`) rather than an actual relational database engine.
- **Sprint 4 Remediation:**
  - Implement a unified production SQLite database (`backend/storage/argon_operations.db`) mirroring the Supabase schema, with foreign keys, WAL mode, ACID transactions, and workspace-scoped queries.
  - Provide complete database schema synchronization and a dual adapter supporting local SQLite and remote Supabase PostgREST.

---

## 3. Simulated vs Live Operations Audit

| Feature | Sprint 3 Status | Sprint 4 Target |
| :--- | :--- | :--- |
| **Campaign Brief Ingestion** | Real API + local fallback | Fully persisted in `campaigns` & `campaign_rules` DB |
| **Source Video Ingestion** | In-memory dict | Persisted in `source_assets` DB table |
| **Transcripts & Clips** | Memory / JSON | Persisted in `clips` DB table |
| **Render Jobs** | JSON file | Persisted in `processing_jobs` DB table |
| **Guard Compliance Reports** | JSON file | Persisted in `guard_reports` DB table |
| **Review Queue Approvals** | Frontend mock state | Real `approvals` DB table with reviewer audit trail |
| **Publication Records** | Mock frontend state | Real `publications` DB table with platform URLs |
| **Performance Lab V2** | Fictional calculations | Fixed-precision financial ledger in `performance_snapshots` |

---

## 4. Implementation Roadmap for Sprint 4

1. **Phase B — Authentication & Database Security:**
   - Real relational database (`backend/app/db/session.py` and `database.py`).
   - Server-side user and workspace membership tables (`workspaces`, `users`, `workspace_members`).
   - Hardened `get_current_user` checking user-workspace membership.
   - Cross-workspace access security tests.

2. **Phase C — Unified Relational Persistence:**
   - Migrate campaigns, source assets, clips, render jobs, and guard reports to SQL tables.
   - Stale job auto-recovery on boot.

3. **Phase D & E — Full Operator Workflow & Performance Lab V2:**
   - Approval recording API (`POST /api/v1/approvals`).
   - Publication submission API (`POST /api/v1/publications`).
   - Financial ledger snapshot API (`POST /api/v1/performance/snapshots` and `/performance/summary`).
   - Exact fixed-precision financial formulas (CPM, views, fees, net profit, hourly yield).
   - Prohibit unverified revenue claims.

4. **Phase F & G — Integration & Beta Verification:**
   - Wire UI to real approval, publication, and performance endpoints.
   - Comprehensive test suite expansion and verification report.
