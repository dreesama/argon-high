import os
import shutil
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="allow")
    
    PROJECT_NAME: str = "Argon High API"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Environment & Host
    ENVIRONMENT: str = "development"
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    
    # Security & Auth
    SECRET_KEY: str = os.getenv("SECRET_KEY", "argon-high-secret-operator-key-v1")
    DEFAULT_API_KEY: str = os.getenv("ARGON_API_KEY", "argon_dev_token_syndicate_2026")
    DEFAULT_WORKSPACE_ID: str = "ws-argon-core"
    
    # CORS
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:8443",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:8443",
        "http://127.0.0.1:5173",
        "*"
    ]
    
    # Storage Paths
    BASE_DIR: Path = Path(__file__).resolve().parent.parent.parent
    STORAGE_DIR: Path = BASE_DIR / "storage"
    UPLOAD_DIR: Path = STORAGE_DIR / "uploads"
    RENDER_DIR: Path = STORAGE_DIR / "rendered"
    
    # Max file upload size (default 250MB for sprint 1 vertical slice)
    MAX_UPLOAD_BYTES: int = 250 * 1024 * 1024
    
    # Operational Concurrency & Lifecycle
    MAX_CONCURRENT_RENDERS: int = 2
    RENDER_TIMEOUT_SEC: int = 180
    DISK_RETENTION_HOURS: int = 48
    
    # Binary Tools
    FFMPEG_PATH: str = os.getenv("FFMPEG_PATH", "")
    FFPROBE_PATH: str = os.getenv("FFPROBE_PATH", "")

    def get_ffmpeg_binary(self) -> str:
        if self.FFMPEG_PATH and Path(self.FFMPEG_PATH).exists():
            return self.FFMPEG_PATH
        cmd = shutil.which("ffmpeg")
        if cmd:
            return cmd
        # Look in WinGet Gyan build fallback location
        winget_path = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
        if winget_path.exists():
            matches = list(winget_path.glob("**/bin/ffmpeg.exe"))
            if matches:
                return str(matches[0])
        # Look in other common Windows locations
        program_files = Path(os.environ.get("ProgramFiles", "C:\\Program Files"))
        matches = list(program_files.glob("**/ffmpeg.exe"))
        if matches:
            return str(matches[0])
        return "ffmpeg"

    def get_ffprobe_binary(self) -> str:
        if self.FFPROBE_PATH and Path(self.FFPROBE_PATH).exists():
            return self.FFPROBE_PATH
        cmd = shutil.which("ffprobe")
        if cmd:
            return cmd
        winget_path = Path(os.environ.get("LOCALAPPDATA", "")) / "Microsoft" / "WinGet" / "Packages"
        if winget_path.exists():
            matches = list(winget_path.glob("**/bin/ffprobe.exe"))
            if matches:
                return str(matches[0])
        program_files = Path(os.environ.get("ProgramFiles", "C:\\Program Files"))
        matches = list(program_files.glob("**/ffprobe.exe"))
        if matches:
            return str(matches[0])
        return "ffprobe"

settings = Settings()

# Ensure directories exist
settings.STORAGE_DIR.mkdir(parents=True, exist_ok=True)
settings.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
settings.RENDER_DIR.mkdir(parents=True, exist_ok=True)
