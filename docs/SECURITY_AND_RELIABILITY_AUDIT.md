# Argon High — Security & Reliability Remediation Audit

**Date:** November 2026  
**Auditor:** Lead Systems & Security Architecture  
**Scope:** `main` branch codebase audit across authentication, media isolation, database migrations, speech intelligence, benchmarking, campaigns, and financial ledger integrity.

---

## 1. Confirmed Security Defects

### Defect 1.1: Hard-Coded API Credentials & Test-Token Authentication Fallbacks
- **Location:** `backend/app/core/auth.py` (lines 36–43, 49–55, 68–70), `backend/app/core/config.py` (lines 20–22), `src/services/argonApiClient.ts` (line 270).
- **Vulnerability:** 
  1. In development mode (`settings.ENVIRONMENT == "development"`), requests without an `Authorization` header were automatically assigned `settings.DEFAULT_API_KEY` (`argon_dev_token_syndicate_2026`).
  2. Tokens `"test-valid-token"` and `"argon-dev-token"` were hard-coded in `auth.py` to automatically authenticate the caller as `usr-operator-01` (`owner` of `ws-argon-core`), bypassing database token lookup.
  3. If a user had no database memberships, `usr-operator-01` was unconditionally granted `ws-argon-core` ownership without database verification.
  4. Invalid tokens returned `403 Forbidden` rather than standard RFC 6750 `401 Unauthorized` with `WWW-Authenticate: Bearer`.
- **Severity:** CRITICAL (Authentication Bypass & Credential Hardcoding).

### Defect 1.2: Unrestricted Media Streaming & Download Authorization Bypasses
- **Location:** `backend/app/api/v1/media.py` (lines 234–246), `backend/app/api/v1/render.py` (lines 44–63).
- **Vulnerability:**
  1. In `media.py` (`stream_source_video`), if `settings.ENVIRONMENT == "development"` and neither an Authorization header nor a token was supplied, `auth_user` remained `None`, skipping tenant isolation checks (`if auth_user and owner_ws...`) and serving private media to unauthenticated callers.
  2. If query `token` was in `[DEFAULT_API_KEY, "test-valid-token", "argon-dev-token"]`, it granted unrestricted access to *all* workspaces (`ws-argon-core`, `ws-syndicate-beta`, `ws-partner-meridian`).
  3. In `render.py` (`_verify_job_access`), any header with `"bearer "` (e.g. `Authorization: Bearer invalid-garbage`) was accepted as valid (`if authorization and ("bearer " in authorization.lower()): return True`) without verifying signature, token validity, or workspace ownership.
- **Severity:** CRITICAL (Broken Object-Level Authorization & Private Media Leakage).

---

## 2. Database & Storage Defects

### Defect 2.1: Supabase Storage Tenant Isolation Absence
- **Location:** `backend/migrations/001_initial_schema.sql` (lines 361–370).
- **Vulnerability:**
  Storage policies for `raw-sources` and `rendered-clips` buckets only checked `auth.role() = 'authenticated'`. Any user authenticated to *any* tenant workspace could read, write, and delete raw long-form videos and rendered clips of all other workspaces.
- **Severity:** HIGH (Cross-Tenant Media Exfiltration & Tampering).

### Defect 2.2: Migration 001 vs 002 Schema Incompatibility
- **Location:** `backend/migrations/001_initial_schema.sql` vs `backend/migrations/002_production_parity_and_rls.sql`.
- **Vulnerability:**
  Migration 001 defined UUID primary keys, while Migration 002 defined TEXT primary keys (`ws-argon-core`, `cmp-...`, `src-...`). Column names differed (`brief_raw_text` vs `raw_brief_text`, `payout_cap_per_clip_usd` vs `payout_cap_usd`). Running migration 001 followed by 002 produced duplicate/conflicting tables and foreign key failures.
- **Severity:** HIGH (Database Migration Failure on PostgreSQL / Supabase).

---

## 3. Speech Intelligence & Benchmark Defects

### Defect 3.1: Synthetic Transcript Generation in Live Mode
- **Location:** `backend/app/services/transcription_service.py` (lines 152–155, 392–417).
- **Vulnerability:**
  When speech recognition model returned no segments (or silence was processed), the service fell back to `_generate_acoustic_aligned_segments`, synthesizing hardcoded phrases ("Welcome back to Argon High Deep Dive..."). In Live mode, this produced fake transcripts on audio that had no speech.
