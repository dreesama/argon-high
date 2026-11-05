import asyncio
import re
from pathlib import Path
from decimal import Decimal
import pytest
from httpx import AsyncClient

from app.core.config import settings
from app.db.database import db_manager
from app.schemas.campaign import CampaignBriefIngestRequest
from app.schemas.render import RenderJobCreate
from app.services.campaign_service import campaign_service
from app.services.transcription_service import transcription_service
from app.services.quality_benchmark_service import quality_benchmark_service
from app.services.performance_service import performance_service
from app.services.job_queue import job_queue_service

@pytest.mark.asyncio
async def test_remediation_unauthenticated_requests_strictly_rejected(unauthenticated_async_client: AsyncClient):
    """
    Requirement 1 & 3: Proves that requests missing Authorization header are strictly rejected
    with 401 Unauthorized rather than falling back to default/hardcoded developer keys.
    """
    endpoints = [
        ("GET", "/api/v1/campaigns"),
        ("POST", "/api/v1/campaigns/ingest-brief"),
        ("GET", "/api/v1/performance/summary"),
        ("POST", "/api/v1/performance/approvals"),
        ("POST", "/api/v1/performance/publications"),
        ("POST", "/api/v1/render/jobs"),
    ]
    for method, ep in endpoints:
        if method == "GET":
            resp = await unauthenticated_async_client.get(ep)
        else:
            resp = await unauthenticated_async_client.post(ep, json={})
        assert resp.status_code == 401, f"Endpoint {method} {ep} should return 401, got {resp.status_code}"
        assert resp.headers.get("www-authenticate") == "Bearer"

@pytest.mark.asyncio
async def test_remediation_invalid_bearer_headers_rejected(unauthenticated_async_client: AsyncClient):
    """
    Requirement 1 & 3: Proves that malformed, short, or forged Bearer tokens are strictly rejected
    with 401 Unauthorized under RFC 6750.
    """
    invalid_headers = [
        "Bearer",
        "Bearer   ",
        "Basic dXNlcjpwYXNz",
        "Token short",
        "Bearer forged_nonexistent_token_12345",
        "Bearer test-valid-token-alias-removed",
        "Bearer argon-dev-token-removed",
    ]
    for hdr in invalid_headers:
        resp = await unauthenticated_async_client.get(
            "/api/v1/campaigns",
            headers={"Authorization": hdr},
        )
        assert resp.status_code == 401, f"Header '{hdr}' expected 401, got {resp.status_code}"
        assert "detail" in resp.json()

@pytest.mark.asyncio
async def test_remediation_cross_workspace_media_access_rejected(
    async_client: AsyncClient,
    unauthenticated_async_client: AsyncClient,
    sample_video_path: Path,
):
    """
    Requirement 1 & 3: Proves cross-workspace access to source media inspection and streaming
    is strictly rejected with 403 Forbidden.
    """
    # 1. Upload source asset into ws-argon-core
    video_bytes = sample_video_path.read_bytes()
    upload_resp = await async_client.post(
        "/api/v1/media/upload",
        files={"file": ("tenant_isolation_test.mp4", video_bytes, "video/mp4")},
        data={"campaign_id": "cmp-meridian-fx", "title": "Isolation Test Video"},
        headers={"Authorization": f"Bearer {settings.DEFAULT_API_KEY}", "X-Workspace-Id": "ws-argon-core"},
    )
    assert upload_resp.status_code == 201
    source_id = upload_resp.json()["source_asset_id"]

    # 2. Partner user (usr-meridian-partner with membership ONLY in ws-partner-meridian)
    partner_headers = {"Authorization": "Bearer meridian_partner_token_2026"}

    # Attempt to inspect ws-argon-core media
    inspect_resp = await async_client.get(f"/api/v1/media/{source_id}/inspect", headers=partner_headers)
    assert inspect_resp.status_code == 403
    assert "Cross-workspace" in inspect_resp.json()["detail"] or "Forbidden" in inspect_resp.json()["detail"]

    # Attempt to stream ws-argon-core media
    stream_resp = await async_client.get(f"/api/v1/media/{source_id}/stream", headers=partner_headers)
    assert stream_resp.status_code == 403
    assert "Cross-workspace access rejected" in stream_resp.json()["detail"] or "Forbidden" in stream_resp.json()["detail"]

    # Attempt unauthenticated media streaming
    unauth_stream = await unauthenticated_async_client.get(f"/api/v1/media/{source_id}/stream")
    assert unauth_stream.status_code == 401

