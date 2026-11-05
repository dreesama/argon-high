# Argon High — Sprint 3 Audit & Stabilization Report

**Mission:** Verify Sprint 2 baseline, identify operational risks, and establish architectural readiness for Sprint 3 (Campaign Intelligence & Argon Guard v2 Compliance).  
**Date:** November 4, 2026  
**Auditor:** Principal Full-Stack Engineer  

---

## 1. Test Suite & Build Verification

### Backend Verification
- **Command:** `python -m pytest backend/tests -v`
- **Result:** **12 / 12 Passed** (Execution time: 17.77s)
- **Subsystems Verified:**
  - FFprobe stream extraction (resolution, duration, framerate, audio codec).
  - Magic byte container validation (rejecting invalid formats and disguised binaries).
  - Real faster-whisper speech recognition with int8 quantization.
  - 7-Factor virality heuristic scoring with sentence-boundary snapping.
  - Subtitle generation across 3 presets (`kinetic-lime`, `minimal-editorial`, `founder-mono`).
  - FFmpeg 1080×1920 9:16 vertical video rendering with burned ASS subtitles and audio smoothing.
  - Job persistence and state recovery across server restarts.
  - Token-authorized preview and download endpoints (`403 Forbidden` on invalid tokens).

### Frontend Build Verification
- **Command:** `npm run build`
- **Result:** **Passed** (Vite v8.3.5 transformed 2,062 modules in 932ms with zero errors).
- **Bundle Output:**
  - `dist/index.html` (0.97 kB)
  - `dist/assets/index-CgbfJnh_.css` (43.59 kB)
  - `dist/assets/index-CE5SrP9I.js` (460.39 kB)

---

## 2. Root Cause Analysis of Previous Defects

| Defect Observed in Sprint 2 | Root Cause | Permanent Resolution |
| :--- | :--- | :--- |
| `TypeError: open() got an unexpected keyword argument 'metadata_errors'` | PyAV 14.0+ removed the `metadata_errors` keyword argument from `av.open()`, which `faster-whisper` 1.2 still supplies. | Implemented a scoped argument sanitizer wrapper in `transcription_service.py` that strips `metadata_errors` before delegating to `av.open`. |
| Pydantic validation error on `TranscriptWordSchema` | Test instantiated words with `start` and `end` instead of the typed schema fields `start_sec` and `end_sec`. | Synchronized test fixtures and service schemas to use canonical `start_sec` and `end_sec`. |
| `AttributeError: model_used` on `TranscriptionAnalysisResponse` | Schema defines `model_name` and `snapped_to_sentence_boundary`. | Aligned test assertions and service returns to canonical schema property names. |
| Corrupted MP4 upload test status 400 vs 422 | Magic byte validation rejects malformed file headers immediately with 400 Bad Request before FFprobe inspection. | Test assertion updated to accept 400 for magic byte rejection and 422 for unparseable stream data. |
| `JobStore` constructor argument mismatch | Test passed `storage_file` while `JobStore` accepts `persistence_file`. | Standardized constructor parameter and verified typed `RenderJobStatus` serialization. |

---

## 3. PyAV Compatibility Workaround Safety Review

The compatibility patch in `transcription_service.py` intercepts `av.open` to strip `metadata_errors="ignore"`. 
- **Safety Assessment:** Safe. It does not alter PyAV container parsing, frame decoding, or memory management. It only catches calls where `metadata_errors` is provided and forwards the remaining parameters to the underlying native method.
- **Sprint 3 Hardening:** Ensure the wrapper is applied idempotently and does not affect un-intercepted container calls.

---

## 4. Authorization & Workspace Isolation Audit

- **Current State:**
  - Media streaming (`/media/{id}/stream`), video preview (`/render/output/{id}/preview`), and video download (`/render/output/{id}/download`) require a valid `download_token` issued to the render job or a bearer header.
  - An invalid token correctly yields `403 Forbidden`.
- **Identified Gap:**
  - Currently, possessing a `download_token` allows downloading the file regardless of the requesting user's tenant workspace. In an enterprise multi-tenant setup, tokens should be bound to a specific `workspace_id`.
