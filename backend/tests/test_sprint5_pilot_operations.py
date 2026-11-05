import os
import pytest
from pathlib import Path
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient

from app.core.config import settings
from app.db.database import db_manager
from app.services.quality_benchmark_service import quality_benchmark_service
from app.services.job_queue import job_queue_service
from app.services.job_store import job_store
from app.schemas.render import RenderJobCreate

@pytest.mark.asyncio
async def test_resource_level_workspace_isolation_across_endpoints(async_client: AsyncClient, sample_video_path: Path):
    """
    Sprint 5 Phase 2: Verifies that resource-level workspace checks protect tenant data
    across inspect, stream, transcribe, render jobs, and campaigns.
    A user from ws-partner-meridian (usr-meridian-partner) cannot access ws-argon-core resources.
    """
    # 1. Upload video under ws-argon-core
    video_bytes = sample_video_path.read_bytes()
    upload_resp = await async_client.post(
        "/api/v1/media/upload",
        files={"file": ("tenant_a_source.mp4", video_bytes, "video/mp4")},
        data={"campaign_id": "cmp-meridian-fx", "title": "Core Desk Source Video"},
        headers={
            "Authorization": f"Bearer {settings.DEFAULT_API_KEY}",
            "X-Workspace-Id": "ws-argon-core",
        },
    )
    assert upload_resp.status_code == 201
    source_id = upload_resp.json()["source_asset_id"]

    # 2. Partner operator (usr-meridian-partner) attempts to inspect source belonging to ws-argon-core
    partner_headers = {
        "Authorization": "Bearer meridian_partner_token_2026",
        "X-Workspace-Id": "ws-partner-meridian",
    }
    cross_inspect_resp = await async_client.get(f"/api/v1/media/{source_id}/inspect", headers=partner_headers)
    assert cross_inspect_resp.status_code == 403
    assert "Forbidden" in cross_inspect_resp.json()["detail"]

    # 3. Partner operator attempts to stream source belonging to ws-argon-core
    cross_stream_resp = await async_client.get(f"/api/v1/media/{source_id}/stream", headers=partner_headers)
    assert cross_stream_resp.status_code == 403

    # 4. Partner operator attempts to transcribe source belonging to ws-argon-core
    cross_transcribe_resp = await async_client.post(
        "/api/v1/intelligence/transcribe-and-rank",
        json={"source_asset_id": source_id, "sponsor_name": "Test Cross Tenant"},
        headers=partner_headers,
    )
    assert cross_transcribe_resp.status_code == 403

    # 5. Partner operator attempts to access a job belonging to ws-argon-core
    job_params = RenderJobCreate(
        source_asset_id=source_id,
        clip_id="clip-tenant-isolation-test",
        campaign_id="cmp-meridian-fx",
        start_sec=1.0,
        end_sec=5.0,
        workspace_id="ws-argon-core",
    )
    job_status = await job_queue_service.enqueue_render_job(job_params, sample_video_path)

    cross_job_resp = await async_client.get(f"/api/v1/render/jobs/{job_status.job_id}", headers=partner_headers)
    assert cross_job_resp.status_code == 403

    # 6. Partner operator attempts to access a campaign belonging to ws-argon-core
    cross_camp_resp = await async_client.get("/api/v1/campaigns/cmp-tensor-cloud", headers=partner_headers)
    assert cross_camp_resp.status_code == 403

@pytest.mark.asyncio
async def test_token_expiration_blocks_media_download(async_client: AsyncClient, sample_video_path: Path):
    """
    Sprint 5 Phase 6: Verifies that short-lived media access tokens with expired timestamps
    are strictly rejected with 403 Forbidden.
    """
    job_params = RenderJobCreate(
        source_asset_id="src-token-exp-test",
        clip_id="clip-token-exp-01",
        campaign_id="cmp-meridian-fx",
        start_sec=1.0,
        end_sec=3.0,
        workspace_id="ws-argon-core",
    )
    job_status = await job_queue_service.enqueue_render_job(job_params, sample_video_path)

    # Artificially expire the token in job store
    expired_time = (datetime.now(timezone.utc) - timedelta(minutes=15)).isoformat()
    job_status.token_expires_at_iso = expired_time
    job_status.output_filename = "test_output.mp4"
    job_store.save_job(job_status)
    # Ensure test file exists
    test_out = settings.RENDER_DIR / "test_output.mp4"
    test_out.write_bytes(b"dummy mp4 content for token test")

    # Attempt download using expired token
    resp = await async_client.get(f"/api/v1/render/output/{job_status.job_id}/download?token={job_status.download_token}")
    assert resp.status_code == 403
    assert "expired" in resp.json()["detail"].lower()