@pytest.mark.asyncio
async def test_remediation_render_media_authorization_and_isolation(
    async_client: AsyncClient,
    sample_video_path: Path,
):
    """
    Requirement 1 & 3: Proves render preview and download endpoints strictly enforce
    token verification and reject cross-workspace unauthorized access.
    """
    job_params = RenderJobCreate(
        source_asset_id="src-remediation-test",
        clip_id="clip-remediation-001",
        campaign_id="cmp-meridian-fx",
        start_sec=0.5,
        end_sec=2.5,
        workspace_id="ws-argon-core",
    )
    job = await job_queue_service.enqueue_render_job(job_params, sample_video_path)
    job.output_filename = "remediation_output.mp4"
    (settings.RENDER_DIR / "remediation_output.mp4").write_bytes(b"test rendered mp4 bits")

    # 1. Partner user (ws-partner-meridian) attempting to preview ws-argon-core job
    partner_headers = {"Authorization": "Bearer meridian_partner_token_2026"}
    partner_preview = await async_client.get(f"/api/v1/render/output/{job.job_id}/preview", headers=partner_headers)
    assert partner_preview.status_code == 403
    assert "Cross-workspace access rejected" in partner_preview.json()["detail"]

    # 2. Forged download token
    forged_dl = await async_client.get(
        f"/api/v1/render/output/{job.job_id}/download?token=forged_unauthorized_token_12345",
        headers={},
    )
    assert forged_dl.status_code == 403
    assert "Invalid media access token" in forged_dl.json()["detail"]

    # 3. Valid download token succeeds
    valid_dl = await async_client.get(
        f"/api/v1/render/output/{job.job_id}/download?token={job.download_token}",
        headers={},
    )
    assert valid_dl.status_code == 200

def test_remediation_live_mode_rejects_synthetic_hallucination(sample_video_path: Path):
    """
    Requirement 5: Proves that in Live mode (allow_synthetic_fallback=False),
    audio containing no speech returns an explicit no-speech result (0 segments, 0 candidates)
    without fabricating synthetic phrases ('Welcome back to Argon High Deep Dive...').
    """
    res = transcription_service.analyze_source_audio(
        source_asset_id="src-non-vocal-check",
        media_path=sample_video_path,
        allow_synthetic_fallback=False,
    )
    assert len(res.full_transcript) == 0
    assert res.total_segments == 0
    assert len(res.candidates) == 0
    assert "No speech detected" in res.diarization_status
    # Verify no fabricated text leaked
    all_text = " ".join(s.text for s in res.full_transcript)
    assert "Welcome back" not in all_text
    assert "SaaS acquisition models" not in all_text

def test_remediation_benchmark_real_measurements_or_unavailable(real_spoken_sample_path: Path, sample_video_path: Path):
    """
    Requirement 6: Proves benchmark scorecard metrics are genuinely measured from speech/word timestamps
    and explicitly marked unavailable when reference or alignment is absent.
    """
    # 1. Real spoken media with ground-truth reference
    ref_text = "When you strip away legacy orchestration overhead and pin memory bandwidth directly to the inference kernel, throughput per dollar jumps 2.9x overnight."
    sc_ref = quality_benchmark_service.evaluate_media_sample(
        media_path=real_spoken_sample_path,
        reference_transcript=ref_text,
    )
    assert sc_ref.reference_ground_truth_provided is True
    assert sc_ref.transcription_accuracy_pct is not None
    assert sc_ref.transcription_accuracy_pct >= 85.0
    assert sc_ref.caption_sync_drift_ms is not None
    assert sc_ref.export_reliability_score == 100

    # 2. Non-speech media: Metrics must be explicitly marked unavailable, NOT hardcoded 95.0% or 18.5ms
    sc_silent = quality_benchmark_service.evaluate_media_sample(
        media_path=sample_video_path,
        reference_transcript=None,
    )
    assert sc_silent.reference_ground_truth_provided is False
    assert sc_silent.transcription_accuracy_pct is None
    assert sc_silent.caption_sync_drift_ms is None
    assert any("unavailable" in f.lower() for f in sc_silent.findings)

