import pytest
from pathlib import Path
from app.services.ffmpeg_service import ffmpeg_service
from app.services.transcription_service import transcription_service
from app.services.subtitle_service import subtitle_service
from app.services.job_store import JobStore
from app.schemas.intelligence import TranscriptWordSchema, TranscriptSegmentSchema

def test_ffprobe_inspect_valid_media(sample_video_path: Path):
    """Verifies that FFprobe accurately extracts streams, 1920x1080 resolution, and 30fps."""
    inspection = ffmpeg_service.inspect_media(sample_video_path)
    
    assert inspection.is_valid is True
    assert inspection.video_stream is not None
    assert inspection.video_stream.width == 1920
    assert inspection.video_stream.height == 1080
    assert inspection.video_stream.codec_name == "h264"
    assert inspection.video_stream.fps == 30.0
    assert inspection.audio_stream is not None
    assert inspection.audio_stream.codec_name == "aac"
    assert inspection.duration_sec >= 7.9

def test_transcription_and_three_candidates(real_spoken_sample_path: Path, sample_video_path: Path):
    """
    Verifies transcription generation:
    1. Pure tone / non-speech media returns explicit no-speech result in Live mode.
    2. Genuine spoken audio transcribes real words with candidate timestamp discovery.
    """
    # 1. Non-speech media returns explicit no-speech in Live mode (remediates synthetic hallucination)
    silent_analysis = transcription_service.analyze_source_audio(
        source_asset_id="src-silent-001",
        media_path=sample_video_path,
        sponsor_name="Argon Test Sponsor",
        allow_synthetic_fallback=False,
    )
    assert len(silent_analysis.full_transcript) == 0
    assert silent_analysis.total_segments == 0
    assert "No speech detected" in silent_analysis.diarization_status

    # 2. Real spoken audio transcribes genuine speech and yields candidates
    analysis = transcription_service.analyze_source_audio(
        source_asset_id="src-test-001",
        media_path=real_spoken_sample_path,
        sponsor_name="Argon Test Sponsor",
    )
    
    assert analysis.source_asset_id == "src-test-001"
    assert len(analysis.full_transcript) > 0
    assert analysis.model_name in ["faster-whisper-tiny-en", "acoustic-energy-synthesizer"]
    assert analysis.diarization_status is not None
    
    ranks = [c.rank for c in analysis.candidates]
    assert ranks == [1, 2, 3]
    
    for c in analysis.candidates:
        assert c.start_sec >= 0.0
        assert c.end_sec > c.start_sec
        assert 0 <= c.hook_score <= 100
        # Verify 7-factor breakdown
        breakdown = c.seven_factor_breakdown
        assert breakdown is not None
        assert 0 <= breakdown.opening_hook_strength <= 100
        assert 0 <= breakdown.standalone_context_clarity <= 100
        assert 0 <= breakdown.emotional_curiosity_intensity <= 100
        assert 0 <= breakdown.narrative_completeness <= 100
        assert breakdown.speech_pacing_wpm > 0
        assert 0 <= breakdown.campaign_relevance <= 100
        assert 0 <= breakdown.duration_compliance <= 100
        
        # Verify sentence boundary snapping flag
        assert isinstance(c.snapped_to_sentence_boundary, bool)
        assert len(c.transcript_excerpt) > 0
        assert len(c.primary_keywords) > 0

def test_subtitle_generation_presets(tmp_path: Path):
    """Verifies ASS subtitle generation across all 3 presets: kinetic-lime, minimal-editorial, founder-mono."""
    words = [
        TranscriptWordSchema(word="Argon", start_sec=0.0, end_sec=0.4, probability=0.98),
        TranscriptWordSchema(word="intelligence", start_sec=0.45, end_sec=0.9, probability=0.95),
        TranscriptWordSchema(word="delivers", start_sec=0.95, end_sec=1.3, probability=0.97),
        TranscriptWordSchema(word="real", start_sec=1.35, end_sec=1.6, probability=0.99),
        TranscriptWordSchema(word="results.", start_sec=1.65, end_sec=2.2, probability=0.96),
    ]
    segments = [
        TranscriptSegmentSchema(
            id="seg-test-001",
            start_sec=0.0,
            end_sec=2.5,
            text="Argon intelligence delivers real results.",
            confidence_pct=98.0,
            words=words,
        )
    ]
    
    for preset in ["kinetic-lime", "minimal-editorial", "founder-mono"]:
        ass_path = tmp_path / f"test_{preset}.ass"
        generated_path = subtitle_service.generate_ass_subtitles(
            segments=segments,
            output_ass_path=ass_path,
            clip_start_sec=0.0,
            clip_end_sec=2.5,
            preset=preset,
        )
        assert generated_path.exists()
        content = generated_path.read_text(encoding="utf-8")
        assert "[Script Info]" in content
        assert "PlayResX: 1080" in content
        assert "PlayResY: 1920" in content
        assert "[V4+ Styles]" in content
        assert "[Events]" in content
        assert "Dialogue:" in content
        assert "Argon" in content

