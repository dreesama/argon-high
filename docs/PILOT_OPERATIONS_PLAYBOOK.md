# ARGON HIGH — PILOT OPERATIONS PLAYBOOK

> **Document Code:** AHP-2026-OP01  
> **Target Audience:** Syndicate Operators, Compliance Reviewers, Desk Leads  
> **Scope:** End-to-end operational protocol for running real-world sponsor campaigns, publishing short-form clips, and reconciling performance payouts.

---

## 1. Operational Overview

Argon High is designed for high-velocity short-form arbitrage: identifying high-retention moments from authorized long-form media, rendering compliant 1080×1920 (9:16) vertical videos with synchronized subtitles, and reconciling view payouts with sponsors without fabricating earnings.

```
+-----------------------------------------------------------------------------------------+
|                                8-STEP PILOT WORKFLOW                                    |
|                                                                                         |
|  1. Select Active Campaign  --> 2. Ingest Authorized Source Media                      |
|                                         |                                               |
|  3. Run Speech Intelligence <-- 4. Select Hook Candidate & Refine Snapped Cuts          |
|         |                                                                               |
|  5. Render 9:16 Vertical Cut with Burned Captions & Safe Zone Framing                   |
|         |                                                                               |
|  6. Run Argon Guard Preflight Check & Submit Editorial Attestations                     |
|         |                                                                               |
|  7. Review Queue Formal Approval & Export Sign-off                                      |
|         |                                                                               |
|  8. Publish to Platform, Record Public URL & Reconcile Escrow Ledger                    |
+-----------------------------------------------------------------------------------------+
```

---

## 2. Step-by-Step Operator Procedures

### Step 1: Campaign Brief Verification (Campaign Radar)
1. Navigate to **Campaign Radar** (`/campaign-radar`).
2. Select one of the 5 active production campaigns:
   - `cmp-meridian-fx` (Meridian FX: 25–58s, $5.50 CPM, TikTok / Shorts)
   - `cmp-tensor-cloud` (TensorCloud: 20–60s, $6.00 CPM, TikTok / Shorts / X)
   - `cmp-kroma-audio` (Kroma Audio: 30–55s, $4.80 CPM, TikTok / Shorts / Reels)
   - `cmp-cypher-shield` (CypherShield: 35–60s, $6.50 CPM, Shorts / X)
   - `cmp-omni-mesh` (OmniMesh: 25–50s, $5.00 CPM, TikTok / Shorts / X)
3. Confirm campaign parameters:
   - Contract CPM and Payout Cap
   - Eligible Platforms
   - Required Mentions and Hashtags
   - Prohibited Topics and Disclosures
4. If a sponsor updates brief terms, update the rule via `PUT /api/v1/campaigns/{id}/rules/{rule_id}`.

### Step 2: Authorized Source Video Ingestion (Clip Studio)
1. Navigate to **Clip Studio** (`/clip-studio`).
2. Click **Upload Authorized Feed** or send `POST /api/v1/media/upload`.
3. Select an authorized MP4 container (1080p or 4K landscape).
4. Enter the explicit **Authorization Proof** (e.g., `Sponsor Direct Release Agreement #MERIDIAN-2026`).
5. Verify that FFprobe inspection completes:
   - Valid H.264 video stream
   - AAC audio stream targeting -14.0 LUFS
   - Duration under 60 minutes

### Step 3: Speech Intelligence & Hook Discovery
1. Click **Run Speech Intelligence & Hook Pass** or send `POST /api/v1/intelligence/transcribe-and-rank`.
2. Inspect the 3 candidate timestamp ranges ranked by 7-factor scoring:
   - Opening Hook Strength (Velocity & Curiosity Delta)
   - Standalone Context Clarity
   - Narrative Completeness
   - Speech Pacing (Target: 130–170 WPM)
3. Ensure the candidate snapped cleanly to sentence boundaries and silence pauses.

### Step 4: Vertical Rendering & Caption Presets
1. Select the desired caption preset:
   - `kinetic-lime` (High-contrast word punch for finance/tech)
   - `minimal-editorial` (Clean typography for corporate sponsors)
   - `founder-mono` (Monospace aesthetic for engineering topics)