def test_remediation_campaign_synthetic_isolation():
    """
    Requirement 7: Proves that synthetic test campaigns are flagged with is_synthetic=True
    and excluded from production workspace listings.
    """
    # Ingest synthetic test fixture
    syn_req = CampaignBriefIngestRequest(
        campaign_id="cmp-synthetic-test-fixture",
        title="Synthetic Fixture Brief",
        sponsor_name="Test Sponsor",
        brief_text="Between 15 and 30 seconds on TikTok. Payout cap $500, CPM $4.00.",
        workspace_id="ws-argon-core",
        is_synthetic=True,
    )
    camp = campaign_service.ingest_brief(syn_req)
    assert camp.is_synthetic is True

    # Listing without synthetic campaigns excludes fixture
    prod_camps = campaign_service.list_campaigns(workspace_id="ws-argon-core", include_synthetic=False)
    prod_ids = [c.campaign_id for c in prod_camps]
    assert "cmp-synthetic-test-fixture" not in prod_ids

    # Listing with include_synthetic includes it
    all_camps = campaign_service.list_campaigns(workspace_id="ws-argon-core", include_synthetic=True)
    all_ids = [c.campaign_id for c in all_camps]
    assert "cmp-synthetic-test-fixture" in all_ids

@pytest.mark.asyncio
async def test_remediation_financial_decimal_precision_and_evidence_requirement(async_client: AsyncClient):
    """
    Requirement 8: Proves financial ledger calculations use Decimal minor-unit precision
    and strictly reject unverified received payouts lacking explicit voucher receipt evidence.
    """
    headers = {"Authorization": f"Bearer {settings.DEFAULT_API_KEY}"}

    # Register publication
    pub_req = {
        "clip_id": "clip-dec-001",
        "campaign_id": "cmp-meridian-fx",
        "platform": "youtube_shorts",
        "publication_url": "https://www.youtube.com/shorts/test_decimal_9988",
    }
    pub = await async_client.post("/api/v1/performance/publications", json=pub_req, headers=headers)
    assert pub.status_code == 201
    pub_id = pub.json()["id"]

    # 1. Attempt to claim actually_received_usd > 0 WITHOUT voucher code evidence (Must be rejected with 422)
    unverified_claim = {
        "publication_id": pub_id,
        "clip_id": "clip-dec-001",
        "campaign_id": "cmp-meridian-fx",
        "views_count": 50000,
        "actually_received_usd": 275.00,
        # Missing payment_voucher_code!
    }
    rej_resp = await async_client.post("/api/v1/performance/snapshots", json=unverified_claim, headers=headers)
    assert rej_resp.status_code == 422
    assert "payment voucher code" in rej_resp.json()["detail"].lower()

    # 2. Legitimate claim with voucher code succeeds and performs exact Decimal math
    valid_claim = {
        "publication_id": pub_id,
        "clip_id": "clip-dec-001",
        "campaign_id": "cmp-meridian-fx",
        "views_count": 50000,
        "reported_views_count": 48000,
        "verified_views_count": 45000,
        "confirmed_eligible_views_count": 45000,
        "cpm_usd": 5.50,
        "payout_cap_usd": 1800.00,
        "production_hours": 1.75,
        "platform_fees_usd": 12.35,
        "production_cost_usd": 15.65,
        "actually_received_usd": 247.50,
        "payment_voucher_code": "VCH-DECIMAL-ESCROW-2026-X99",
        "reconciled": True,
    }
    ok_resp = await async_client.post("/api/v1/performance/snapshots", json=valid_claim, headers=headers)
    assert ok_resp.status_code == 201
    data = ok_resp.json()

    # Tier 1 Estimated: 50,000 / 1000 * 5.50 = 275.00
    assert data["estimated_revenue_usd"] == 275.00
    # Tier 2 Reported: 48,000 / 1000 * 5.50 = 264.00
    assert data["reported_revenue_usd"] == 264.00
    # Tier 3 Confirmed: 45,000 / 1000 * 5.50 = 247.50
    assert data["confirmed_payable_usd"] == 247.50
    # Tier 4 Received: 247.50
    assert data["actually_received_usd"] == 247.50
    # Net profit: 247.50 - 12.35 - 15.65 = 219.50
    assert data["net_profit_usd"] == 219.50
    # Earnings per hour: 219.50 / 1.75 = 125.43
    assert data["earnings_per_hour_usd"] == 125.43
    assert "$125.43/hr" in data["earnings_per_hour_display"]

