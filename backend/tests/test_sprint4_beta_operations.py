import asyncio
import pytest
from pathlib import Path
from httpx import AsyncClient

from app.db.database import db_manager
from app.api.v1.media import SOURCE_REGISTRY
from app.services.performance_service import performance_service

@pytest.mark.asyncio
async def test_hardened_authentication_rejects_unauthorized(async_client: AsyncClient):
    """
    Sprint 4 Phase B: Verifies that unauthenticated or invalid token requests are strictly rejected.
    """
    # 1. Invalid Bearer token (Must return 401 Unauthorized under RFC 6750)
    resp = await async_client.get(
        "/api/v1/campaigns",
        headers={"Authorization": "Bearer fake_invalid_hacker_token"},
    )
    assert resp.status_code == 401
    assert "Invalid or expired bearer token" in resp.json()["detail"]

@pytest.mark.asyncio
async def test_workspace_membership_enforcement_prevents_header_spoofing(async_client: AsyncClient):
    """
    Sprint 4 Phase B: Verifies that authorization is NOT based solely on client-supplied X-Workspace-Id.
    A user can only access workspaces where they have verified server-side membership in workspace_members.
    """
    # 'meridian_partner_token_2026' belongs to usr-meridian-partner who only has membership in 'ws-partner-meridian'.
    # If this user tries to access 'ws-argon-core' via header spoofing, the server MUST reject with 403.
    spoofed_resp = await async_client.get(
        "/api/v1/campaigns",
        headers={
            "Authorization": "Bearer meridian_partner_token_2026",
            "X-Workspace-Id": "ws-argon-core",
        },
    )
    assert spoofed_resp.status_code == 403
    assert "Cross-tenant access denied" in spoofed_resp.json()["detail"]

    # When accessing their own authorized workspace 'ws-partner-meridian', it succeeds
    legit_resp = await async_client.get(
        "/api/v1/campaigns",
        headers={
            "Authorization": "Bearer meridian_partner_token_2026",
            "X-Workspace-Id": "ws-partner-meridian",
        },
    )
    assert legit_resp.status_code == 200

@pytest.mark.asyncio
async def test_source_asset_relational_database_persistence(async_client: AsyncClient, sample_video_path: Path):
    """
    Sprint 4 Phase C: Verifies that uploaded source videos persist in SQLite source_assets table
    and survive in-memory cache eviction across server restarts.
    """
    video_bytes = sample_video_path.read_bytes()
    upload_resp = await async_client.post(
        "/api/v1/media/upload",
        files={"file": ("relational_test.mp4", video_bytes, "video/mp4")},
        data={"campaign_id": "cmp-test-persisted", "title": "Durable Source Asset"},
    )
    assert upload_resp.status_code == 201
    source_id = upload_resp.json()["source_asset_id"]

    # 1. Verify row exists in SQLite database
    conn = db_manager.get_connection()
    row = conn.execute("SELECT * FROM source_assets WHERE id = ?;", (source_id,)).fetchone()
    conn.close()
    assert row is not None
    assert row["title"] == "Durable Source Asset"
    assert row["duration_sec"] >= 7.9

    # 2. Simulate complete memory eviction / server restart
    SOURCE_REGISTRY.clear()
    assert source_id not in SOURCE_REGISTRY

    # 3. Request inspect endpoint -> must load from SQLite and succeed
    inspect_resp = await async_client.get(f"/api/v1/media/{source_id}/inspect")
    assert inspect_resp.status_code == 200
    inspect_data = inspect_resp.json()
    assert inspect_data["is_valid"] is True
    assert inspect_data["video_stream"]["width"] == 1920

    # 4. Request stream endpoint -> must load from SQLite and stream video
    stream_resp = await async_client.get(f"/api/v1/media/{source_id}/stream")
    assert stream_resp.status_code == 200
    assert stream_resp.headers["content-type"] == "video/mp4"

@pytest.mark.asyncio
async def test_review_queue_approval_workflow(async_client: AsyncClient):
    """
    Sprint 4 Phase D: Verifies review queue approval decisions, notes, and audit history logging.
    """
    approval_req = {
        "clip_id": "clip-review-001",
        "decision": "approved",
        "notes": "Verified full audio, safe margins, and sponsor disclosure. Approved for syndication.",
    }
    resp = await async_client.post("/api/v1/performance/approvals", json=approval_req)
    assert resp.status_code == 201
    app_data = resp.json()
    assert app_data["id"].startswith("app-")
    assert app_data["decision"] == "approved"
    assert "Approved for syndication" in app_data["notes"]

    # Retrieve approval history for clip
    hist_resp = await async_client.get("/api/v1/performance/approvals/clip/clip-review-001")
    assert hist_resp.status_code == 200
    history = hist_resp.json()
    assert len(history) >= 1
    assert history[0]["clip_id"] == "clip-review-001"

