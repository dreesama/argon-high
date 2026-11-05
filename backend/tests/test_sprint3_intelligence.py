import asyncio
import pytest
from pathlib import Path
from httpx import AsyncClient

from app.services.campaign_service import campaign_service
from app.services.guard_service import guard_service
from app.services.framing_service import framing_service
from app.services.creative_qa_service import creative_qa_service
from app.services.job_queue import job_queue_service
from app.schemas.campaign import CampaignBriefIngestRequest, CampaignRuleUpdateRequest
from app.schemas.guard import RuleAttestationRequest
from app.schemas.intelligence import TranscriptSegmentSchema, TranscriptWordSchema

@pytest.mark.asyncio
async def test_campaign_brief_structured_ingestion(async_client: AsyncClient):
    """
    Sprint 3 Phase 2: Verifies structured extraction of platforms, duration bounds,
    hashtags, mentions, disclosures, prohibited topics, CPM, and unknown field retention.
    """
    brief_text = """
    Meridian Macro Keynote Campaign Brief:
    Targeting short-form distribution across TikTok, YouTube Shorts, and Instagram Reels.
    Videos must be between 20 and 55 seconds in length.
    All syndicated posts must include #MeridianMacro and #MacroArbitrage in caption, tagging @MeridianFX.
    Mandatory disclosure: "Sponsored by Meridian. Not financial advice."
    Strict exclusions: Do not discuss leverage trading, unverified exchanges, or personal tax strategies.
    Economics: Paying $4.50 CPM with a total campaign payout cap of $12,500.
    """
    req_data = {
        "title": "Meridian Macro Autumn Sprint",
        "sponsor_name": "Meridian FX",
        "brief_text": brief_text,
    }
    resp = await async_client.post("/api/v1/campaigns/ingest-brief", json=req_data)
    assert resp.status_code == 201
    camp = resp.json()
    assert camp["campaign_id"].startswith("cmp-")
    assert "tiktok" in camp["eligible_platforms"]
    assert "youtube_shorts" in camp["eligible_platforms"]
    assert "instagram_reels" in camp["eligible_platforms"]
    assert camp["min_duration_sec"] == 20.0
    assert camp["max_duration_sec"] == 55.0
    assert "MeridianMacro" in camp["required_hashtags"]
    assert "MeridianFX" in camp["required_mentions"]
    assert camp["cpm_usd"] == 4.5
    assert camp["payout_cap_usd"] == 12500.0
    assert len(camp["prohibited_topics"]) >= 1

    # Verify that unknown fields remain unknown without invented defaults
    assert "licensing_terms" in camp["unknown_fields"]
    assert camp["licensing_terms"] is None

    # Verify evidence quotes and confidence scores on extracted rules
    for rule in camp["extracted_rules"]:
        assert rule["confidence"] > 0.0
        assert rule["status"] in ["extracted", "unknown"]
        if rule["status"] == "extracted":
            assert rule["evidence_quote"] is not None

@pytest.mark.asyncio
async def test_campaign_rule_human_editing(async_client: AsyncClient):
    """
    Sprint 3 Phase 2: Verifies that human operators can edit, verify, and annotate extracted rules.
    """
    # 1. Ingest
    ingest_resp = await async_client.post("/api/v1/campaigns/ingest-brief", json={
        "title": "Aura Biotech Ingestion",
        "sponsor_name": "Aura Labs",
        "brief_text": "Authorized clips under 60 seconds on TikTok. #AuraBiotech required.",
    })
    camp = ingest_resp.json()
    cid = camp["campaign_id"]
    rule = camp["extracted_rules"][0]
    rule_id = rule["rule_id"]

    # 2. Operator updates rule
    update_data = {
        "value": ["tiktok", "youtube_shorts"],
        "status": "human_modified",
        "notes": "Operator manually approved YouTube Shorts expansion after sponsor email confirmation.",
    }
    update_resp = await async_client.put(f"/api/v1/campaigns/{cid}/rules/{rule_id}", json=update_data)
    assert update_resp.status_code == 200
    updated_camp = update_resp.json()
    updated_rule = next(r for r in updated_camp["extracted_rules"] if r["rule_id"] == rule_id)
    assert updated_rule["status"] == "human_modified"
    assert updated_rule["value"] == ["tiktok", "youtube_shorts"]
    assert "approved YouTube Shorts" in updated_rule["notes"]

