# Argon High — Sprint 3 Production Intelligence & Compliance Verification Report

**Platform:** Argon High — Campaign-Aware AI Clipping & Pre-Flight Compliance Desk  
**Date:** November 4, 2026  
**Status:** **VERIFIED & OPERATIONAL**  
**Test Suite:** 18 / 18 automated tests passed (`backend/tests/`)  
**Frontend Build:** Production build passed (`vite v8.3.5`, 2,062 modules transformed in 884ms)  

---

## 1. Executive Summary

Sprint 3 transforms Argon High from an AI transcription pipeline into a **campaign-aware, quality-controlled production clipping operation**. The platform now enforces structured brief extraction, deterministic FFprobe/FFmpeg pre-flight technical compliance through Argon Guard V2, smart vertical framing with safe zones, creative quality assurance (awkward cut detection, subtitle overflow risk), bounded concurrency, and multi-tenant workspace isolation.

### Core Integrity Guardrails Upheld
- **Truthful Status Model:** Argon Guard V2 enforces `PASS` / `FAIL` / `WARNING` / `UNKNOWN` / `HUMAN_REVIEW_REQUIRED`.
- **No Fabricated Compliance:** Unknown campaign conditions remain explicitly `UNKNOWN`; unverified brief parameters are never assigned synthetic defaults that imply compliance.
- **Export Blocker:** Clips cannot be certified export-ready while blocking failures exist or required editorial reviews remain un-attested.
- **Experimental Heuristics:** Hook scores, retention cadence, and virality predictions are transparently labeled as experimental heuristics for operator triage.
- **Multi-Tenant Workspace Security:** Preview and download routes enforce tenant workspace matching, rejecting unauthorized cross-tenant requests with `403 Forbidden`.

---

## 2. Phase-by-Phase Deliverables

### Phase 1 — Verify & Stabilize Sprint 2
- Documented findings, root causes, and resolutions in `docs/SPRINT_3_AUDIT.md`.
- Stabilized PyAV argument sanitization, Pydantic v2 typed models, and persistent JSON storage.
- Validated faster-whisper speech recognition with local CPU int8 inference.

### Phase 2 — Real Campaign Intelligence
- Created `CampaignService` in `backend/app/services/campaign_service.py` and schemas in `backend/app/schemas/campaign.py`.
- Ingests raw sponsor briefs and extracts:
  - Eligible platforms (`tiktok`, `youtube_shorts`, `instagram_reels`, `x_video`)
  - Minimum & maximum duration bounds
  - Required hashtags and handle mentions
  - Required disclosures (`#ad`, `Sponsored by`, `Not financial advice`)
  - Prohibited topics and content exclusions
  - Financial terms (CPM and payout cap)
  - Source licensing and rights permissions
- Attaches exact source passage quotes and confidence metrics to every extracted rule.
- Human-editable endpoints (`PUT /api/v1/campaigns/{campaign_id}/rules/{rule_id}`) allow operators to verify, modify, and annotate rules.

### Phase 3 — Argon Guard V2 Pre-Flight Compliance
- Implemented `GuardService` in `backend/app/services/guard_service.py` and API in `backend/app/api/v1/guard.py`.
- **Deterministic Technical Checks (Real FFprobe / FFmpeg):**
  1. Native 1080×1920 canvas resolution (`chk-res-1080x1920`)
  2. 9:16 aspect ratio compliance (`chk-aspect-9-16`)
  3. Universal H.264 video codec profile (`chk-codec-h264`)
  4. Audio stream presence & AAC codec (`chk-audio-stream`)
  5. Audio broadcast loudness targeting -14 LUFS (`chk-audio-lufs`)
  6. Playback framerate stability 24–60 FPS (`chk-framerate`)
  7. Bitstream & container integrity zero-output decode dry run (`chk-container-integrity`)
  8. Campaign duration bounds verification (`chk-campaign-duration`)
- **Heuristic Visual Checks:**
  9. Synchronized burned-in captions verification (`chk-burned-captions`)
  10. Watermark & sponsor attribution overlay (`chk-watermark-branding`)
- **Editorial & Rights Attestation (Human Review Required):**
  11. Prohibited content operator signoff (`chk-attest-prohibited`)
  12. Source licensing and rights release confirmation (`chk-attest-licensing`)
- **Attestation Flow:** Operator submits attestations (`POST /guard/reports/{report_id}/attest`) to clear reviews and certify the clip as `is_export_ready = True`.

### Phase 4 — Smart Vertical Framing
- Implemented `SmartFramingService` in `backend/app/services/framing_service.py` and endpoint `POST /render/framing/calculate`.
- Computes optimal 9:16 crop window from landscape sources with temporal clamping to prevent jumpy camera movement.
- Defined 4 short-form visual safe zones:
  - **Header Safe Zone:** Y=120px to 280px (sponsor tags, episode banner)
  - **Primary Action Zone:** Y=280px to 1420px (optimal eye line & face framing)
  - **Caption Safe Zone:** Y=1420px to 1740px (elevated above platform UI trays)
  - **Platform UI Danger Zone:** Y=1740px to 1920px (obscured by like/comment buttons)
- Preserves full manual horizontal offset slider (`face_track_offset_x`) for operator override.

