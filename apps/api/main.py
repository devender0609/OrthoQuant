"""
SpineMetrics — FastAPI Application

Run locally:
  cd spinemetrics
  uvicorn apps.api.main:app --reload --port 8000

Docs: http://localhost:8000/docs
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from apps.api.routers.analyze import router
from apps.api.core.config import settings

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.VERSION,
    description=(
        "SpineMetrics backend — landmark detection and geometric measurement "
        "for spinal alignment and body composition imaging. "
        "Research use only. Not FDA-cleared."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

@app.get("/", include_in_schema=False)
async def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.VERSION,
        "inference_backend": settings.INFERENCE_BACKEND,
        "docs": "/docs",
        "disclaimer": "Research use only. Not FDA-cleared.",
    }

@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "ok", "version": settings.VERSION}