def test_remediation_supabase_storage_tenant_isolation_in_sql_migrations():
    """
    Requirement 4: Proves both SQL migration scripts enforce tenant isolation on Supabase Storage
    buckets, preventing cross-tenant access to raw-sources and rendered-clips.
    """
    mig1_path = Path("backend/migrations/001_initial_schema.sql")
    mig2_path = Path("backend/migrations/002_production_parity_and_rls.sql")

    assert mig1_path.exists() and mig2_path.exists()
    mig1_sql = mig1_path.read_text(encoding="utf-8")
    mig2_sql = mig2_path.read_text(encoding="utf-8")

    # In both migrations, storage policies must scope access by storage.foldername(name)[1] matching user workspaces
    for name, sql in [("001_initial_schema.sql", mig1_sql), ("002_production_parity_and_rls.sql", mig2_sql)]:
        assert "storage.foldername(name)" in sql, f"Migration {name} missing storage folder tenant extraction"
        assert "raw-sources" in sql, f"Migration {name} missing raw-sources bucket definition"
        assert "rendered-clips" in sql, f"Migration {name} missing rendered-clips bucket definition"
        assert "current_user_workspaces" in sql or "workspace_members" in sql, f"Migration {name} missing workspace membership check on storage"

@pytest.mark.asyncio
async def test_remediation_user_session_token_expiration_rejected(async_client: AsyncClient):
    """
    Requirement 2: Proves expired user sessions are rejected with 401 Unauthorized.
    """
    from datetime import datetime, timezone, timedelta
    from app.db.database import db_manager

    # Insert a temporary user with an expired token
    expired_time = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    conn = db_manager.get_connection()
    conn.execute("""
    INSERT OR REPLACE INTO users (id, email, name, api_token, system_role, token_expires_at_iso, created_at_iso)
    VALUES ('usr-test-expired', 'expired@argonhigh.internal', 'Expired User', 'token_session_expired_12345', 'operator', ?, ?);
    """, (expired_time, expired_time))
    conn.execute("""
    INSERT OR REPLACE INTO workspace_members (workspace_id, user_id, role, joined_at_iso)
    VALUES ('ws-argon-core', 'usr-test-expired', 'operator', ?);
    """, (expired_time,))
    conn.commit()
    conn.close()

    resp = await async_client.get(
        "/api/v1/campaigns/list",
        headers={"Authorization": "Bearer token_session_expired_12345"},
    )
    assert resp.status_code == 401
    assert "token has expired" in resp.json()["detail"].lower()

@pytest.mark.asyncio
async def test_remediation_unregistered_filesystem_media_glob_strictly_rejected(async_client: AsyncClient):
    """
    Requirement 3: Proves that files on the filesystem not registered in the authoritative DB/registry
    cannot be accessed or streamed, preventing filesystem globbing vulnerabilities.
    """
    fake_asset_id = "src_unregistered_orphan_999"
    orphan_file = settings.UPLOAD_DIR / f"{fake_asset_id}_secret_leak.mp4"
    orphan_file.write_bytes(b"dummy fake media header data")

    try:
        # 1. Attempt inspection
        insp_resp = await async_client.get(f"/api/v1/media/{fake_asset_id}/inspect")
        assert insp_resp.status_code == 404
        assert "not found in authoritative records" in insp_resp.json()["detail"].lower()

        # 2. Attempt stream
        stream_resp = await async_client.get(f"/api/v1/media/{fake_asset_id}/stream")
        assert stream_resp.status_code == 404
        assert "not found in authoritative records" in stream_resp.json()["detail"].lower()

        # 3. Attempt trigger render job
        render_resp = await async_client.post(
            "/api/v1/render/jobs",
            json={
                "source_asset_id": fake_asset_id,
                "start_sec": 0.0,
                "end_sec": 5.0,
            },
        )
        assert render_resp.status_code == 404
        assert "not found in authoritative records" in render_resp.json()["detail"].lower()
    finally:
        orphan_file.unlink(missing_ok=True)