@pytest.mark.asyncio
async def test_real_spoken_clip_quality_benchmark(real_spoken_sample_path: Path):
    """
    Sprint 5 Phase 3: Evaluates real spoken content quality benchmark.
    Tests transcription accuracy, candidate ranking, hook score, narrative completeness,
    caption sync, visual framing, and export reliability against real spoken audio.
    """
    reference = "When you strip away legacy orchestration overhead and pin memory bandwidth directly to the inference kernel, throughput per dollar jumps 2.9x overnight."
    
    scorecard = quality_benchmark_service.evaluate_media_sample(
        media_path=real_spoken_sample_path,
        reference_transcript=reference,
        sponsor_name="TensorCloud",
    )

    assert scorecard.benchmark_id.startswith("qbc-")
    assert scorecard.transcription_accuracy_pct >= 80.0
    assert scorecard.hook_quality_score >= 70
    assert scorecard.candidate_usefulness_score >= 70
    assert scorecard.visual_framing_score >= 80
    assert scorecard.export_reliability_score >= 90
    assert scorecard.overall_quality_grade in ["A+", "A"]
    assert scorecard.operator_certification_status == "CERTIFIED_PILOT_READY"
    assert len(scorecard.findings) >= 4

@pytest.mark.asyncio
async def test_five_production_campaigns_seeded_and_enforced(async_client: AsyncClient):
    """
    Sprint 5 Phase 4: Verifies that 5 realistic production campaigns are seeded in SQLite
    with structured requirements, duration bounds, platforms, CPMs, and licensing terms.
    """
    headers = {"Authorization": f"Bearer {settings.DEFAULT_API_KEY}"}
    resp = await async_client.get("/api/v1/campaigns", headers=headers)
    assert resp.status_code == 200
    campaigns = resp.json()
    assert len(campaigns) >= 5

    camp_ids = {c["campaign_id"] for c in campaigns}
    expected_ids = {
        "cmp-meridian-fx",
        "cmp-tensor-cloud",
        "cmp-kroma-audio",
        "cmp-cypher-shield",
        "cmp-omni-mesh",
    }
    assert expected_ids.issubset(camp_ids)

    # Inspect Meridian FX campaign details
    mfx_resp = await async_client.get("/api/v1/campaigns/cmp-meridian-fx", headers=headers)
    assert mfx_resp.status_code == 200
    mfx = mfx_resp.json()
    assert mfx["cpm_usd"] == 5.50
    assert mfx["payout_cap_usd"] == 1800.00
    assert mfx["min_duration_sec"] == 25.0
    assert mfx["max_duration_sec"] == 58.0
    assert "@MeridianFX" in mfx["required_mentions"]
    assert "#MeridianFX" in mfx["required_hashtags"]

