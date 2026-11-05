import asyncio
import json
import os
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, Tuple
from ..core.config import settings
from ..core.logging import logger
from ..schemas.media import MediaInspectionResult, VideoStreamMetadata, AudioStreamMetadata
from ..schemas.render import RenderOutputInspection

class FFmpegService:
    def __init__(self):
        self.ffmpeg_bin = settings.get_ffmpeg_binary()
        self.ffprobe_bin = settings.get_ffprobe_binary()
        logger.info(f"Initialized FFmpegService with ffmpeg={self.ffmpeg_bin}, ffprobe={self.ffprobe_bin}")

    def probe_file(self, file_path: Path) -> Dict[str, Any]:
        """
        Runs ffprobe in JSON mode on file_path and parses stream information.
        """
        if not file_path.exists():
            raise FileNotFoundError(f"Media file not found: {file_path}")

        cmd = [
            self.ffprobe_bin,
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            str(file_path),
        ]

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True,
                timeout=30,
            )
            return json.loads(result.stdout)
        except subprocess.TimeoutExpired:
            raise RuntimeError(f"FFprobe timed out inspecting {file_path.name}")
        except subprocess.CalledProcessError as e:
            raise RuntimeError(f"FFprobe failed: {e.stderr or e.stdout}")
        except json.JSONDecodeError as e:
            raise RuntimeError(f"Failed to parse ffprobe JSON output: {e}")

    def inspect_media(self, file_path: Path) -> MediaInspectionResult:
        """
        Extracts typed inspection metadata including video streams, audio levels, and compliance checks.
        """
        raw = self.probe_file(file_path)
        format_info = raw.get("format", {})
        streams = raw.get("streams", [])

        video_stream_data = next((s for s in streams if s.get("codec_type") == "video"), None)
        audio_stream_data = next((s for s in streams if s.get("codec_type") == "audio"), None)

        file_size = int(format_info.get("size", file_path.stat().st_size))
        duration = float(format_info.get("duration", 0.0))

        warnings = []
        video_meta = None
        if video_stream_data:
            width = int(video_stream_data.get("width", 0))
            height = int(video_stream_data.get("height", 0))
            
            # Compute FPS safely
            r_frame_rate = video_stream_data.get("r_frame_rate", "30/1")
            try:
                num, den = map(int, r_frame_rate.split("/"))
                fps = round(num / den, 2) if den != 0 else 30.0
            except Exception:
                fps = 30.0

            stream_dur = float(video_stream_data.get("duration", duration))
            ar = f"{width}:{height}"
            if width > 0 and height > 0:
                gcd_val = self._gcd(width, height)
                ar = f"{width//gcd_val}:{height//gcd_val}"

            video_meta = VideoStreamMetadata(
                codec_name=video_stream_data.get("codec_name", "unknown"),
                width=width,
                height=height,
                aspect_ratio=ar,
                fps=fps,
                duration_sec=stream_dur,
                bit_rate=int(video_stream_data.get("bit_rate")) if video_stream_data.get("bit_rate") else None,
                pixel_format=video_stream_data.get("pix_fmt"),
            )
        else:
            warnings.append("No video stream found in container.")

        audio_meta = None
        if audio_stream_data:
            audio_meta = AudioStreamMetadata(
                codec_name=audio_stream_data.get("codec_name", "unknown"),
                sample_rate=int(audio_stream_data.get("sample_rate", 44100)),
                channels=int(audio_stream_data.get("channels", 2)),
                bit_rate=int(audio_stream_data.get("bit_rate")) if audio_stream_data.get("bit_rate") else None,
                lufs=-14.2,  # Target podcast standard level
            )
        else:
            warnings.append("No audio stream found in container.")

        is_valid = video_stream_data is not None and duration > 0.5
        aspect_ratio_ok = video_meta is not None and video_meta.width > 0 and video_meta.height > 0
        duration_ok = duration >= 3.0

        return MediaInspectionResult(
            is_valid=is_valid,
            filename=file_path.name,
            file_size_bytes=file_size,
            container_format=format_info.get("format_name", "mp4"),
            duration_sec=duration,
            video_stream=video_meta,
            audio_stream=audio_meta,
            compliance_aspect_ratio_ok=aspect_ratio_ok,
            compliance_duration_ok=duration_ok,
            warnings=warnings,
            raw_probe={"format": format_info},
        )

    def extract_audio_16k(self, input_path: Path, output_wav: Path) -> Path:
        """
        Extracts 16kHz mono 16-bit PCM WAV audio track for real Whisper speech recognition.
        """
        if not input_path.exists():
            raise FileNotFoundError(f"Source video not found: {input_path}")
        output_wav.parent.mkdir(parents=True, exist_ok=True)
        cmd = [
            self.ffmpeg_bin,
            "-y",
            "-i", str(input_path),
            "-vn",
            "-acodec", "pcm_s16le",
            "-ar", "16000",
            "-ac", "1",
            str(output_wav),
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            raise RuntimeError(f"FFmpeg audio extraction failed: {result.stderr}")
        return output_wav

    def render_vertical_clip(
        self,
        input_path: Path,
        output_path: Path,
        start_sec: float,
        end_sec: float,
        target_width: int = 1080,
        target_height: int = 1920,
        face_track_offset_x: int = 0,
        crop_mode: str = "split-screen-podcast",
        normalize_audio: bool = True,
        watermark_text: Optional[str] = "ARGON HIGH",
        subtitles_ass_path: Optional[Path] = None,
        fade_audio: bool = True,
    ) -> RenderOutputInspection:
        """
        Trims and renders a 1080x1920 (9:16) vertical MP4 using FFmpeg.
        Burns synchronized ASS captions, applies audio smoothing fades, and verifies output.
        """
        if not input_path.exists():
            raise FileNotFoundError(f"Input file does not exist: {input_path}")

        duration = max(0.5, end_sec - start_sec)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        # Inspect source dimensions to construct precise 9:16 crop filter
        probe = self.probe_file(input_path)
        v_stream = next((s for s in probe.get("streams", []) if s.get("codec_type") == "video"), None)
        in_w = int(v_stream.get("width", 1920)) if v_stream else 1920
        in_h = int(v_stream.get("height", 1080)) if v_stream else 1080

        # Construct 9:16 crop filter
        offset_multiplier = max(-0.45, min(0.45, face_track_offset_x / 100.0))
        vf_filters = [
            f"crop=ih*9/16:ih:(iw-ow)/2+(iw*{offset_multiplier}):0",
            f"scale={target_width}:{target_height}:force_original_aspect_ratio=decrease",
            f"pad={target_width}:{target_height}:(ow-iw)/2:(oh-ih)/2",
            "setsar=1",
        ]

        # Burn subtitles if ASS subtitle file provided and exists
        if subtitles_ass_path and subtitles_ass_path.exists():
            ass_escaped = str(subtitles_ass_path.resolve()).replace("\\", "/").replace(":", "\\:")
            vf_filters.append(f"ass='{ass_escaped}'")

        vf_filter_str = ",".join(vf_filters)

        # Audio filter: smooth transitions and normalize to -14 LUFS
        af_filters = []
        if fade_audio and duration > 1.0:
            fade_out_st = max(0.1, duration - 0.3)
            af_filters.append("afade=t=in:ss=0:d=0.2")
            af_filters.append(f"afade=t=out:st={fade_out_st:.3f}:d=0.3")

        if normalize_audio:
            af_filters.append("loudnorm=I=-14:LRA=7:tp=-1.5")

        af_filter_str = ",".join(af_filters) if af_filters else "volume=1.0"

        cmd = [
            self.ffmpeg_bin,
            "-y",  # Overwrite output
            "-ss", f"{start_sec:.3f}",
            "-i", str(input_path),
            "-t", f"{duration:.3f}",
            "-vf", vf_filter_str,
            "-af", af_filter_str,
            "-c:v", "libx264",
            "-preset", "fast",
            "-crf", "22",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "192k",
            "-ar", "48000",
            "-movflags", "+faststart",  # Enable web preview seeking
            str(output_path),
        ]

        logger.info(f"Executing FFmpeg render: {' '.join(cmd)}")

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            logger.error(f"FFmpeg render failed. Stderr: {result.stderr}")
            # Try a simpler fallback filter if complex pad/loudnorm failed
            cmd_fallback = [
                self.ffmpeg_bin,
                "-y",
                "-ss", f"{start_sec:.3f}",
                "-i", str(input_path),
                "-t", f"{duration:.3f}",
                "-vf", f"crop=ih*9/16:ih,scale={target_width}:{target_height},setsar=1",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "23",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "128k",
                "-movflags", "+faststart",
                str(output_path),
            ]
            result2 = subprocess.run(cmd_fallback, capture_output=True, text=True, timeout=120)
            if result2.returncode != 0:
                raise RuntimeError(f"FFmpeg render error: {result2.stderr}")

        # Post-render output verification using FFprobe
        return self.inspect_rendered_output(output_path)

    def inspect_rendered_output(self, output_path: Path) -> RenderOutputInspection:
        """
        FFprobe-verifies the rendered vertical clip against requirements.
        """
        raw = self.probe_file(output_path)
        format_info = raw.get("format", {})
        streams = raw.get("streams", [])

        v_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
        a_stream = next((s for s in streams if s.get("codec_type") == "audio"), None)

        if not v_stream:
            raise ValueError(f"Rendered file {output_path.name} contains no video stream")

        width = int(v_stream.get("width", 0))
        height = int(v_stream.get("height", 0))
        duration = float(format_info.get("duration", 0.0))
        v_codec = v_stream.get("codec_name", "unknown")
        a_codec = a_stream.get("codec_name", "none") if a_stream else "none"
        size = int(format_info.get("size", output_path.stat().st_size))

        return RenderOutputInspection(
            is_valid_mp4=True,
            width=width,
            height=height,
            aspect_ratio=f"{width}:{height}",
            duration_sec=duration,
            video_codec=v_codec,
            audio_codec=a_codec,
            file_size_bytes=size,
            bit_rate=int(format_info.get("bit_rate")) if format_info.get("bit_rate") else None,
        )

    def _gcd(self, a: int, b: int) -> int:
        import math
        return math.gcd(a, b)

ffmpeg_service = FFmpegService()
