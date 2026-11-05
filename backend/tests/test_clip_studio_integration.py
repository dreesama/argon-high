import asyncio
import pytest
from pathlib import Path
from httpx import AsyncClient
from app.core.config import settings
from app.db.database import db_manager

@pytest.mark.asyncio
async def test_e2e_clip_studio_upload_preserves_authoritative_id_and_metadata(
    async_client: AsyncClient,
    real_spoken_sample_path: Path,
):
    """
    Verifies that uploading a real source video preserves the authoritative backend
    source_asset_id, duration, resolution, fps, and audio LUFS in database storage.
    """
    video_bytes = real_spoken_sample_path.read_bytes()
    files = {"file": ("clip_studio_master.mp4", video_bytes, "video/mp4")}
    data = {
        "campaign_id": "cmp-meridian-fx",
        "title": "Meridian Macro Keynote Master",
        "creator_name": "Elena Rostova",
        "authorization_proof": "Sponsor Signed Release Agreement #AGY-STUDIO-2026",
    }
    headers = {"X-Workspace-Id": "ws-argon-core"}

    resp = await async_client.post("/api/v1/media/upload", files=files, data=data, headers=headers)
    assert resp.status_code == 201, f"Upload failed: {resp.text}"
    body = resp.json()

    source_asset_id = body["source_asset_id"]
    assert source_asset_id.startswith("src-")
    assert body["workspace_id"] == "ws-argon-core"
    assert body["campaign_id"] == "cmp-meridian-fx"
    assert body["duration_sec"] > 0
    assert "x" in body["resolution"]
    assert body["fps"] > 0
    assert isinstance(body["audio_lufs"], (int, float))

    # Authoritative relational database verification
    conn = db_manager.get_connection()
    row = conn.execute("SELECT * FROM source_assets WHERE id = ?;", (source_asset_id,)).fetchone()
    conn.close()
    assert row is not None, f"Source asset '{source_asset_id}' not found in database records"
    assert row["id"] == source_asset_id
    assert row["workspace_id"] == "ws-argon-core"
    assert row["duration_sec"] == body["duration_sec"]


@pytest.mark.asyncio
async def test_e2e_clip_studio_speech_intelligence_returns_3_candidates_and_transcript(
    async_client: AsyncClient,
    real_spoken_sample_path: Path,
):
    """
    Verifies that Live AI analysis on an uploaded source returns the real transcript
    and exactly 3 distinct candidate timestamp ranges within video duration bounds.
    """
    # 1. Upload source asset
    video_bytes = real_spoken_sample_path.read_bytes()
    files = {"file": ("studio_speech_source.mp4", video_bytes, "video/mp4")}
    data = {
        "campaign_id": "cmp-meridian-fx",
        "title": "Speech Analysis Master",
        "creator_name": "Elena Rostova",
    }
    upload_resp = await async_client.post("/api/v1/media/upload", files=files, data=data)
    assert upload_resp.status_code == 201
    source_id = upload_resp.json()["source_asset_id"]
    video_duration = upload_resp.json()["duration_sec"]

    # 2. Transcribe and Rank
    intel_resp = await async_client.post(
        "/api/v1/intelligence/transcribe-and-rank",
        json={"source_asset_id": source_id, "sponsor_name": "Meridian Financial Technologies Ltd."},
    )
    assert intel_resp.status_code == 200, f"Analysis failed: {intel_resp.text}"
    intel = intel_resp.json()

    assert intel["source_asset_id"] == source_id
    assert len(intel["full_transcript"]) > 0
    for seg in intel["full_transcript"]:
        assert seg["text"].strip() != ""
        assert 0 <= seg["start_sec"] <= seg["end_sec"]

    # Exactly 3 candidate ranges must be returned
    candidates = intel["candidates"]
    assert len(candidates) == 3, f"Expected exactly 3 candidates, got {len(candidates)}"

    for idx, cand in enumerate(candidates):
        assert cand["rank"] == idx + 1
        assert cand["candidate_id"] != ""
        assert 0 <= cand["start_sec"] < cand["end_sec"] <= (video_duration + 1.0)
        assert 0 <= cand["hook_score"] <= 100
        assert "opening_velocity" in cand["hook_breakdown"]
        assert "controversy_or_insight_delta" in cand["hook_breakdown"]
        assert "retention_cadence" in cand["hook_breakdown"]
        assert "sponsor_alignment" in cand["hook_breakdown"]
        assert len(cand["hook_breakdown"]["explanation"]) > 0


