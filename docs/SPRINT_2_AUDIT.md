# Argon High — Sprint 2 Architectural Audit & Verification

## Executive Summary
This document fulfills **Phase A (Verify Sprint 1)** of **Sprint 2: Real Content Intelligence**. It provides a rigorous baseline audit of the Sprint 1 implementation, pinpointing what is fully operational, what was simulated or lightweight, and the exact architectural improvements required for real content intelligence.

---

## 1. Verification of Sprint 1 Foundations

### 1.1 Frontend Architecture & Clip Studio
* **Status**: **Verified Operational & Stable**.
* **Framework**: React 19 + TypeScript 5.7 + Tailwind CSS v4 running on Vite 8.
* **Component Tree**: Navigation, Command Center, Campaign Radar, Clip Studio, Argon Guard, Review Queue, and Performance Lab are intact.
* **UI Preservation**: Existing Vibe design token palette, typography, responsive grid layout, and custom UI components are preserved.
* **API Integration**: `src/services/argonApiClient.ts` communicates with the FastAPI backend on `http://127.0.0.1:8000/api/v1`.
* **Gaps Identified**:
  - Subtitle styling in Clip Studio was an interactive DOM overlay; it needs direct synchronization with backend subtitle presets and burning into the rendered video.
  - Video player renders `<video>` preview when the backend completes a render, but currently lacks word-level subtitle preview scrubbing.

### 1.2 Transcription & Intelligence Engine
* **Status**: **Sprint 1 Initial Heuristic Baseline (Action Required)**.
* **Sprint 1 Implementation**: `backend/app/services/transcription_service.py` extracted duration from FFprobe and generated structured diarized transcript segments based on sample dialogue patterns.
* **Sprint 2 Mandate**: Must replace placeholder transcript data with **real speech-to-text inference** via `faster-whisper`.
* **Gaps Identified**:
  - Spoken audio track was not run through an actual neural acoustic model in Sprint 1.
  - No real word-level timestamp alignment.
  - No real silence / VAD detection.
  - Clip candidates were chosen by duration percentages rather than analyzing lexical density, emotional/insight delta, and natural sentence boundaries.

### 1.3 Background Job Execution & Persistence
* **Status**: **Sprint 1 In-Memory Queue (Action Required)**.
* **Sprint 1 Implementation**: `backend/app/services/job_queue.py` stored jobs in a Python dictionary (`self._jobs`).
* **Verification**: Background jobs do **not** survive application restarts. If the FastAPI process restarts, pending or completed job records in memory are lost.
* **Sprint 2 Mandate**: Implement durable job state persistence (e.g. SQLite / durable state journal `storage/jobs_db.json`) so jobs survive server restarts.

### 1.4 Supabase Migrations & Database Integration
* **Status**: **Defined in SQL Migration Files**.
* **Verification**: `backend/migrations/001_initial_schema.sql` contains the complete production PostgreSQL schema, custom ENUMs, 11 relational tables, Row Level Security (RLS) policies, and storage bucket definitions.
* **Production Status**: The schema is ready for deployment to any Supabase project. In the local development environment, SQLite / local filesystem handles media and metadata storage until production cloud credentials (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) are provided.

### 1.5 Media Upload Validation & Security
* **Status**: **Partially Verified (Enhancements Needed)**.
* **Sprint 1 Implementation**:
  - File extension check (`.mp4`, `.mov`, `.m4v`, `.webm`).
  - Size check (`MAX_UPLOAD_BYTES = 250MB`).
  - FFprobe container stream inspection.
* **Gaps Identified**:
  - File magic bytes header check should be added to guarantee container integrity before writing full chunks to disk.
  - Preview and download endpoints (`/api/v1/render/output/{job_id}/preview` and `/download`) need secure token authorization to prevent unauthorized access in multi-tenant environments.
  - Maximum video duration limit (e.g., 60 minutes) should be validated.

---

## 2. Sprint 2 Architectural Blueprint

```mermaid
flowchart TD
    User["Operator / Frontend"] -->|1. Upload Real Spoken MP4| Upload["POST /api/v1/media/upload"]
    Upload -->|2. Magic Byte & FFprobe Validation| Storage["storage/uploads/"]
    Upload -->|3. Extract Audio Track (16kHz WAV)| FFmpegAudio["FFmpeg Audio Extractor"]
    FFmpegAudio -->|4. faster-whisper Neural Inference| Whisper["faster-whisper Model (int8/float32)"]
    Whisper -->|5. Word-Level Timestamps & VAD| Transcript["Diarized Real Transcript + Words"]
    Transcript -->|6. 7-Factor Discovery Algorithm| Discovery["Candidate Clip Discovery Engine"]
    Discovery -->|7. Punctuation & Silence Snapping| Candidates["3+ Distinct Ranked Candidates"]
    User -->|8. Select Preset & Crop| RenderReq["POST /api/v1/render/jobs"]
    RenderReq -->|9. Generate Synchronized ASS/SRT| Subtitles["ASS Subtitle Generator (3 Presets)"]
    Subtitles -->|10. 9:16 Crop + Audio Fades + Burned Subs| FFmpegRender["FFmpeg 1080x1920 Engine"]
    FFmpegRender -->|11. Verify Dimensions & Codec| Verifier["FFprobe Post-Render Verification"]
    Verifier -->|12. Stream Preview & Download| UI["Clip Studio Synchronized Player"]
```

---

## 3. Sprint 2 Task Checklist

- [x] **Phase A**: Verify Sprint 1 and document audit in `docs/SPRINT_2_AUDIT.md`.
- [ ] **Phase B**: Implement real speech-to-text inference with `faster-whisper` (accurate segment timestamps, word alignment, confidence indicators, silence detection).
- [ ] **Phase C**: Implement 7-factor intelligent clip discovery with sentence boundary / silence gap snapping and explainable heuristic scores.
- [ ] **Phase D**: Implement automatic caption generation with burned-in subtitles via FFmpeg, word highlighting, safe margins, and 3 presets (`kinetic-lime`, `minimal-editorial`, `founder-mono`).
- [ ] **Phase E**: Improve video quality (1080×1920, configurable crop, audio fade in/out, strict A/V sync, post-render FFprobe verification).
- [ ] **Phase F**: Reliability & security (magic byte validation, durable job store across restarts, token authorization on preview/download).
- [ ] **Phase G**: Frontend integration in Clip Studio & comprehensive test suite.