@pytest.mark.asyncio
async def test_publication_url_recording(async_client: AsyncClient):
    """
    Sprint 4 Phase D: Verifies manual/recorded entry of actual live platform publication URLs.
    """
    pub_req = {
        "clip_id": "clip-pub-001",
        "campaign_id": "cmp-meridian-fx",
        "platform": "tiktok",
        "publication_url": "https://www.tiktok.com/@argon_syndicate/video/7391829481920",
        "platform_post_id": "tt_7391829481920",
    }
    resp = await async_client.post("/api/v1/performance/publications", json=pub_req)
    assert resp.status_code == 201
    pub_data = resp.json()
    assert pub_data["id"].startswith("pub-")
    assert pub_data["platform"] == "tiktok"
    assert "tiktok.com" in pub_data["publication_url"]

    # List publications for workspace
    list_resp = await async_client.get("/api/v1/performance/publications")
    assert list_resp.status_code == 200
    pubs = list_resp.json()
    assert len(pubs) >= 1

@pytest.mark.asyncio
async def test_performance_lab_fixed_precision_financial_ledger(async_client: AsyncClient):
    """
    Sprint 4 Phase E: Verifies fixed-precision financial formulas:
    - Estimated vs verified revenue
    - Net profit = Verified Payout - Platform Fees - Production Costs
    - Earnings per production hour (EPH)
    - Reconciled escrow vs unverified claims
    """
    # 1. Record snapshot with unverified views (120,000 views, $4.50 CPM, $1,500 cap)
    unverified_req = {
        "publication_id": "pub-fin-001",
        "clip_id": "clip-fin-001",
        "campaign_id": "cmp-meridian-fx",
        "views_count": 120000,
        "verified_views_count": 0,
        "cpm_usd": 4.50,
        "payout_cap_usd": 1500.0,
        "production_hours": 2.0,
        "platform_fees_usd": 12.50,
        "production_cost_usd": 25.00,
        "reconciled": False,
        "notes": "Early telemetry from TikTok creator portal",
    }
    snap1_resp = await async_client.post("/api/v1/performance/snapshots", json=unverified_req)
    assert snap1_resp.status_code == 201
    s1 = snap1_resp.json()
    # (120,000 / 1,000) * 4.50 = $540.00
    assert s1["estimated_revenue_usd"] == 540.00
    # Because unreconciled and verified views = 0, verified payout is strictly 0.00!
    assert s1["verified_payout_usd"] == 0.00
    assert s1["reconciled"] is False

    # 2. Record reconciled snapshot with verified views (80,000 verified views)
    reconciled_req = {
        "publication_id": "pub-fin-002",
        "clip_id": "clip-fin-002",
        "campaign_id": "cmp-meridian-fx",
        "views_count": 85000,
        "verified_views_count": 80000,
        "cpm_usd": 4.50,
        "payout_cap_usd": 1500.0,
        "production_hours": 2.5,
        "platform_fees_usd": 15.00,
        "production_cost_usd": 25.00,
        "reconciled": True,
        "notes": "Reconciled with sponsor escrow payout receipt #MERIDIAN-ESCROW-2026",
    }
    snap2_resp = await async_client.post("/api/v1/performance/snapshots", json=reconciled_req)
    assert snap2_resp.status_code == 201
    s2 = snap2_resp.json()
    # Verified payout: (80,000 / 1,000) * 4.50 = $360.00
    assert s2["verified_payout_usd"] == 360.00
    # Net profit: 360.00 - 15.00 (fees) - 25.00 (cost) = $320.00
    assert s2["net_profit_usd"] == 320.00
    # Earnings per hour: 320.00 / 2.5 = $128.00 / hr
    assert s2["earnings_per_hour_usd"] == 128.00
    assert s2["reconciled"] is True

    # 3. Retrieve Aggregated Performance Summary
    summary_resp = await async_client.get("/api/v1/performance/summary")
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["total_views"] >= 205000
    assert summary["total_verified_views"] >= 80000
    assert summary["total_verified_payout_usd"] >= 360.00
    assert summary["total_net_profit_usd"] >= 320.00