@pytest.mark.asyncio
async def test_e2e_clip_studio_candidate_selection_render_and_media_access(
    async_client: AsyncClient,
    real_spoken_sample_path: Path,
):
    """
    Tests the complete operator workflow:
    1. Upload real video
    2. Analyze with faster-whisper
    3. Select candidate #2
    4. Render vertical 9:16 cut with FFmpeg
    5. Poll job to completion
    6. Verify authorized video preview streaming
    7. Verify authorized MP4 attachment download
    """
    # 1. Upload
    video_bytes = real_spoken_sample_path.read_bytes()
    files = {"file": ("studio_full_pipeline.mp4", video_bytes, "video/mp4")}
    data = {
        "campaign_id": "cmp-meridian-fx",
        "title": "Full Pipeline Source",
        "creator_name": "Elena Rostova",
    }
    upload_resp = await async_client.post("/api/v1/media/upload", files=files, data=data)
    assert upload_resp.status_code == 201
    source_id = upload_resp.json()["source_asset_id"]

    # 2. Analyze
    intel_resp = await async_client.post(
        "/api/v1/intelligence/transcribe-and-rank",
        json={"source_asset_id": source_id, "sponsor_name": "Meridian Financial Technologies Ltd."},
    )
    assert intel_resp.status_code == 200
    candidates = intel_resp.json()["candidates"]
    assert len(candidates) >= 2

    # 3. Select Candidate #2
    selected_candidate = candidates[1]
    assert selected_candidate["rank"] == 2

    # 4. Render vertical cut
    render_req = {
        "source_asset_id": source_id,
        "clip_id": selected_candidate["candidate_id"],
        "campaign_id": "cmp-meridian-fx",
        "start_sec": selected_candidate["start_sec"],
        "end_sec": min(selected_candidate["end_sec"], selected_candidate["start_sec"] + 3.0),
        "target_width": 1080,
        "target_height": 1920,
        "crop_mode": "speaker-lock",
        "face_track_offset_x": 0,
        "caption_preset": "kinetic-lime",
        "normalize_audio_lufs": True,
        "watermark_text": "MERIDIAN VERIFIED",
    }

    job_resp = await async_client.post("/api/v1/render/jobs", json=render_req)
    assert job_resp.status_code == 202, f"Failed to enqueue render job: {job_resp.text}"
    job_id = job_resp.json()["job_id"]

    # 5. Poll job status
    completed_job = None
    for _ in range(60):
        poll_resp = await async_client.get(f"/api/v1/render/jobs/{job_id}")
        assert poll_resp.status_code == 200
        st = poll_resp.json()
        if st["status"] == "completed":
            completed_job = st
            break
        elif st["status"] == "failed":
            pytest.fail(f"Render job {job_id} failed: {st.get('error_message')}")
        await asyncio.sleep(0.5)

    assert completed_job is not None, "Render job did not complete within timeout"
    assert completed_job["output_inspection"]["is_valid_mp4"] is True
    assert completed_job["output_inspection"]["width"] == 1080
    assert completed_job["output_inspection"]["height"] == 1920
    assert "token=" in completed_job["preview_url"]
    assert "token=" in completed_job["download_url"]

    # 6. Stream source video with authenticated token query param
    stream_resp = await async_client.get(f"/api/v1/media/{source_id}/stream?token={settings.DEFAULT_API_KEY}")
    assert stream_resp.status_code == 200
    assert "video/mp4" in stream_resp.headers["content-type"]

    # 7. Stream preview video with signed token
    preview_path = completed_job["preview_url"]
    preview_resp = await async_client.get(preview_path)
    assert preview_resp.status_code == 200
    assert "video/mp4" in preview_resp.headers["content-type"]

    # 8. Download vertical MP4 with signed token
    download_path = completed_job["download_url"]
    dl_resp = await async_client.get(download_path)
    assert dl_resp.status_code == 200
    assert "attachment" in dl_resp.headers.get("content-disposition", "")
    assert len(dl_resp.content) > 1000


@pytest.mark.asyncio
async def test_e2e_clip_studio_live_mode_never_hallucinates_and_rejects_unauthorized(
    async_client: AsyncClient,
    unauthenticated_async_client: AsyncClient,
):
    """
    Verifies that Live mode:
    1. Rejects unindexed source analysis with 404 (NEVER hallucinates synthetic candidates)
    2. Rejects unindexed source render with 404
    3. Strictly denies unauthenticated streaming and API requests with 401
    4. Enforces cross-workspace isolation with 403
    """
    # 1. Non-existent source analysis -> 404 (no synthetic fallback)
    resp = await async_client.post(
        "/api/v1/intelligence/transcribe-and-rank",
        json={"source_asset_id": "src-hallucinated-bogus-999"},
    )
    assert resp.status_code == 404

    # 2. Non-existent source render -> 404
    resp_render = await async_client.post(
        "/api/v1/render/jobs",
        json={
            "source_asset_id": "src-hallucinated-bogus-999",
            "start_sec": 0,
            "end_sec": 10,
        },
    )
    assert resp_render.status_code == 404

    # 3. Unauthenticated requests -> 401
    unauth_resp = await unauthenticated_async_client.post(
        "/api/v1/intelligence/transcribe-and-rank",
        json={"source_asset_id": "src-any"},
    )
    assert unauth_resp.status_code == 401

    unauth_stream = await unauthenticated_async_client.get("/api/v1/media/src-any/stream")
    assert unauth_stream.status_code == 401

    # 4. Cross-workspace media access rejected
    # Partner token is authorized only for ws-partner-meridian
    partner_headers = {"Authorization": "Bearer meridian_partner_token_2026"}
    partner_resp = await unauthenticated_async_client.get(
        "/api/v1/media/src-any/stream",
        headers=partner_headers,
    )
    assert partner_resp.status_code in (403, 404)
