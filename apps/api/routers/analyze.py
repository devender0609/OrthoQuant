"""
SpineMetrics — Analysis Router

Endpoints:
  POST /analyze/lumbar-pelvic      ← primary real endpoint
  POST /analyze/cervical           ← unavailable (not yet implemented)
  POST /analyze/muscle             ← unavailable (not yet implemented)
  GET  /status                     ← backend capability info
"""

import sys, os, time
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../.."))

from fastapi import APIRouter, UploadFile, File, HTTPException, Form
from fastapi.responses import JSONResponse
from typing import Optional

from apps.api.core.config import settings
from apps.api.services.lumbar_pelvic_inference import run_inference
from packages.measurement_engine.lumbar_pelvic import compute_lumbar_pelvic
from packages.shared_types.responses import (
    MeasurementStatus, MeasurementResult, AnalysisTier,
    CervicalResponse, MuscleResponse,
)

router = APIRouter()

ALLOWED_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_BYTES     = settings.MAX_UPLOAD_MB * 1024 * 1024


# ─── Status ───────────────────────────────────────────────────────────────────

@router.get("/status")
async def get_status():
    try:
        import cv2
        cv2_ok = True
    except ImportError:
        cv2_ok = False
    try:
        import numpy
        np_ok = True
    except ImportError:
        np_ok = False

    return {
        "version": settings.VERSION,
        "inference_backend": settings.INFERENCE_BACKEND,
        "dependencies": {"opencv": cv2_ok, "numpy": np_ok},
        "modules": {
            "lumbar_pelvic": {
                "status": "available" if (cv2_ok and np_ok) else "degraded",
                "tier1_measurements": [
                    "lumbar_lordosis_cobb",
                    "sacral_slope",
                    "pelvic_tilt",
                    "pelvic_incidence",
                    "pi_ll_mismatch",
                ],
                "tier2_measurements": [
                    "sva_mm",
                    "spondylolisthesis_pct",
                    "disc_height_index",
                ],
                "tier2_status": "not_yet_implemented",
                "source": settings.INFERENCE_BACKEND,
            },
            "cervical": {
                "status": "unavailable",
                "note": "Cervical landmark detection pipeline not yet implemented.",
            },
            "muscle": {
                "status": "unavailable",
                "note": "Requires trained segmentation model (nnU-Net / MONAI).",
            },
        },
        "disclaimer": "Research use only. Not FDA-cleared.",
    }


# ─── Lumbar/Pelvic — primary endpoint ────────────────────────────────────────

@router.post("/analyze/lumbar-pelvic")
async def analyze_lumbar_pelvic(
    image: UploadFile = File(..., description="Standing lateral lumbar/lumbopelvic radiograph"),
):
    """
    Primary analysis endpoint.

    Accepts: JPEG, PNG, WEBP image of a standing lateral lumbar radiograph.
    Returns: Structured JSON with per-measurement results, landmark coordinates,
             confidence scores, and overlay metadata.

    Analysis pipeline:
      1. Validate image
      2. Detect landmarks (cv_heuristic or trained model, per INFERENCE_BACKEND)
      3. Compute measurements from landmarks (deterministic geometry)
      4. Return structured response

    Source field in response indicates which backend produced the landmarks.
    """
    t0 = time.time()

    # ── Validate ──────────────────────────────────────────────────────────────
    if image.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported type: {image.content_type}. Use JPEG, PNG, or WEBP.",
        )

    raw = await image.read()
    if len(raw) > MAX_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"File too large ({len(raw)//1024} KB). Max: {settings.MAX_UPLOAD_MB} MB.",
        )
    if len(raw) < 500:
        raise HTTPException(status_code=400, detail="File appears empty or corrupt.")

    # ── Detect landmarks ──────────────────────────────────────────────────────
    try:
        landmarks = run_inference(raw)
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")
    except NotImplementedError as e:
        raise HTTPException(status_code=501, detail=str(e))

    # ── Compute measurements ──────────────────────────────────────────────────
    result = compute_lumbar_pelvic(landmarks)
    result.processing_notes.append(
        f"Total processing time: {(time.time() - t0)*1000:.0f}ms"
    )

    return JSONResponse(content=result.to_api_dict())


