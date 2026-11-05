from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from .core.config import settings
from .core.logging import logger
from .api.v1.router import api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Production security enforcement: Deny startup when required secrets are missing or default
    if settings.ENVIRONMENT == "production":
        insecure_keys = ["", "argon-high-dev-secret-key-insecure-local-only", "argon-high-production-secret-key-remediation-v1"]
        if not settings.SECRET_KEY or settings.SECRET_KEY in insecure_keys or len(settings.SECRET_KEY) < 32:
            raise RuntimeError("FATAL: Insecure or missing SECRET_KEY in production. A strong >=32-char SECRET_KEY environment variable is strictly required.")
        if not settings.DEFAULT_API_KEY or "argon_dev_token" in settings.DEFAULT_API_KEY:
            raise RuntimeError("FATAL: Insecure or default ARGON_API_KEY in production. A dedicated non-default API key is strictly required.")

    logger.info(f"{settings.PROJECT_NAME} starting up on environment: {settings.ENVIRONMENT}")
    logger.info(f"Storage Upload Dir: {settings.UPLOAD_DIR}")
    logger.info(f"Storage Render Dir: {settings.RENDER_DIR}")
    logger.info(f"FFmpeg binary resolved: {settings.get_ffmpeg_binary()}")
    logger.info(f"FFprobe binary resolved: {settings.get_ffprobe_binary()}")
    yield
    logger.info(f"{settings.PROJECT_NAME} shutting down.")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Intelligence-driven AI clipping and campaign analytics platform backend API.",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global Request Validation Error Handler
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    logger.warning(f"Validation error on {request.method} {request.url.path}: {exc.errors()}")
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "Validation Error",
            "detail": exc.errors(),
            "path": request.url.path,
        },
    )

# Global Unexpected Error Handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal Server Error",
            "detail": str(exc),
            "path": request.url.path,
        },
    )

# Mount versioned API router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/", tags=["Root"])
async def root():
    return {
        "service": settings.PROJECT_NAME,
        "status": "online",
        "api_docs": "/docs",
        "version": settings.VERSION,
    }
