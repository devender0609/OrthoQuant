"""
SpineMetrics — Landmark Schemas

These Pydantic models define the EXACT contract between:
  - any landmark detection model (CV heuristic, trained DL, or manual annotation)
  - the geometric measurement engine

A trained model must output one of these schemas.
The measurement engine consumes one of these schemas.
They never share internal implementation details.

Coordinate system:
  - All x, y coordinates are in ORIGINAL IMAGE PIXELS (before any resize)
  - (0, 0) is top-left corner
  - x increases right, y increases down
  - This matches standard image conventions

Confidence:
  - Per-point confidence 0.0–1.0
  - 0.0 = point not detected / not available
  - 1.0 = high confidence detection
  - confidence < 0.3 = treat as missing, do not use for measurement
"""

from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field, model_validator


# ─── Base point ───────────────────────────────────────────────────────────────

class ImagePoint(BaseModel):
    """A single detected point in image pixel coordinates."""
    x: float
    y: float
    confidence: float = Field(ge=0.0, le=1.0, default=0.0)
    note: Optional[str] = None

    @property
    def is_reliable(self) -> bool:
        return self.confidence >= 0.30

    def scale_to(self, factor: float) -> "ImagePoint":
        """Return a new point scaled by factor (e.g. for resize normalization)."""
        return ImagePoint(x=self.x * factor, y=self.y * factor,
                          confidence=self.confidence, note=self.note)


# ─── Endplate pair ────────────────────────────────────────────────────────────

class EndplateLandmarks(BaseModel):
    """
    Two points defining a vertebral endplate line.
    left_point: medial or left side of endplate
    right_point: lateral or right side of endplate
    Both are required. If detection fails, set confidence=0.0 on both.
    """
    left_point:  ImagePoint
    right_point: ImagePoint

    @property
    def midpoint(self) -> tuple[float, float]:
        return (
            (self.left_point.x + self.right_point.x) / 2,
            (self.left_point.y + self.right_point.y) / 2,
        )

    @property
    def mean_confidence(self) -> float:
        return (self.left_point.confidence + self.right_point.confidence) / 2

    @property
    def is_reliable(self) -> bool:
        return self.left_point.is_reliable and self.right_point.is_reliable


# ─── Lumbar / Pelvic landmark schema ─────────────────────────────────────────

class LumbarPelvicLandmarks(BaseModel):
    """
    Complete landmark set for lumbar alignment and pelvic parameter measurement.

    Required for Tier 1 measurements:
      l1_superior    → lumbar lordosis Cobb
      s1_superior    → lumbar lordosis Cobb + sacral slope
      femoral_left   → pelvic tilt (left head)
      femoral_right  → pelvic tilt (right head)

    Derived:
      femoral_midpoint: computed from left + right if both available

    Source:
      "cv_heuristic"  — Hough-based detection (current implementation)
      "trained_model" — output from a trained landmark detection network
      "manual"        — annotated by a clinician
    """
    source: str = Field(description="Detection source: cv_heuristic | trained_model | manual")

    # Vertebral endplates
    l1_superior: EndplateLandmarks = Field(description="L1 superior endplate (left and right points)")
    s1_superior: EndplateLandmarks = Field(description="S1 superior endplate (left and right points)")

    # Femoral heads
    femoral_left:  ImagePoint = Field(description="Left femoral head center")
    femoral_right: ImagePoint = Field(description="Right femoral head center")

    # Image metadata
    image_width_px:  int
    image_height_px: int

    # Optional: additional landmarks for Tier 2 measurements
    l1_inferior: Optional[EndplateLandmarks] = None   # future: disc height
    l5_inferior: Optional[EndplateLandmarks] = None   # future: L5-S1 disc
    s1_posterior: Optional[ImagePoint] = None          # future: SVA

    # Quality flags from detection
    image_quality: str = "unknown"   # "good" | "fair" | "poor" | "unknown"
    quality_notes: list[str] = Field(default_factory=list)

    @property
    def femoral_midpoint(self) -> Optional[tuple[float, float]]:
        """
        Effective femoral head axis midpoint.
        Uses bilateral midpoint if both heads detected, single head otherwise.
        """
        l_ok = self.femoral_left.is_reliable
        r_ok = self.femoral_right.is_reliable
        if l_ok and r_ok:
            return (
                (self.femoral_left.x + self.femoral_right.x) / 2,
                (self.femoral_left.y + self.femoral_right.y) / 2,
            )
        if l_ok:
            return (self.femoral_left.x, self.femoral_left.y)
        if r_ok:
            return (self.femoral_right.x, self.femoral_right.y)
        return None

    @property
    def femoral_midpoint_confidence(self) -> float:
        l_ok = self.femoral_left.is_reliable
        r_ok = self.femoral_right.is_reliable
        if l_ok and r_ok:
            # Both heads — symmetric detection, higher confidence
            return min(
                (self.femoral_left.confidence + self.femoral_right.confidence) / 2,
                0.85,
            )
        if l_ok:
            return self.femoral_left.confidence * 0.75  # single head penalty
        if r_ok:
            return self.femoral_right.confidence * 0.75
        return 0.0

    @model_validator(mode="after")
    def check_geometry(self) -> "LumbarPelvicLandmarks":
        """Warn if L1 center_y is below S1 center_y — anatomically impossible."""
        l1_y = self.l1_superior.midpoint[1]
        s1_y = self.s1_superior.midpoint[1]
        if (self.l1_superior.is_reliable and self.s1_superior.is_reliable
                and l1_y > s1_y):
            self.quality_notes.append(
                "GEOMETRY WARNING: L1 detected below S1 (L1_y > S1_y). "
                "Landmark positions may be swapped or image orientation is non-standard."
            )
        return self


# ─── Cervical landmark schema (future) ───────────────────────────────────────

class CervicalLandmarks(BaseModel):
    """
    Landmark schema for cervical alignment.
    Not yet implemented — defined here so the contract is explicit.
    """
    source: str = "not_implemented"
    c2_inferior: Optional[EndplateLandmarks] = None
    c7_inferior: Optional[EndplateLandmarks] = None
    t1_superior: Optional[EndplateLandmarks] = None
    image_width_px:  int = 0
    image_height_px: int = 0
    image_quality: str = "unknown"
    quality_notes: list[str] = Field(default_factory=list)


# ─── Muscle landmark schema (future) ─────────────────────────────────────────

class MuscleSegmentationLandmarks(BaseModel):
    """
    Output schema for muscle segmentation model.
    Not yet implemented.
    pixel_spacing_mm MUST be present for calibrated area output.
    """
    source: str = "not_implemented"
    pixel_spacing_mm: Optional[float] = None   # from DICOM — required for CSA
    level_confirmed: bool = False
    psoas_left_mask_rle:  Optional[str] = None  # run-length encoded segmentation mask
    psoas_right_mask_rle: Optional[str] = None
    total_muscle_mask_rle: Optional[str] = None
    image_quality: str = "unknown"
    quality_notes: list[str] = Field(default_factory=list)
