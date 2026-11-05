import re
from pathlib import Path
from typing import List, Optional
from ..schemas.intelligence import TranscriptSegmentSchema, TranscriptWordSchema

class SubtitleService:
    def format_ass_time(self, seconds: float) -> str:
        """Converts float seconds to ASS timestamp format: H:MM:SS.cs"""
        hrs = int(seconds // 3600)
        mins = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        centisecs = int(round((seconds - int(seconds)) * 100))
        if centisecs >= 100:
            centisecs = 99
        return f"{hrs}:{mins:02d}:{secs:02d}.{centisecs:02d}"

    def format_srt_time(self, seconds: float) -> str:
        """Converts float seconds to SRT timestamp format: HH:MM:SS,mmm"""
        hrs = int(seconds // 3600)
        mins = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        millis = int(round((seconds - int(seconds)) * 1000))
        if millis >= 1000:
            millis = 999
        return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"

    def generate_ass_subtitles(
        self,
        segments: List[TranscriptSegmentSchema],
        output_ass_path: Path,
        clip_start_sec: float,
        clip_end_sec: float,
        preset: str = "kinetic-lime",
    ) -> Path:
        """
        Generates a styled ASS subtitle file for the specified trim range.
        Times are shifted relative to clip start (t=0 at clip_start_sec).
        """
        output_ass_path.parent.mkdir(parents=True, exist_ok=True)

        # Style Definitions for 1080x1920 Vertical Videos
        # PlayResX: 1080, PlayResY: 1920
        # Alignment: 2 is Bottom-Center. MarginV places text above TikTok/Reels bottom overlays.
        styles_map = {
            "kinetic-lime": (
                "Style: Default,Arial,64,&H00FFFFFF,&H006BF3C6,&H00101419,&H80000000,"
                "-1,0,0,0,100,100,0,0,1,3.5,2.0,2,80,80,180,1"
            ),
            "minimal-editorial": (
                "Style: Default,Segoe UI,56,&H00FFFFFF,&H00E2E8F0,&H000F172A,&H90000000,"
                "0,0,0,0,100,100,0,0,3,1.5,1.0,2,90,90,160,1"
            ),
            "founder-mono": (
                "Style: Default,Consolas,58,&H00F8BD38,&H00FFFFFF,&H00090D16,&HA0000000,"
                "-1,0,0,0,100,100,0,0,1,4.0,2.5,2,80,80,200,1"
            ),
        }

        chosen_style = styles_map.get(preset, styles_map["kinetic-lime"])

        ass_header = f"""[Script Info]
Title: Argon High Synchronized Captions
ScriptType: v4.00+
WrapStyle: 0
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.709
PlayResX: 1080
PlayResY: 1920

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
{chosen_style}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""

        events = []
        # Filter segments that intersect [clip_start_sec, clip_end_sec]
        relevant_segs = [
            s for s in segments
            if s.end_sec > clip_start_sec and s.start_sec < clip_end_sec
        ]

        for seg in relevant_segs:
            # Shift timestamps relative to clip start
            rel_start = max(0.0, seg.start_sec - clip_start_sec)
            rel_end = min(clip_end_sec - clip_start_sec, seg.end_sec - clip_start_sec)
            
            if rel_end <= rel_start:
                continue

            # Word-level highlight if available
            if seg.words and len(seg.words) > 0:
                # Group words into short phrases (max 4-5 words per subtitle card for vertical video)
                words_in_clip = [
                    w for w in seg.words
                    if w.end_sec > clip_start_sec and w.start_sec < clip_end_sec
                ]
                
                # Split words into small chunks of 4 words
                chunk_size = 4
                for i in range(0, len(words_in_clip), chunk_size):
                    chunk = words_in_clip[i:i + chunk_size]
                    if not chunk:
                        continue
                    c_start = max(0.0, chunk[0].start_sec - clip_start_sec)
                    c_end = min(clip_end_sec - clip_start_sec, chunk[-1].end_sec - clip_start_sec)
                    if c_end <= c_start:
                        c_end = c_start + 1.2
                    
                    text_content = " ".join([w.word.strip() for w in chunk])
                    # Clean text
                    clean_text = self._sanitize_for_ass(text_content)
                    if clean_text:
                        start_str = self.format_ass_time(c_start)
                        end_str = self.format_ass_time(c_end)
                        events.append(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{clean_text}")
            else:
                # Segment level line-wrapped
                clean_text = self._sanitize_for_ass(seg.text)
                clean_text = self._wrap_text(clean_text, max_chars=28)
                if clean_text:
                    start_str = self.format_ass_time(rel_start)
                    end_str = self.format_ass_time(rel_end)
                    events.append(f"Dialogue: 0,{start_str},{end_str},Default,,0,0,0,,{clean_text}")

        # If no events matched, insert a neutral fallback event
        if not events:
            events.append(f"Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,ARGON HIGH VERIFIED")

        full_ass_content = ass_header + "\n".join(events) + "\n"
        output_ass_path.write_text(full_ass_content, encoding="utf-8")
        return output_ass_path

    def _sanitize_for_ass(self, text: str) -> str:
        """Removes curly braces or ASS control codes to prevent injection."""
        text = text.replace("{", "").replace("}", "").strip()
        return text

    def _wrap_text(self, text: str, max_chars: int = 28) -> str:
        """Splits longer sentences with ASS line break \\N."""
        words = text.split()
        lines = []
        cur_line = []
        cur_len = 0

        for w in words:
            if cur_len + len(w) + 1 > max_chars and cur_line:
                lines.append(" ".join(cur_line))
                cur_line = [w]
                cur_len = len(w)
            else:
                cur_line.append(w)
                cur_len += len(w) + 1

        if cur_line:
            lines.append(" ".join(cur_line))

        return "\\N".join(lines)

subtitle_service = SubtitleService()