@pytest.mark.asyncio
async def test_guard_v2_preflight_validation_and_attestation(async_client: AsyncClient, sample_video_path: Path):
    """
    Sprint 3 Phase 3: Verifies Argon Guard v2 deterministic FFprobe/FFmpeg checks,
    consistent status model (PASS, FAIL, WARNING, UNKNOWN, HUMAN_REVIEW_REQUIRED),
    blocking export readiness until human review attestation is submitted.
    """
    # 1. Ingest brief with 15s to 45s duration limit
    camp_resp = await async_client.post("/api/v1/campaigns/ingest-brief", json={
        "title": "Quantum Guard Campaign",
        "sponsor_name": "Quantum Capital",
        "brief_text": "Clips between 2 and 6 seconds for testing. #QuantumAI. Do not discuss insider trading.",
    })
    camp_id = camp_resp.json()["campaign_id"]

    # 2. Upload source
    video_bytes = sample_video_path.read_bytes()
    upload_resp = await async_client.post("/api/v1/media/upload", files={"file": ("guard_src.mp4", video_bytes, "video/mp4")})
    source_id = upload_resp.json()["source_asset_id"]

    # 3. Render 9:16 vertical 1080x1920 clip (duration ~3s)
    render_resp = await async_client.post("/api/v1/render/jobs", json={
        "source_asset_id": source_id,
        "clip_id": "clip-guard-test-01",
        "campaign_id": camp_id,
        "start_sec": 1.0,
        "end_sec": 4.0,
        "target_width": 1080,
        "target_height": 1920,
        "burn_captions": True,
        "caption_preset": "kinetic-lime",
        "fade_audio": True,
    })
    job_id = render_resp.json()["job_id"]

    for _ in range(40):
        await asyncio.sleep(0.5)
        poll = (await async_client.get(f"/api/v1/render/jobs/{job_id}")).json()
        if poll["status"] == "completed":
            break
    assert poll["status"] == "completed"

    # 4. Run Guard V2 Pre-Flight Validation
    guard_resp = await async_client.post("/api/v1/guard/validate-clip", json={
        "job_id": job_id,
        "campaign_id": camp_id,
        "clip_id": "clip-guard-test-01",
    })
    assert guard_resp.status_code == 200
    report = guard_resp.json()
    report_id = report["report_id"]

    # Check statuses
    assert report["total_checks"] >= 10
    assert report["passed_count"] >= 6
    assert report["review_required_count"] >= 2
    # Because human editorial reviews are pending, overall status must be REQUIRES_REVIEW and NOT export ready!
    assert report["overall_status"] == "REQUIRES_REVIEW"
    assert report["is_export_ready"] is False

    # Check specific deterministic checks
    checks_by_id = {c["check_id"]: c for c in report["checks"]}
    assert checks_by_id["chk-res-1080x1920"]["status"] == "PASS"
    assert checks_by_id["chk-aspect-9-16"]["status"] == "PASS"
    assert checks_by_id["chk-codec-h264"]["status"] == "PASS"
    assert checks_by_id["chk-container-integrity"]["status"] == "PASS"
    assert checks_by_id["chk-campaign-duration"]["status"] == "PASS"

    # 5. Submit Human Attestations
    proh_attest = {
        "check_id": "chk-attest-prohibited",
        "attestation_status": "PASS",
        "reviewer_notes": "Reviewed full clip audio and transcript: zero insider trading references.",
        "attested_by": "Compliance Officer Jack Reed",
    }
    attest1_resp = await async_client.post(f"/api/v1/guard/reports/{report_id}/attest", json=proh_attest)
    assert attest1_resp.status_code == 200

    lic_attest = {
        "check_id": "chk-attest-licensing",
        "attestation_status": "PASS",
        "reviewer_notes": "Verified source guest appearance agreement #RELEASE-2026-QC.",
        "attested_by": "Legal Reviewer Sarah Vance",
    }
    attest2_resp = await async_client.post(f"/api/v1/guard/reports/{report_id}/attest", json=lic_attest)
    assert attest2_resp.status_code == 200
    final_report = attest2_resp.json()

    # Now that all blocking human reviews are attested, export readiness is granted!
    assert final_report["review_required_count"] == 0
    assert final_report["failed_count"] == 0
    assert final_report["overall_status"] == "PASS"
    assert final_report["is_export_ready"] is True

