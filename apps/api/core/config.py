"""SpineMetrics API — Configuration"""
import os

class Settings:
    APP_NAME    = "SpineMetrics API"
    VERSION     = "6.0.0"
    DEBUG       = os.environ.get("DEBUG", "false").lower() == "true"
    INFERENCE_BACKEND = os.environ.get("INFERENCE_BACKEND", "cv_heuristic")
    ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
    MAX_UPLOAD_MB = int(os.environ.get("MAX_UPLOAD_MB", "25"))
    CORS_ORIGINS = os.environ.get(
        "CORS_ORIGINS",
        "http://localhost:5173,http://localhost:3000"
    ).split(",")

settings = Settings()
