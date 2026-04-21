"""
SpineMetrics — API Response Schemas

These are the canonical shapes returned by every analysis endpoint.
The frontend depends on this schema — do not change field names without versioning.
"""

from __future__ import annotations
from typing import Optional, Any
from enum import Enum
from pydantic import BaseModel, Field


class MeasurementStatus(str, Enum):
    AVAILABLE_REAL           = "available_real"
    AVAILABLE_LOW_CONFIDENCE = "available_low_confidence"
    FAILED                   = "failed"
    NOT_YET_IMPLEMENTED      = "not_yet_implemented"
    MANUAL_ONLY              = "manual_only"
    NOT_APPLICABLE           = "not_applicable"


class AnalysisTier(str, Enum):
    TIER1_REAL_CV      = "tier1_real_cv"
    TIER2_PENDING      = "tier2_pending"
    TIER3_SEGMENTATION = "tier3_segmentation"


class MeasurementResult(BaseModel):
    """Result for a single measurement field."""
    status:     MeasurementStatus
    value:      Optional[float] = None
    unit:       str = "deg"
    confidence: Optional[float] = Field(None, ge=0.0, le=1.0)
    note:       Optional[str] = None
    tier:       AnalysisTier = AnalysisTier.TIER1_REAL_CV
    overlay:    Optional[dict] = None   # image coordinate metadata for frontend drawing

    def is_real(self) -> bool:
        return self.status in (
            MeasurementStatus.AVAILABLE_REAL,
            MeasurementStatus.AVAILABLE_LOW_CONFIDENCE,
        ) and self.value is not None


class LumbarPelvicResponse(BaseModel):
    """
    Response from POST /analyze/lumbar-pelvic
    This is the primary production endpoint schema.
    """
    module:  str = "lumbar_pelvic"
    status:  str   # "success" | "partial" | "failed" | "unavailable"
    version: str = "6.0.0"

    image_quality: Optional[str] = None
    image_width_px:  Optional[int] = None
    image_height_px: Optional[int] = None

    measurements: dict[str, MeasurementResult] = Field(default_factory=dict)

    # Landmark payload (coordinates) — for overlay drawing and debugging
    landmarks: Optional[dict] = None

    warnings:         list[str] = Field(default_factory=list)
    errors:           list[str] = Field(default_factory=list)
    processing_notes: list[str] = Field(default_factory=list)

    overlay_available: bool = False

    @property
    def real_count(self) -> int:
        return sum(1 for m in self.measurements.values() if m.is_real())

    def to_api_dict(self) -> dict:
        """Serialize for JSON response — flat values at top level for frontend compat."""
        flat = {
            k: v.value for k, v in self.measurements.items()
            if v.value is not None
        }
        return {
            **self.model_dump(),
            **flat,
            "real_count": self.real_count,
            "total_fields": len(self.measurements),
            # fields dict mirrors v6 frontend schema
            "fields": {
                k: {
                    "status":     v.status.value,
                    "value":      round(v.value, 1) if v.value is not None else None,
                    "unit":       v.unit,
                    "confidence": round(v.confidence, 2) if v.confidence is not None else None,
                    "note":       v.note,
                    "tier":       v.tier.value,
                    "overlay":    v.overlay,
                }
                for k, v in self.measurements.items()
            },
        }


class CervicalResponse(BaseModel):
    module:  str = "cervical"
    status:  str = "unavailable"
    version: str = "6.0.0"
    measurements: dict[str, MeasurementResult] = Field(default_factory=dict)
    errors:  list[str] = Field(default_factory=list)
    processing_notes: list[str] = Field(default_factory=list)

    def to_api_dict(self) -> dict:
        return {
            **self.model_dump(),
            "fields": {k: {"status": v.status.value, "value": None, "note": v.note}
                       for k, v in self.measurements.items()},
        }


class MuscleResponse(BaseModel):
    module:  str = "muscle"
    status:  str = "unavailable"
    version: str = "6.0.0"
    measurements: dict[str, MeasurementResult] = Field(default_factory=dict)
    errors:  list[str] = Field(default_factory=list)
    processing_notes: list[str] = Field(default_factory=list)

    def to_api_dict(self) -> dict:
        return {
            **self.model_dump(),
            "fields": {k: {"status": v.status.value, "value": None, "note": v.note}
                       for k, v in self.measurements.items()},
        }


class StatusResponse(BaseModel):
    """Response from GET /status"""
    version: str
    modules: dict[str, dict]
    dependencies: dict[str, bool]
    disclaimer: str = "Research use only. Not FDA-cleared."
