import asyncio
import pytest
from pathlib import Path
from httpx import AsyncClient

@pytest.mark.asyncio
async def test_health_endpoint(async_client: AsyncClient):
    resp = await async_client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "operational"
    assert "ffmpeg" in data["binaries"]
    assert "ffprobe" in data["binaries"]

@pytest.mark.asyncio
async def test_upload_invalid_file_extension(async_client: AsyncClient):
    files = {"file": ("malicious.exe", b"executable_data", "application/octet-stream")}
    resp = await async_client.post("/api/v1/media/upload", files=files)
    assert resp.status_code == 400
    assert "Unsupported media format" in resp.json()["detail"]

@pytest.mark.asyncio
async def test_upload_corrupted_mp4(async_client: AsyncClient):
    files = {"file": ("corrupted.mp4", b"GARBAGE_PAYLOAD", "video/mp4")}
    resp = await async_client.post("/api/v1/media/upload", files=files)
    assert resp.status_code in (400, 422)
    assert "detail" in resp.json()

@pytest.mark.asyncio
async def test_full_clipping_vertical_slice(async_client: AsyncClient, sample_video_path: Path):
    """
    Step 5 Vertical Slice End-to-End Verification:
    1. Upload valid authorized MP4
    2. Inspect via FFprobe
    3. AI transcribe and detect 3 candidate timestamp ranges
    4. Enqueue 9:16 vertical 1080x1920 render job
    5. Poll until completed and verify 1080x1920 output
    6. Verify video preview streaming
    7. Verify download endpoint
    """
    # 1. Upload
    video_bytes = sample_video_path.read_bytes()
    files = {"file": ("argon_syndicate_source.mp4", video_bytes, "video/mp4")}
    data = {
        "campaign_id": "cmp-meridian-fx",
        "title": "Meridian Macro Keynote Master",
        "creator_name": "Elena Rostova",
        "authorization_proof": "Sponsor Signed Release #AGY-2026-09",
    }
    upload_resp = await async_client.post("/api/v1/media/upload", files=files, data=data)
    assert upload_resp.status_code == 201
    upload_data = upload_resp.json()
    source_id = upload_data["source_asset_id"]
    assert source_id.startswith("src-")
    assert upload_data["resolution"] == "1920x1080"
    assert upload_data["duration_sec"] >= 7.9

    # 2. Inspect
    inspect_resp = await async_client.get(f"/api/v1/media/{source_id}/inspect")
    assert inspect_resp.status_code == 200
    inspect_data = inspect_resp.json()
    assert inspect_data["is_valid"] is True
    assert inspect_data["video_stream"]["width"] == 1920
    assert inspect_data["video_stream"]["height"] == 1080

    # 3. Transcribe and identify 3 candidate timestamp ranges
    transcribe_resp = await async_client.post(
        "/api/v1/intelligence/transcribe-and-rank",
        json={"source_asset_id": source_id, "sponsor_name": "Meridian FX"},
    )
    assert transcribe_resp.status_code == 200
    intel_data = transcribe_resp.json()
    assert len(intel_data["candidates"]) == 3
    selected_candidate = intel_data["candidates"][0]
    assert selected_candidate["rank"] == 1

    # 4. Enqueue FFmpeg 1080x1920 Vertical Render
    render_req = {
        "source_asset_id": source_id,
        "clip_id": "clip-meridian-001",
        "campaign_id": "cmp-meridian-fx",
        "start_sec": selected_candidate["start_sec"],
        "end_sec": min(selected_candidate["end_sec"], selected_candidate["start_sec"] + 4.0),
        "target_width": 1080,
        "target_height": 1920,
        "crop_mode": "split-screen-podcast",
        "face_track_offset_x": 0,
        "normalize_audio_lufs": True,
    }
    render_resp = await async_client.post("/api/v1/render/jobs", json=render_req)
    assert render_resp.status_code == 202
    job_data = render_resp.json()
    job_id = job_data["job_id"]
    assert job_data["status"] in ["queued", "processing"]

    # 5. Wait / Poll for Job Completion (timeout 30s)
    for _ in range(60):
        await asyncio.sleep(0.5)
        poll_resp = await async_client.get(f"/api/v1/render/jobs/{job_id}")
        poll_data = poll_resp.json()
        if poll_data["status"] == "completed":
            break
        assert poll_data["status"] in ["queued", "processing"]

    assert poll_data["status"] == "completed"
    assert poll_data["progress_pct"] == 100
    output_insp = poll_data["output_inspection"]
    assert output_insp is not None
    assert output_insp["width"] == 1080
    assert output_insp["height"] == 1920
    assert output_insp["video_codec"] == "h264"

    # 6. Preview stream endpoint with download token
    download_token = poll_data.get("download_token")
    assert download_token is not None
    
    preview_resp = await async_client.get(f"/api/v1/render/output/{job_id}/preview?token={download_token}")
    assert preview_resp.status_code == 200
    assert preview_resp.headers["content-type"] == "video/mp4"
    assert len(preview_resp.content) > 1000

    # 7. Download endpoint with token
    dl_resp = await async_client.get(f"/api/v1/render/output/{job_id}/download?token={download_token}")
    assert dl_resp.status_code == 200
    assert dl_resp.headers["content-type"] == "video/mp4"
    assert "attachment" in dl_resp.headers["content-disposition"]

    # 8. Token security: Invalid token must be rejected with 403 Forbidden
    unauthorized_dl = await async_client.get(f"/api/v1/render/output/{job_id}/download?token=invalid_hacker_token")
    assert unauthorized_dl.status_code == 403
    assert "Forbidden" in unauthorized_dl.json()["detail"]

@pytest.mark.asyncio
async def test_render_with_burned_captions_preset(async_client: AsyncClient, sample_video_path: Path):
    """
    Sprint 2: Verifies rendering with burn_captions enabled and preset selection (kinetic-lime).
    """
    video_bytes = sample_video_path.read_bytes()
    files = {"file": ("caption_test_source.mp4", video_bytes, "video/mp4")}
    upload_resp = await async_client.post("/api/v1/media/upload", files=files)
    assert upload_resp.status_code == 201
    source_id = upload_resp.json()["source_asset_id"]

    render_req = {
        "source_asset_id": source_id,
        "clip_id": "clip-caption-test-01",
        "start_sec": 0.5,
        "end_sec": 3.5,
        "target_width": 1080,
        "target_height": 1920,
        "crop_mode": "split-screen-podcast",
        "face_track_offset_x": 0,
        "normalize_audio_lufs": True,
        "burn_captions": True,
        "caption_preset": "kinetic-lime",
        "fade_audio": True,
    }
    render_resp = await async_client.post("/api/v1/render/jobs", json=render_req)
    assert render_resp.status_code == 202
    job_id = render_resp.json()["job_id"]

    for _ in range(40):
        await asyncio.sleep(0.5)
        poll_resp = await async_client.get(f"/api/v1/render/jobs/{job_id}")
        poll_data = poll_resp.json()
        if poll_data["status"] == "completed":
            break

    assert poll_data["status"] == "completed"
    assert poll_data["output_inspection"]["width"] == 1080
    assert poll_data["output_inspection"]["height"] == 1920