def test_remediation_production_startup_denies_missing_or_insecure_secrets():
    """
    Requirement 2: Proves lifespan startup raises RuntimeError when ENVIRONMENT=production
    and SECRET_KEY or ARGON_API_KEY is missing or insecure.
    """
    import asyncio
    from app.main import lifespan
    from fastapi import FastAPI
    from unittest.mock import patch

    test_app = FastAPI()

    # 1. Insecure default secret in production raises RuntimeError
    with patch("app.main.settings.ENVIRONMENT", "production"), \
         patch("app.main.settings.SECRET_KEY", "argon-high-dev-secret-key-insecure-local-only"), \
         patch("app.main.settings.DEFAULT_API_KEY", "prod_valid_token_32chars_long_12345678"):
        with pytest.raises(RuntimeError, match="FATAL: Insecure or missing SECRET_KEY in production"):
            async def run_cm():
                async with lifespan(test_app):
                    pass
            asyncio.run(run_cm())

    # 2. Default dev API key in production raises RuntimeError
    with patch("app.main.settings.ENVIRONMENT", "production"), \
         patch("app.main.settings.SECRET_KEY", "production_strong_secret_key_exceeds_32_chars_now"), \
         patch("app.main.settings.DEFAULT_API_KEY", "argon_dev_token_syndicate_2026"):
        with pytest.raises(RuntimeError, match="FATAL: Insecure or default ARGON_API_KEY in production"):
            async def run_cm2():
                async with lifespan(test_app):
                    pass
            asyncio.run(run_cm2())

def test_remediation_financial_integer_minor_units_persistence():
    """
    Requirement 5: Proves financial ledger records store exact integer minor units (cents)
    in SQLite performance_snapshots and payouts tables without floating-point precision loss.
    """
    from decimal import Decimal
    from app.db.database import db_manager
    from app.services.performance_service import performance_service
    from app.schemas.performance import PerformanceSnapshotCreateRequest, PayoutCreateRequest

    snap = performance_service.record_snapshot(
        req=PerformanceSnapshotCreateRequest(
            publication_id="pub-exact-cents-test",
            clip_id="clip-cents-01",
            campaign_id="cmp-meridian-fx",
            views_count=35420,
            verified_views_count=35420,
            cpm_usd=4.75,
            payout_cap_usd=1000.0,
            platform_fees_usd=8.41,
            production_cost_usd=12.19,
            reconciled=True,
            actually_received_usd=168.25,
            payment_voucher_code="VCH-EXACT-CENTS-999",
        ),
        workspace_id="ws-argon-core",
    )

    # Verify database integer minor units column
    conn = db_manager.get_connection()
    row = conn.execute("SELECT * FROM performance_snapshots WHERE id = ?;", (snap.id,)).fetchone()
    conn.close()

    assert row is not None
    # 35.42 * 4.75 = 168.245 -> 168.25 USD -> 16825 cents
    assert row["confirmed_payable_cents"] == 16825
    assert row["actually_received_cents"] == 16825
    assert row["platform_fees_cents"] == 841
    assert row["production_cost_cents"] == 1219
    # Net profit: 168.25 - 8.41 - 12.19 = 147.65 -> 14765 cents
    assert row["net_profit_cents"] == 14765

    # Verify Payouts integer minor units
    payout = performance_service.record_payout(
        req=PayoutCreateRequest(
            campaign_id="cmp-meridian-fx",
            amount_usd=168.25,
            effective_cpm_usd=4.75,
            verified_views_counted=35420,
            reference_code="PAY-EXACT-CENTS-001",
            verification_state="verified-paid",
        ),
        workspace_id="ws-argon-core",
    )

    conn2 = db_manager.get_connection()
    p_row = conn2.execute("SELECT * FROM payouts WHERE id = ?;", (payout.id,)).fetchone()
    conn2.close()

    assert p_row is not None
    assert p_row["amount_cents"] == 16825