@pytest.mark.asyncio
async def test_four_tier_revenue_ledger_and_zero_hour_na(async_client: AsyncClient):
    """
    Sprint 5 Phase 5: Verifies the 4 explicit revenue tiers:
    1. Estimated revenue
    2. Operator-reported revenue
    3. Campaign-confirmed payable revenue
    4. Actually received payments
    And tests strict 'N/A' handling when production hours are zero or unavailable.
    """
    headers = {"Authorization": f"Bearer {settings.DEFAULT_API_KEY}"}

    # Publication registration
    pub_req = {
        "clip_id": "clip-tier-001",
        "campaign_id": "cmp-meridian-fx",
        "platform": "tiktok",
        "publication_url": "https://www.tiktok.com/@creator/video/7399887766554",
    }
    pub_resp = await async_client.post("/api/v1/performance/publications", json=pub_req, headers=headers)
    assert pub_resp.status_code == 201
    pub_id = pub_resp.json()["id"]

    # Case A: Snapshot with zero production hours (Must display N/A!)
    snap_zero_hours = {
        "publication_id": pub_id,
        "clip_id": "clip-tier-001",
        "campaign_id": "cmp-meridian-fx",
        "views_count": 100000,
        "reported_views_count": 90000,
        "verified_views_count": 60000,
        "confirmed_eligible_views_count": 60000,
        "cpm_usd": 5.50,
        "payout_cap_usd": 1800.0,
        "production_hours": 0.0, # Zero hours!
        "platform_fees_usd": 15.00,
        "production_cost_usd": 25.00,
        "actually_received_usd": 330.00,
        "payment_voucher_code": "VCH-MERIDIAN-2026-001",
        "reconciled": True,
        "notes": "Automated pipeline run - zero manual operator hours",
    }
    resp_zero = await async_client.post("/api/v1/performance/snapshots", json=snap_zero_hours, headers=headers)
    assert resp_zero.status_code == 201
    s_zero = resp_zero.json()

    # Tier 1 (Estimated): 100,000 / 1000 * 5.50 = $550.00
    assert s_zero["estimated_revenue_usd"] == 550.00
    # Tier 2 (Reported): 90,000 / 1000 * 5.50 = $495.00
    assert s_zero["reported_revenue_usd"] == 495.00
    # Tier 3 (Confirmed): 60,000 / 1000 * 5.50 = $330.00
    assert s_zero["confirmed_payable_usd"] == 330.00
    # Tier 4 (Received): $330.00
    assert s_zero["actually_received_usd"] == 330.00
    # Net profit: 330.00 - 15.00 - 25.00 = $290.00
    assert s_zero["net_profit_usd"] == 290.00
    # Production hours is 0.0 -> display must be strictly "N/A"
    assert s_zero["earnings_per_hour_usd"] is None
    assert s_zero["earnings_per_hour_display"] == "N/A"

    # Case B: Snapshot with positive production hours (2.5 hours)
    snap_with_hours = {
        "publication_id": pub_id,
        "clip_id": "clip-tier-001",
        "campaign_id": "cmp-meridian-fx",
        "views_count": 100000,
        "reported_views_count": 90000,
        "verified_views_count": 60000,
        "confirmed_eligible_views_count": 60000,
        "cpm_usd": 5.50,
        "payout_cap_usd": 1800.0,
        "production_hours": 2.5,
        "platform_fees_usd": 15.00,
        "production_cost_usd": 25.00,
        "actually_received_usd": 330.00,
        "payment_voucher_code": "VCH-MERIDIAN-2026-002",
        "reconciled": True,
        "notes": "Operator manual calibration (2.5h)",
    }
    resp_hours = await async_client.post("/api/v1/performance/snapshots", json=snap_with_hours, headers=headers)
    assert resp_hours.status_code == 201
    s_hours = resp_hours.json()
    # 290.00 / 2.5 = $116.00/hr
    assert s_hours["earnings_per_hour_usd"] == 116.00
    assert "$116.00/hr" in s_hours["earnings_per_hour_display"]

@pytest.mark.asyncio
async def test_payout_voucher_recording_and_ledger(async_client: AsyncClient):
    """
    Sprint 5 Phase 5: Records verified bank/escrow disbursement voucher in payouts table.
    """
    headers = {"Authorization": f"Bearer {settings.DEFAULT_API_KEY}"}

    voucher_req = {
        "campaign_id": "cmp-meridian-fx",
        "amount_usd": 330.00,
        "effective_cpm_usd": 5.50,
        "verified_views_counted": 60000,
        "reference_code": "MERIDIAN-DISBURSEMENT-2026-08A",
        "verification_state": "verified-paid",
        "clip_id": "clip-tier-001",
        "payment_voucher": {
            "bank_wire_ref": "WIRE-US-998822",
            "escrow_partner": "SponsorDirect Global",
            "audit_hash": "sha256:4b8a21f780e59c112",
        },
    }
    resp = await async_client.post("/api/v1/performance/payouts", json=voucher_req, headers=headers)
    assert resp.status_code == 201
    payout = resp.json()
    assert payout["id"].startswith("pay-")
    assert payout["amount_usd"] == 330.00
    assert payout["reference_code"] == "MERIDIAN-DISBURSEMENT-2026-08A"

    # List payouts for workspace
    list_resp = await async_client.get("/api/v1/performance/payouts", headers=headers)
    assert list_resp.status_code == 200
    payouts = list_resp.json()
    assert len(payouts) >= 1
    assert any(p["reference_code"] == "MERIDIAN-DISBURSEMENT-2026-08A" for p in payouts)

@pytest.mark.asyncio
async def test_atomic_database_backup(async_client: AsyncClient):
    """
    Sprint 5 Phase 6: Verifies atomic database backup endpoint and WAL checkpoint flush.
    """
    headers = {"Authorization": f"Bearer {settings.DEFAULT_API_KEY}"}
    resp = await async_client.post("/api/v1/performance/backup", headers=headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["status"] == "success"
    assert "argon_operations_" in data["backup_file"]
    assert data["size_bytes"] > 0
    assert Path(data["backup_path"]).exists()