### Phase 5 — Creative Quality Assurance
- Built `CreativeQAService` in `backend/app/services/creative_qa_service.py` and endpoint `POST /intelligence/evaluate-creative-qa`.
- Evaluates clip candidate transcripts for:
  - Awkward starts (coordinating conjunctions, excessive opening silence)
  - Awkward endings (missing sentence-terminator punctuation, cut-off words)
  - Excessive silence ratio (> 30%)
  - Subtitle reading overflow risk (> 4.2 words/second)
- Generates recommended trim adjustments (`suggested_start_sec`, `suggested_end_sec`) snapped to acoustic word boundaries with pre-roll and decay.

### Phase 6 — Operational Reliability & Multi-Tenancy
- **Bounded Concurrency:** Configured `asyncio.Semaphore(settings.MAX_CONCURRENT_RENDERS)` (default 2) preventing CPU exhaustion during heavy video renders.
- **Idempotency:** Computes parameter hashes and returns active or completed jobs for duplicate submissions.
- **Job Cancellation:** Added `POST /api/v1/render/jobs/{job_id}/cancel` to immediately abort long-running tasks.
- **Stale Job Recovery:** On server startup, automatically transitions orphaned `"queued"` or `"processing"` jobs to `"failed"` with clear restart notices.
- **Disk Cache Cleanup:** Added `POST /api/v1/render/cleanup` to prune expired temporary WAV, ASS, and MP4 files.
- **Workspace-Level Security:** Enforced tenant isolation in `_verify_job_access`: requests containing a mismatched `X-Workspace-Id` header are rejected with `403 Forbidden`.

### Phase 7 — UI Integration
- Connected `argonApiClient.ts` with typed methods for all Sprint 3 capabilities.
- Connected Campaign Radar view to real brief parsing API.
- Connected Argon Guard view to live FFprobe pre-flight validation and attestation feedback.
- Verified zero UI regression against the Figma Make design system.

---

## 3. Automated Test Suite Results

Command: `python -m pytest backend/tests -v`

| Test Name | File | Result | Verified Capability |
| :--- | :--- | :---: | :--- |
| `test_health_endpoint` | `test_api_endpoints.py` | **PASSED** | Service health & binary availability |
| `test_upload_invalid_file_extension` | `test_api_endpoints.py` | **PASSED** | Rejection of unauthorized extensions |
| `test_upload_corrupted_mp4` | `test_api_endpoints.py` | **PASSED** | Magic byte container validation |
| `test_full_clipping_vertical_slice` | `test_api_endpoints.py` | **PASSED** | Full upload -> STT -> 9:16 vertical render slice |
| `test_render_with_burned_captions_preset` | `test_api_endpoints.py` | **PASSED** | ASS subtitle burning & token authorization |
| `test_ffprobe_inspect_valid_media` | `test_media_pipeline.py` | **PASSED** | Stream, codec, and dimension extraction |
| `test_transcription_and_three_candidates` | `test_media_pipeline.py` | **PASSED** | Speech transcription and 7-factor virality |
| `test_subtitle_generation_presets` | `test_media_pipeline.py` | **PASSED** | ASS subtitle generation for all 3 presets |
| `test_ffmpeg_vertical_9_16_render` | `test_media_pipeline.py` | **PASSED** | 1080x1920 cropping and audio fade smoothing |
| `test_ffmpeg_vertical_render_with_burned_captions` | `test_media_pipeline.py` | **PASSED** | Video render with burned captions |
| `test_job_store_durability` | `test_media_pipeline.py` | **PASSED** | File-backed job persistence and restart reload |
| `test_ffprobe_corrupted_file_rejection` | `test_media_pipeline.py` | **PASSED** | Corrupted media exception handling |
| `test_campaign_brief_structured_ingestion` | `test_sprint3_intelligence.py` | **PASSED** | Brief parsing, platforms, bounds, evidence quotes |
| `test_campaign_rule_human_editing` | `test_sprint3_intelligence.py` | **PASSED** | Human operator rule modification & notes |
| `test_guard_v2_preflight_validation_and_attestation` | `test_sprint3_intelligence.py` | **PASSED** | Deterministic checks, blocking status, operator attestation |
| `test_smart_framing_safe_zones` | `test_sprint3_intelligence.py` | **PASSED** | Stable vertical crop coordinates & safe zones |
| `test_creative_qa_awkward_cut_detection` | `test_sprint3_intelligence.py` | **PASSED** | Awkward cut, excessive silence, overflow detection |
| `test_job_cancellation_and_workspace_isolation` | `test_sprint3_intelligence.py` | **PASSED** | Job cancellation and cross-tenant 403 rejection |

**Total:** **18 passed in 21.64s** (100% pass rate).

---

## 4. Acceptance Criteria Checklist

- [x] Inspect real source video and extract stream metadata via FFprobe
- [x] Generate accurate speech transcript via `faster-whisper`
- [x] Identify useful candidate timestamp ranges with explainable heuristic scores
- [x] Produce playable captioned 1080×1920 vertical MP4 with audio fade smoothing
- [x] Apply stable framing with platform safe zones and manual calibration fallback
- [x] Parse campaign brief into structured, editable rules with evidence quotes
- [x] Check actual rendered media against deterministic technical requirements (FFprobe decode test)
- [x] Flag editorial and licensing requirements for human operator review
- [x] Attest human reviews and certify clip export-readiness
- [x] Persist campaigns, jobs, and compliance reports durably
- [x] Enforce workspace-level tenant authorization on media routes
- [x] 18/18 pytest tests passing
- [x] Clean frontend production build passing