# ─── Cervical — not yet implemented ──────────────────────────────────────────

@router.post("/analyze/cervical")
async def analyze_cervical(
    image: UploadFile = File(...),
):
    """
    Cervical alignment analysis — NOT YET IMPLEMENTED.
    Returns structured unavailable response. Manual entry required.
    """
    from packages.shared_types.responses import MEASUREMENT_ROADMAP_CERVICAL

    resp = CervicalResponse(
        status="unavailable",
        errors=[
            "Cervical landmark detection pipeline not yet implemented. "
            "All cervical measurements require manual entry."
        ],
        processing_notes=[
            "Planned: Canny + Hough line detection with C2/C7 zone heuristics.",
            "Hard part: C7 identification requires counting from C7-T1 junction "
            "or a trained vertebra detector.",
        ],
        measurements={
            "c2c7_cobb":   MeasurementResult(status=MeasurementStatus.NOT_YET_IMPLEMENTED, note="Cervical pipeline not built"),
            "t1_slope":    MeasurementResult(status=MeasurementStatus.NOT_YET_IMPLEMENTED, tier=AnalysisTier.TIER2_PENDING),
            "c2c7_sva":    MeasurementResult(status=MeasurementStatus.MANUAL_ONLY, note="Requires pixel spacing calibration"),
            "canal_ap_mm": MeasurementResult(status=MeasurementStatus.NOT_YET_IMPLEMENTED),
        },
    )
    return JSONResponse(content=resp.to_api_dict())


# ─── Muscle — not yet implemented ────────────────────────────────────────────

@router.post("/analyze/muscle")
async def analyze_muscle(
    image: UploadFile = File(...),
    height_cm: Optional[float] = Form(None),
):
    """
    Muscle/body composition analysis — NOT YET IMPLEMENTED.
    Requires trained segmentation model. Manual entry required.
    """
    resp = MuscleResponse(
        status="unavailable",
        errors=[
            "Muscle segmentation pipeline not yet implemented. "
            "Requires a trained model (nnU-Net / MONAI / TotalSegmentator). "
            "Use imaging workstation software to measure CSA, then enter manually."
        ],
        processing_notes=[
            "This module requires pixel-accurate segmentation — not achievable with "
            "classical CV or general vision LLMs.",
            "DICOM pixel spacing required for calibrated area (cm²) output.",
        ],
        measurements={
            "psoas_csa_left":  MeasurementResult(status=MeasurementStatus.NOT_YET_IMPLEMENTED, tier=AnalysisTier.TIER3_SEGMENTATION),
            "psoas_csa_right": MeasurementResult(status=MeasurementStatus.NOT_YET_IMPLEMENTED, tier=AnalysisTier.TIER3_SEGMENTATION),
            "total_sma":       MeasurementResult(status=MeasurementStatus.NOT_YET_IMPLEMENTED, tier=AnalysisTier.TIER3_SEGMENTATION),
            "smi":             MeasurementResult(status=MeasurementStatus.NOT_YET_IMPLEMENTED, tier=AnalysisTier.TIER3_SEGMENTATION),
            "pmi":             MeasurementResult(status=MeasurementStatus.NOT_YET_IMPLEMENTED, tier=AnalysisTier.TIER3_SEGMENTATION),
            "mean_hu":         MeasurementResult(status=MeasurementStatus.NOT_YET_IMPLEMENTED, tier=AnalysisTier.TIER3_SEGMENTATION, note="Requires DICOM non-contrast CT"),
        },
    )
    return JSONResponse(content=resp.to_api_dict())
