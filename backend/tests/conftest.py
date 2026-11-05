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
    Synthesizes an authorized 16:9 test MP4 with genuine spoken English speech audio using Windows SAPI + FFmpeg.
    """
    tmp_dir = tmp_path_factory.mktemp("real_speech_fixtures")
    wav_file = tmp_dir / "spoken_speech.wav"
    video_file = tmp_dir / "authorized_real_spoken_podcast.mp4"

    spoken_text = "When you strip away legacy orchestration overhead and pin memory bandwidth directly to the inference kernel, throughput per dollar jumps 2.9x overnight."
    ps_script = f"""
Add-Type -AssemblyName System.Speech
$syn = New-Object System.Speech.Synthesis.SpeechSynthesizer
$syn.SetOutputToWaveFile('{wav_file.as_posix()}')
$syn.Speak('{spoken_text}')
$syn.Dispose()
"""
    tmp_ps = tmp_dir / "gen_speech.ps1"
    tmp_ps.write_text(ps_script, encoding="utf-8")
    try:
        subprocess.run(["powershell", "-ExecutionPolicy", "Bypass", "-File", str(tmp_ps)], check=True, capture_output=True)
    finally:
        tmp_ps.unlink(missing_ok=True)

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
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        yield client