- **Severity:** MEDIUM (Data Fabrication & Integrity Violation).

### Defect 3.2: Hardcoded Benchmark Metrics
- **Location:** `backend/app/services/quality_benchmark_service.py` (lines 65, 77, 95).
- **Vulnerability:**
  - `accuracy = 95.0` was returned whenever reference transcript was missing.
  - `sync_drift_ms = 18.5` was static hardcoded instead of measured from word timestamp alignment.
  - Export reliability was statically set to `98`.
- **Severity:** MEDIUM (Deceptive Benchmark Scorecard).

---

## 4. Campaign Fixtures & Financial Ledger Defects

### Defect 4.1: Pollution of Production Campaign Store by Test Fixtures
- **Location:** `backend/app/services/campaign_service.py`, `backend/storage/campaigns_db.json`.
- **Vulnerability:**
  Test fixtures (`cmp-ad09cf3e`, etc.) were directly written to `campaigns_db.json` and the shared SQLite database during test runs. Real production campaigns lacked an explicit `is_synthetic` flag to prevent mixing demo/test fixtures with actual advertiser campaigns.
- **Severity:** MEDIUM (Data Cross-Contamination).

### Defect 4.2: Float Precision & Unverified Received Revenue Accrual
- **Location:** `backend/app/services/performance_service.py` (lines 106–135).
- **Vulnerability:**
  1. Calculations used binary IEEE 754 floats (`float()`, `round()`) vulnerable to cumulative rounding drift.
  2. If `req.reconciled` was `True`, `actually_received_usd` was automatically credited as `ver_payout` with NO verified payout voucher or bank payment receipt reference.
- **Severity:** HIGH (Financial Ledger Drift & Unverified Revenue Recognition).

### Defect 4.3: Missing CI/CD Pipeline
- **Location:** `.github/workflows/` (missing).
- **Vulnerability:**
  No automated continuous integration pipeline verifying backend unit/integration tests, frontend build, or security scans on push/PR.
- **Severity:** MEDIUM (Regression Risk).

---

## 5. Remediation Plan

1. **Authentication & Session Hardening (`auth.py`)**:
   - Require valid Bearer token for every non-public route.
   - Remove all test-token bypasses (`test-valid-token`, `argon-dev-token`).
   - Validate token against `users` table in SQLite / PostgreSQL.
   - Return standard `401 Unauthorized` for invalid or missing tokens.
   - Enforce workspace membership and role permissions from `workspace_members`.
2. **Media Access Hardening (`media.py`, `render.py`)**:
   - Require authenticated session or cryptographically signed time-limited download token.
   - Reject arbitrary/forged Bearer tokens.
   - Validate workspace ownership for every stream, inspect, and download request.
3. **Database & Storage Reconciled Migration (`001_initial_schema.sql`, `002_production_parity_and_rls.sql`)**:
   - Reconcile schema into a cohesive, idempotent, versioned PostgreSQL migration.
   - Implement storage bucket tenant isolation: `(storage.foldername(name))[1] IN (SELECT public.current_user_workspaces())`.
4. **Live Mode Speech Intelligence (`transcription_service.py`)**:
   - In Live mode, return explicit `no-speech` or `transcription-failed` result when no speech is detected.
   - Never fabricate synthetic utterances.
5. **Real Benchmark Measurement (`quality_benchmark_service.py`)**:
   - Calculate actual word-level timestamp alignment drift.
   - If reference transcript is absent, mark accuracy as `unavailable` or report average acoustic confidence.
6. **Campaign Segregation (`campaign_service.py`, `database.py`)**:
   - Add `is_synthetic` column/field.
   - Ensure test suites run against isolated test databases.
7. **Decimal Financial Ledger (`performance_service.py`)**:
   - Convert calculations to `decimal.Decimal` with `ROUND_HALF_UP` (or integer cents).
   - Enforce that `actually_received_usd > 0` requires non-empty `payment_voucher_code` or bank reference.
8. **GitHub Actions CI (`.github/workflows/ci.yml`)**:
   - Automated pytest, npm build, and security scanning.