def test_smart_framing_safe_zones():
    """
    Sprint 3 Phase 4: Verifies smart vertical framing coordinate calculation,
    clamping, manual offset shift, and the 4 short-form safe zones.
    """
    res = framing_service.calculate_framing(
        source_width=1920,
        source_height=1080,
        target_width=1080,
        target_height=1920,
        manual_offset_x=10,
    )
    assert res.target_width == 1080
    assert res.target_height == 1920
    assert res.crop_height == 1080
    assert res.crop_width == 608  # 1080 * (1080/1920) = 607.5 -> 608
    assert 0 <= res.crop_x <= (1920 - res.crop_width)
    assert res.manual_offset_applied == 10
    assert res.tracking_mode in ["auto_face_tracked", "center_safe_area", "manual_calibrated"]
    assert len(res.safe_zones) == 4
    zone_names = [z.name for z in res.safe_zones]
    assert "Header Safe Zone" in zone_names
    assert "Primary Action Zone" in zone_names
    assert "Caption Safe Zone" in zone_names
    assert "Platform UI Danger Zone" in zone_names

def test_creative_qa_awkward_cut_detection():
    """
    Sprint 3 Phase 5: Verifies creative QA detection of awkward starts, excessive silence,
    subtitle overflow, and recommended trim adjustments.
    """
    # Create segments with leading conjunction and missing punctuation
    sample_segments = [
        TranscriptSegmentSchema(
            id="seg-qa-1",
            start_sec=1.0,
            end_sec=5.0,
            text="And the revenue growth rate accelerated but failed to meet expectations",
            confidence_pct=95.0,
            words=[
                TranscriptWordSchema(word="And", start_sec=1.1, end_sec=1.4, probability=0.96),
                TranscriptWordSchema(word="the", start_sec=1.4, end_sec=1.6, probability=0.97),
                TranscriptWordSchema(word="revenue", start_sec=1.6, end_sec=2.1, probability=0.98),
                TranscriptWordSchema(word="growth", start_sec=2.1, end_sec=2.5, probability=0.95),
                TranscriptWordSchema(word="rate", start_sec=2.5, end_sec=2.8, probability=0.97),
                TranscriptWordSchema(word="accelerated", start_sec=2.8, end_sec=3.4, probability=0.96),
                TranscriptWordSchema(word="expectations", start_sec=4.0, end_sec=4.8, probability=0.95),
            ],
        )
    ]
    report = creative_qa_service.evaluate_clip_creative_quality(
        clip_id="clip-test-qa",
        source_asset_id="src-test-qa",
        start_sec=0.0,
        end_sec=5.0,
        transcript_segments=sample_segments,
    )
    assert report.awkward_start_detected is True
    assert "conjunction" in report.awkward_start_reason.lower()
    assert report.awkward_ending_detected is True
    assert "punctuation" in report.awkward_ending_reason.lower()
    assert report.suggested_adjustments is not None
    assert report.suggested_adjustments.suggested_start_sec >= 0.0
    assert report.suggested_adjustments.suggested_end_sec > report.suggested_adjustments.suggested_start_sec
    assert "experimental algorithmic heuristics" in report.heuristic_model_disclaimer

@pytest.mark.asyncio
async def test_job_cancellation_and_workspace_isolation(async_client: AsyncClient, sample_video_path: Path):
    """
    Sprint 3 Phase 6: Verifies job cancellation endpoint and workspace-level authorization enforcement.
    """
    # 1. Upload
    video_bytes = sample_video_path.read_bytes()
    upload_resp = await async_client.post("/api/v1/media/upload", files={"file": ("cancel_src.mp4", video_bytes, "video/mp4")})
    source_id = upload_resp.json()["source_asset_id"]

    # 2. Create job in workspace 'ws-syndicate-alpha'
    job_req = {
        "source_asset_id": source_id,
        "clip_id": "clip-cancel-test",
        "workspace_id": "ws-syndicate-alpha",
        "start_sec": 0.5,
        "end_sec": 4.5,
    }
    render_resp = await async_client.post("/api/v1/render/jobs", json=job_req)
    job_data = render_resp.json()
    job_id = job_data["job_id"]
    token = job_data["download_token"]

    # 3. Test workspace isolation on download: mismatched tenant workspace header must return 403 Forbidden
    mismatched_resp = await async_client.get(
        f"/api/v1/render/output/{job_id}/download?token={token}",
        headers={"X-Workspace-Id": "ws-hacker-tenant-beta"},
    )
    assert mismatched_resp.status_code == 403
    assert "Access denied to tenant workspace" in mismatched_resp.json()["detail"]

    # 4. Cancel job
    cancel_resp = await async_client.post(f"/api/v1/render/jobs/{job_id}/cancel")
    assert cancel_resp.status_code == 200
    cancelled_job = cancel_resp.json()
    assert cancelled_job["status"] == "cancelled"
    assert "cancellation_reason" in cancelled_job
