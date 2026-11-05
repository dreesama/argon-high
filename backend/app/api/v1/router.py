from fastapi import APIRouter
from .auth import router as auth_router
from .media import router as media_router
from .intelligence import router as intelligence_router
from .render import router as render_router
from .campaigns import router as campaigns_router
from .guard import router as guard_router
from .performance import router as performance_router
from ...core.config import settings

api_router = APIRouter()

@api_router.get("/health", tags=["System Health"])
async def health_check():
    return {
        "status": "operational",
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "binaries": {
            "ffmpeg": settings.get_ffmpeg_binary(),
            "ffprobe": settings.get_ffprobe_binary(),
        },
    }

api_router.include_router(auth_router)
api_router.include_router(media_router)
api_router.include_router(intelligence_router)
api_router.include_router(render_router)
api_router.include_router(campaigns_router)
api_router.include_router(guard_router)
api_router.include_router(performance_router)