@pytest.mark.asyncio
async def test_full_private_beta_end_to_end_lifecycle(async_client: AsyncClient, real_spoken_sample_path: Path):
    """
    Sprint 4 Phase G: Full private beta end-to-end lifecycle verification:
    1. Ingest campaign brief into relational DB
    2. Upload authorized video with FFprobe inspection & DB persistence
    3. Run AI transcription on real speech & 7-factor candidate discovery
    4. Enqueue 9:16 vertical render with burned captions & audio smoothing
    5. Run Argon Guard V2 pre-flight verification (deterministic PASS, human reviews required)
    6. Submit operator attestations -> certified export ready
    7. Authenticated download of rendered 1080x1920 MP4
    8. Submit Review Queue approval decision
    9. Record platform publication URL
    10. Record performance ledger snapshot and verify financial math
    """
    # 1. Ingest Campaign
    brief = "Syndicate Beta Launch: Between 2 and 6 seconds on TikTok and Shorts. Tag @BetaDesk #ArgonBeta. Paying $5.00 CPM up to $2,000 cap."
    c_resp = await async_client.post("/api/v1/campaigns/ingest-brief", json={
        "title": "Private Beta Sprint Campaign",
        "sponsor_name": "Argon Syndicate",
        "brief_text": brief,
    })
    assert c_resp.status_code == 201
    camp_id = c_resp.json()["campaign_id"]

    # 2. Upload Video
    v_bytes = real_spoken_sample_path.read_bytes()
    up_resp = await async_client.post("/api/v1/media/upload", files={"file": ("beta_source.mp4", v_bytes, "video/mp4")}, data={"campaign_id": camp_id})
    assert up_resp.status_code == 201
    src_id = up_resp.json()["source_asset_id"]

    # 3. AI Transcription
    intel_resp = await async_client.post("/api/v1/intelligence/transcribe-and-rank", json={"source_asset_id": src_id})
    assert intel_resp.status_code == 200
    candidates = intel_resp.json()["candidates"]
    assert len(candidates) >= 1
    cand = candidates[0]

    # 4. Render 9:16 Vertical Clip
    render_resp = await async_client.post("/api/v1/render/jobs", json={
        "source_asset_id": src_id,
        "clip_id": "clip-beta-slice-01",
        "campaign_id": camp_id,
        "start_sec": 1.0,
        "end_sec": 4.0,
        "target_width": 1080,
        "target_height": 1920,
        "burn_captions": True,
        "caption_preset": "kinetic-lime",
        "fade_audio": True,
    })
    assert render_resp.status_code == 202
    job_id = render_resp.json()["job_id"]
    token = render_resp.json()["download_token"]

    for _ in range(40):
        await asyncio.sleep(0.5)
        poll = (await async_client.get(f"/api/v1/render/jobs/{job_id}")).json()
        if poll["status"] == "completed":
            break
    assert poll["status"] == "completed"

    # 5. Guard V2 Validation
    guard_resp = await async_client.post("/api/v1/guard/validate-clip", json={"job_id": job_id, "campaign_id": camp_id, "clip_id": "clip-beta-slice-01"})
    assert guard_resp.status_code == 200
    rep = guard_resp.json()
    assert rep["is_export_ready"] is False
    rep_id = rep["report_id"]

    # 6. Attestations
    await async_client.post(f"/api/v1/guard/reports/{rep_id}/attest", json={
        "check_id": "chk-attest-prohibited",
        "attestation_status": "PASS",
        "reviewer_notes": "No prohibited content found.",
        "attested_by": "Senior Reviewer",
    })
    attest_resp = await async_client.post(f"/api/v1/guard/reports/{rep_id}/attest", json={
        "check_id": "chk-attest-licensing",
        "attestation_status": "PASS",
        "reviewer_notes": "Source licensing confirmed.",
        "attested_by": "Senior Reviewer",
    })
    assert attest_resp.json()["is_export_ready"] is True

    # 7. Authenticated Download
    dl_resp = await async_client.get(f"/api/v1/render/output/{job_id}/download?token={token}")
    assert dl_resp.status_code == 200
    assert dl_resp.headers["content-type"] == "video/mp4"

    # 8. Approval
    app_resp = await async_client.post("/api/v1/performance/approvals", json={
        "clip_id": "clip-beta-slice-01",
        "decision": "approved",
        "notes": "Certified compliant and approved for TikTok posting.",
    })
    assert app_resp.status_code == 201

    # 9. Publication
    pub_resp = await async_client.post("/api/v1/performance/publications", json={
        "clip_id": "clip-beta-slice-01",
        "campaign_id": camp_id,
        "platform": "tiktok",
        "publication_url": "https://www.tiktok.com/@syndicate/video/73981729182",
    })
    assert pub_resp.status_code == 201
    pub_id = pub_resp.json()["id"]

    # 10. Performance Snapshot
    snap_resp = await async_client.post("/api/v1/performance/snapshots", json={
        "publication_id": pub_id,
        "clip_id": "clip-beta-slice-01",
        "campaign_id": camp_id,
        "views_count": 60000,
        "verified_views_count": 60000,
        "cpm_usd": 5.0,
        "payout_cap_usd": 2000.0,
        "production_hours": 1.5,
        "platform_fees_usd": 10.0,
        "production_cost_usd": 20.0,
        "reconciled": True,
        "notes": "Verified TikTok Creator Marketplace escrow payment",
    })
    assert snap_resp.status_code == 201
    snap = snap_resp.json()
    # (60,000 / 1,000) * 5.00 = $300.00
    assert snap["verified_payout_usd"] == 300.00
    # Net profit: 300 - 10 - 20 = $270.00
    assert snap["net_profit_usd"] == 270.00
    # Earnings per hour: 270 / 1.5 = $180.00
    assert snap["earnings_per_hour_usd"] == 180.00