- **Sprint 3 Action:**
  - Add explicit `workspace_id` to `RenderJobCreate`, `RenderJobStatus`, and `SourceAsset`.
  - Validate that the requesting user's `workspace_id` matches the job's `workspace_id` when bearer authentication is supplied.

---

## 5. Job Processing, Concurrency & Lifecycle Audit

- **Current State:**
  - Jobs are executed via `asyncio.create_task` directly into `run_in_executor`.
  - Finished jobs persist in `storage/jobs_db.json`.
- **Identified Risks:**
  1. **Unbounded Concurrency:** Submitting 20 simultaneous render jobs could overwhelm CPU cores during video encoding.
  2. **Interrupted Jobs:** If the backend terminates mid-render, jobs in `"processing"` state remain marked as `"processing"` indefinitely upon restart.
  3. **No Cancellation:** Operators cannot abort long-running or misconfigured renders.
  4. **Disk Accumulation:** Temporary WAV and ASS files remain in `storage/` without automatic TTL pruning.
- **Sprint 3 Action:**
  - Add `asyncio.Semaphore(settings.MAX_CONCURRENT_RENDERS)` (default 2) to throttle simultaneous FFmpeg processes.
  - Add startup cleanup that transitions stale `"queued"` or `"processing"` jobs to `"interrupted"` or `"failed"` with clear restart notices.
  - Implement `POST /api/v1/render/jobs/{job_id}/cancel`.
  - Implement disk retention and cleanup routines (`/api/v1/render/cleanup`).

---

## 6. Persistence & Supabase Deployment Status

- **Migration State:**
  - Multi-tenant PostgreSQL schema is fully defined in `backend/migrations/001_initial_schema.sql` (11 tables, foreign key constraints, RLS policies, storage bucket policies).
- **Deployment Status:**
  - Local runtime uses durable JSON stores (`jobs_db.json`, `media_registry.json`) with thread locks.
  - Supabase integration is wired through environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`). When configured, backend delegates persistence to Supabase PostgREST endpoints; when running locally offline, it falls back gracefully to durable disk storage.

---

## 7. Sprint 3 Architectural Plan

1. **Phase 2 — Real Campaign Intelligence:**
   - Structured brief parsing engine: platforms, min/max duration, mandatory hashtags/disclosures, prohibited topics, payout caps, CPM, verification rules.
   - Human-editable campaign rules with source passage evidence and confidence scores.
   - Unknown conditions retained as `UNKNOWN` (no fabricated compliance).

2. **Phase 3 — Argon Guard v2 Pre-Flight Compliance:**
   - Multi-tier validation model: `PASS`, `FAIL`, `WARNING`, `UNKNOWN`, `HUMAN_REVIEW_REQUIRED`.
   - Real FFprobe / FFmpeg deterministic checks: 1080x1920, 9:16, duration bounds, AAC audio, LUFS loudness, framerate, file integrity.
   - Verification of burned captions and branding presence on actual rendered output.
   - Hard export block until all blocking failures are cleared.

3. **Phase 4 — Smart Vertical Framing:**
   - Face detection and temporal smoothing engine with exponential moving average (EMA) to prevent jumpy crops.
   - Automatic active speaker centering with fallback to centered crop.
   - Configurable manual framing offset override (`face_track_offset_x`).
   - Safe visual zone markers (protecting captions and platform UI overlays).

4. **Phase 5 — Creative Quality Assurance:**
   - Awkward cut detection (silence boundaries, word truncation).
   - Hook comparison and trim fine-tuning.
   - Synchronized caption timing across trim modifications.

5. **Phase 6 — Operational Reliability & Multi-Tenancy:**
   - Concurrency throttling (Semaphore).
   - Cancellation and restart recovery.
   - Workspace ownership verification on preview/download.
   - Disk cleanup routines.

6. **Phase 7 — UI Integration:**
   - Wire all new capabilities to Campaign Radar, Clip Studio, Argon Guard, and Review Queue while preserving Figma Make styling.
