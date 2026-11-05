import os
import sys
import subprocess
from pathlib import Path
import pytest
from httpx import AsyncClient, ASGITransport

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app
from app.core.config import settings

@pytest.fixture(scope="session")
def sample_video_path(tmp_path_factory) -> Path:
    """
    Synthesizes a valid 16:9 test MP4 with audio track using FFmpeg.
    """
    tmp_dir = tmp_path_factory.mktemp("media_fixtures")
    video_file = tmp_dir / "valid_authorized_podcast.mp4"
    
    ffmpeg_bin = settings.get_ffmpeg_binary()
    cmd = [
        ffmpeg_bin,
        "-y",
        "-f", "lavfi",
        "-i", "testsrc=duration=8:size=1920x1080:rate=30",
        "-f", "lavfi",
        "-i", "sine=frequency=440:duration=8",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        str(video_file),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    assert video_file.exists() and video_file.stat().st_size > 0
    return video_file

@pytest.fixture(scope="session")
def real_spoken_sample_path(tmp_path_factory) -> Path:
    """
    Synthesizes an authorized 16:9 test MP4 with genuine spoken English speech audio.
    Cross-platform: muxes genuine spoken English audio fixture with FFmpeg testsrc.
    Zero OS-specific dependencies (PowerShell / Windows SAPI removed).
    """
    tmp_dir = tmp_path_factory.mktemp("real_speech_fixtures")
    video_file = tmp_dir / "authorized_real_spoken_podcast.mp4"
    fixtures_dir = Path(__file__).resolve().parent / "fixtures"
    wav_file = fixtures_dir / "spoken_sample.wav"

    if not wav_file.exists():
        raise FileNotFoundError(f"Required speech fixture not found: {wav_file}")

    # Verify that Git LFS checked out the genuine audio binary rather than an un-pulled text pointer
    if wav_file.stat().st_size < 1000 and wav_file.read_bytes().startswith(b"version https://git-lfs"):
        try:
            subprocess.run(["git", "lfs", "pull"], check=True, capture_output=True)
        except Exception:
            pass
        if wav_file.stat().st_size < 1000 and wav_file.read_bytes().startswith(b"version https://git-lfs"):
            raise RuntimeError(
                f"backend/tests/fixtures/spoken_sample.wav is a Git LFS pointer ({wav_file.stat().st_size} bytes). "
                "The actual audio binary object was not checked out. Run 'git lfs pull' or configure 'lfs: true' in actions/checkout."
            )

    ffmpeg_bin = settings.get_ffmpeg_binary()
    cmd = [
        ffmpeg_bin,
        "-y",
        "-f", "lavfi",
        "-i", "testsrc=duration=8:size=1920x1080:rate=30",
        "-i", str(wav_file),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "192k",
        "-shortest",
        str(video_file),
    ]
    subprocess.run(cmd, check=True, capture_output=True)
    assert video_file.exists() and video_file.stat().st_size > 0
    return video_file

@pytest.fixture
async def async_client():
    transport = ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {settings.DEFAULT_API_KEY}"}
    async with AsyncClient(transport=transport, base_url="http://testserver", headers=headers) as client:
        yield client

@pytest.fixture
async def unauthenticated_async_client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