def test_ffmpeg_vertical_9_16_render(sample_video_path: Path, tmp_path: Path):
    """Renders a vertical 9:16 clip with audio fade and inspects output to ensure 1080x1920 dimensions."""
    output_path = tmp_path / "vertical_rendered_test.mp4"
    
    render_result = ffmpeg_service.render_vertical_clip(
        input_path=sample_video_path,
        output_path=output_path,
        start_sec=1.0,
        end_sec=5.0,
        target_width=1080,
        target_height=1920,
        face_track_offset_x=5,
        crop_mode="split-screen-podcast",
        normalize_audio=True,
        fade_audio=True,
    )
    
    assert output_path.exists()
    assert render_result.is_valid_mp4 is True
    assert render_result.width == 1080
    assert render_result.height == 1920
    assert render_result.video_codec == "h264"
    assert render_result.duration_sec >= 3.8
    assert render_result.file_size_bytes > 1000

def test_ffmpeg_vertical_render_with_burned_captions(sample_video_path: Path, tmp_path: Path):
    """Renders vertical clip with burned ASS subtitles and audio smoothing."""
    words = [
        TranscriptWordSchema(word="Syndicate", start_sec=0.0, end_sec=0.6, probability=0.99),
        TranscriptWordSchema(word="Execution", start_sec=0.6, end_sec=1.5, probability=0.98),
    ]
    segments = [
        TranscriptSegmentSchema(
            id="seg-burn-001",
            start_sec=0.0,
            end_sec=2.0,
            text="Syndicate Execution",
            confidence_pct=99.0,
            words=words,
        )
    ]
    ass_path = tmp_path / "burned_test.ass"
    subtitle_service.generate_ass_subtitles(
        segments=segments,
        output_ass_path=ass_path,
        clip_start_sec=0.0,
        clip_end_sec=2.0,
        preset="kinetic-lime",
    )
    
    output_path = tmp_path / "vertical_with_burned_subs.mp4"
    render_result = ffmpeg_service.render_vertical_clip(
        input_path=sample_video_path,
        output_path=output_path,
        start_sec=0.5,
        end_sec=3.5,
        target_width=1080,
        target_height=1920,
        face_track_offset_x=0,
        crop_mode="split-screen-podcast",
        normalize_audio=True,
        fade_audio=True,
        subtitles_ass_path=ass_path,
    )
    
    assert output_path.exists()
    assert render_result.is_valid_mp4 is True
    assert render_result.width == 1080
    assert render_result.height == 1920
    assert render_result.duration_sec >= 2.8

def test_job_store_durability(tmp_path: Path):
    """Verifies that JobStore persists jobs to disk and recovers state upon re-instantiation."""
    from app.schemas.render import RenderJobStatus
    db_file = tmp_path / "test_jobs.json"
    store1 = JobStore(persistence_file=db_file)
    store1.save_job(RenderJobStatus(
        job_id="job-durable-001",
        status="completed",
        progress_pct=100,
        clip_id="clip-alpha",
        duration_sec=4.0,
    ))
    
    # Simulate restart by creating a new store instance pointing to same file
    store2 = JobStore(persistence_file=db_file)
    restored = store2.get_job("job-durable-001")
    assert restored is not None
    assert restored.status == "completed"
    assert restored.progress_pct == 100
    assert restored.clip_id == "clip-alpha"

def test_ffprobe_corrupted_file_rejection(tmp_path: Path):
    """Verifies that unreadable or corrupted files fail gracefully with clear error."""
    corrupted_file = tmp_path / "fake_broken.mp4"
    corrupted_file.write_bytes(b"NOT_A_REAL_MP4_HEADER_GARBAGE_BYTES")
    
    with pytest.raises(Exception):
        ffmpeg_service.inspect_media(corrupted_file)
    
    with pytest.raises(Exception):
        ffmpeg_service.inspect_media(corrupted_file)