2. Select tracking mode (`speaker-lock` or calibrated horizontal offset).
3. Submit render job (`POST /api/v1/render/jobs`).
4. Monitor background processing progress in the real-time queue.

### Step 5: Pre-Flight Compliance (Argon Guard V2)
1. Navigate to **Argon Guard** (`/argon-guard`).
2. Run pre-flight inspection (`POST /api/v1/guard/validate-clip`):
   - **Deterministic Technical Checks (PASS):** Resolution (1080x1920), 9:16 aspect ratio, H.264 codec, AAC audio, loudness (-14 LUFS), duration bounds.
   - **Visual Quality Checks (PASS):** Burned subtitles detected in caption safe area.
   - **Editorial Attestation Checks (HUMAN_REVIEW_REQUIRED):** Prohibited topics exclusion and licensing verification.
3. Submit operator attestation (`POST /api/v1/guard/reports/{report_id}/attest`).
4. Verify the report overall status transitions to **PASS** and `is_export_ready = true`.

### Step 6: Review Queue Approval & Export Packaging
1. Navigate to **Review Queue** (`/review-queue`).
2. Play the rendered vertical MP4 using the in-browser video player.
3. Verify audio smoothing (0.2s fade-in, 0.3s fade-out).
4. Record formal review decision (`approved` or `export-ready`) with reviewer notes (`POST /api/v1/performance/approvals`).
5. Download the final broadcast-ready MP4 using your authenticated download token.

### Step 7: Live Platform Syndication & URL Tracking
1. Post the approved clip to the designated platform (TikTok, YouTube Shorts, or Instagram Reels) adhering strictly to required tags and disclosures.
2. Log the public post URL in **Performance Lab** (`POST /api/v1/performance/publications`):
   - `platform`: `tiktok` | `youtube_shorts` | `instagram_reels` | `x_video`
   - `publication_url`: Full public URL
   - `platform_post_id`: Extracted platform post ID

### Step 8: Performance Telemetry & Escrow Reconciliation
1. At 24h, 48h, and 7-day intervals, retrieve impression numbers from creator portals.
2. In **Performance Lab**, submit a performance snapshot (`POST /api/v1/performance/snapshots`):
   - `views_count`: Total recorded impressions
   - `reported_views_count`: Portal view count
   - `verified_views_count`: Verified views audited by sponsor
   - `production_hours`: Actual operator time spent (or `0.0` for automated pipeline)
   - `platform_fees_usd`: Platform and transaction fees
   - `production_cost_usd`: Compute and infrastructure unit costs
3. Once the sponsor releases escrow, mark `reconciled = true` and log the payment receipt voucher (`POST /api/v1/performance/payouts`).
4. Verify that the financial ledger displays defensible numbers and displays `"N/A"` for hourly yield if production hours were zero.

---

## 3. Operational Disaster Recovery & Backups

1. **Daily Database Backups**:
   Trigger an atomic WAL-checkpointed backup:
   ```bash
   curl -X POST http://127.0.0.1:8000/api/v1/performance/backup \
     -H "Authorization: Bearer <OPERATOR_API_KEY>"
   ```
2. **Backup Storage**:
   Backups are archived with timestamps in `backend/storage/backups/argon_operations_YYYYMMDD_HHMMSS.bak.db`.
3. **Stale Job Recovery**:
   If the server is restarted during an active FFmpeg render, the job queue service automatically flags interrupted jobs as `failed` upon startup, preventing orphan locks.

---

## 4. Operational Prohibitions & Safety Controls

1. **No Scraping of Restricted Platforms:** Ingest only authorized source MP4s with logged release agreements.
2. **No Fabricated Revenue:** Unverified views must yield strictly `$0.00` payable revenue.
3. **Short-Lived Media Protection:** Do not share permanent media download URLs; download links expire automatically after 2 hours.
4. **Tenant Isolation:** Operators from one workspace must never access or modify assets, campaigns, or ledgers belonging to another tenant.
