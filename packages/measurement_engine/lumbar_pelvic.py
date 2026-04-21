"""
SpineMetrics — Lumbar/Pelvic Measurement Orchestrator

Takes a LumbarPelvicLandmarks object (from any detection source)
and returns a fully-populated LumbarPelvicResponse.

This layer is SEPARATE from both:
  - image analysis (landmark detection)
  - clinical interpretation (cutoff classification)

It is purely geometric: landmarks in → measurements out.
"""

from __future__ import annotations
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../.."))

from packages.shared_types.landmarks import LumbarPelvicLandmarks
from packages.shared_types.responses import (
    LumbarPelvicResponse, MeasurementResult,
    MeasurementStatus, AnalysisTier,
)
from packages.measurement_engine.geometry import (
    cobb_angle, sacral_slope, pelvic_tilt,
    pelvic_incidence, pi_ll_mismatch,
    measurement_confidence, check_pi_consistency,
)

# Confidence thresholds
REAL_THRESHOLD     = 0.45   # above → available_real
LOW_CONF_THRESHOLD = 0.25   # above → available_low_confidence, below → failed

ROADMAP_TIER2 = {
    "sva_mm": "Requires full-spine image + pixel spacing calibration",
    "spondylolisthesis_pct": "Requires vertebral corner detection (Tier 2)",
    "disc_height_index": "Requires disc boundary detection (Tier 2)",
}


def _status_from_confidence(conf: float) -> MeasurementStatus:
    if conf >= REAL_THRESHOLD:
        return MeasurementStatus.AVAILABLE_REAL
    if conf >= LOW_CONF_THRESHOLD:
        return MeasurementStatus.AVAILABLE_LOW_CONFIDENCE
    return MeasurementStatus.FAILED


def compute_lumbar_pelvic(landmarks: LumbarPelvicLandmarks) -> LumbarPelvicResponse:
    """
    Compute all lumbar and pelvic measurements from a LumbarPelvicLandmarks object.

    Args:
        landmarks: Detected landmarks from any source (CV, trained model, manual)

    Returns:
        LumbarPelvicResponse with per-field MeasurementResult objects
    """
    measurements: dict[str, MeasurementResult] = {}
    notes = [
        f"Landmark source: {landmarks.source}",
        f"Image: {landmarks.image_width_px}×{landmarks.image_height_px}px",
        f"Image quality: {landmarks.image_quality}",
    ]
    warnings = list(landmarks.quality_notes)

    # ── L1 endplate landmarks ─────────────────────────────────────────────────
    l1 = landmarks.l1_superior
    s1 = landmarks.s1_superior
    l1_p1 = (l1.left_point.x, l1.left_point.y)
    l1_p2 = (l1.right_point.x, l1.right_point.y)
    s1_p1 = (s1.left_point.x, s1.left_point.y)
    s1_p2 = (s1.right_point.x, s1.right_point.y)

    l1_conf = l1.mean_confidence
    s1_conf = s1.mean_confidence

    notes.append(f"L1 endplate mean confidence: {l1_conf:.2f}")
    notes.append(f"S1 endplate mean confidence: {s1_conf:.2f}")

    # ── Lumbar lordosis (L1–S1 Cobb) ─────────────────────────────────────────
    if l1.is_reliable and s1.is_reliable:
        ll_val  = cobb_angle(l1_p1, l1_p2, s1_p1, s1_p2)
        ll_conf = measurement_confidence([l1_conf, s1_conf], method="min")
        measurements["lumbar_lordosis_cobb"] = MeasurementResult(
            status=_status_from_confidence(ll_conf),
            value=ll_val if ll_conf >= LOW_CONF_THRESHOLD else None,
            unit="deg",
            confidence=ll_conf,
            note=f"L1 conf={l1_conf:.2f}, S1 conf={s1_conf:.2f}. "
                 "Verify against manual Cobb measurement.",
            overlay={
                "type": "cobb",
                "l1": [l1_p1[0], l1_p1[1], l1_p2[0], l1_p2[1]],
                "s1": [s1_p1[0], s1_p1[1], s1_p2[0], s1_p2[1]],
            },
        )
    else:
        reason = (
            f"L1 confidence {l1_conf:.2f} below threshold"
            if not l1.is_reliable else
            f"S1 confidence {s1_conf:.2f} below threshold"
        )
        measurements["lumbar_lordosis_cobb"] = MeasurementResult(
            status=MeasurementStatus.FAILED,
            note=f"Endplate detection insufficient: {reason}. Manual entry required.",
        )

    # ── Sacral slope ──────────────────────────────────────────────────────────
    if s1.is_reliable:
        ss_val  = sacral_slope(s1_p1, s1_p2)
        ss_conf = s1_conf
        measurements["sacral_slope"] = MeasurementResult(
            status=_status_from_confidence(ss_conf),
            value=ss_val if ss_conf >= LOW_CONF_THRESHOLD else None,
            unit="deg",
            confidence=ss_conf,
            note=f"S1 endplate angle from horizontal. S1 conf={s1_conf:.2f}.",
            overlay={"type": "line", "coords": [s1_p1[0], s1_p1[1], s1_p2[0], s1_p2[1]]},
        )
    else:
        measurements["sacral_slope"] = MeasurementResult(
            status=MeasurementStatus.FAILED,
            note=f"S1 endplate confidence {s1_conf:.2f} below threshold.",
        )

    # ── Femoral head → PT and PI ──────────────────────────────────────────────
    fem_center  = landmarks.femoral_midpoint
    fem_conf    = landmarks.femoral_midpoint_confidence

    notes.append(
        f"Femoral midpoint confidence: {fem_conf:.2f} "
        f"(L={landmarks.femoral_left.confidence:.2f}, "
        f"R={landmarks.femoral_right.confidence:.2f})"
    )

    ss_result = measurements.get("sacral_slope")
    ss_available = (
        ss_result is not None
        and ss_result.value is not None
        and ss_result.status != MeasurementStatus.FAILED
    )

    if fem_center and s1.is_reliable and fem_conf >= LOW_CONF_THRESHOLD:
        s1_mid = s1.midpoint
        pt_val  = pelvic_tilt(s1_mid, fem_center)
        # PT confidence = min of S1 and femoral, with extra penalty for femoral
        pt_conf = measurement_confidence([s1_conf, fem_conf * 0.85], method="min")

        measurements["pelvic_tilt"] = MeasurementResult(
            status=_status_from_confidence(pt_conf),
            value=pt_val if pt_conf >= LOW_CONF_THRESHOLD else None,
            unit="deg",
            confidence=pt_conf,
            note=(
                f"S1 midpoint→femoral head angle from vertical. "
                f"S1 conf={s1_conf:.2f}, femoral conf={fem_conf:.2f}. "
                "Femoral head detection is inherently less reliable than endplate "
                "detection — verify PT before clinical use."
            ),
            overlay={
                "type": "pt_line",
                "s1_midpoint": [s1_mid[0], s1_mid[1]],
                "femoral_center": [fem_center[0], fem_center[1]],
                "femoral_left": [landmarks.femoral_left.x, landmarks.femoral_left.y]
                    if landmarks.femoral_left.is_reliable else None,
                "femoral_right": [landmarks.femoral_right.x, landmarks.femoral_right.y]
                    if landmarks.femoral_right.is_reliable else None,
            },
        )

        # PI
        if ss_available:
            pi_val  = pelvic_incidence(pt_val, ss_result.value)
            pi_conf = measurement_confidence([pt_conf, s1_conf], method="min")

            # Consistency check
            consistency = check_pi_consistency(pi_val, pt_val, ss_result.value)
            if not consistency["is_consistent"]:
                warnings.append(f"PI consistency check: {consistency['note']}")

            measurements["pelvic_incidence"] = MeasurementResult(
                status=_status_from_confidence(pi_conf),
                value=pi_val if pi_conf >= LOW_CONF_THRESHOLD else None,
                unit="deg",
                confidence=pi_conf,
                note=f"PI = PT ({pt_val}°) + SS ({ss_result.value}°). {consistency['note']}",
            )

            # PI-LL mismatch
            ll_result = measurements.get("lumbar_lordosis_cobb")
            ll_available = (
                ll_result is not None
                and ll_result.value is not None
                and ll_result.status != MeasurementStatus.FAILED
            )
            if ll_available:
                pill_val  = pi_ll_mismatch(pi_val, ll_result.value)
                pill_conf = measurement_confidence([pi_conf, ll_result.confidence or 0], method="min")
                measurements["pi_ll_mismatch"] = MeasurementResult(
                    status=_status_from_confidence(pill_conf),
                    value=pill_val,
                    unit="deg",
                    confidence=pill_conf,
                    note=(
                        f"PI ({pi_val}°) − LL ({ll_result.value}°) = {pill_val}°. "
                        "Schwab 2012: >10° = (+), >20° = (++)."
                    ),
                )
            else:
                measurements["pi_ll_mismatch"] = MeasurementResult(
                    status=MeasurementStatus.FAILED,
                    note="LL not available — cannot compute PI-LL mismatch.",
                )
        else:
            measurements["pelvic_incidence"] = MeasurementResult(
                status=MeasurementStatus.FAILED,
                note="SS not available — PI = PT + SS cannot be computed.",
            )
            measurements["pi_ll_mismatch"] = MeasurementResult(
                status=MeasurementStatus.FAILED,
                note="PI not available.",
            )
    else:
        reason = (
            "Femoral head not detected"
            if not fem_center else
            f"Femoral head confidence {fem_conf:.2f} below threshold"
        )
        for key in ("pelvic_tilt", "pelvic_incidence", "pi_ll_mismatch"):
            measurements[key] = MeasurementResult(
                status=MeasurementStatus.FAILED,
                note=f"{reason}. Ensure lumbopelvic image includes femoral heads. Manual entry required.",
            )

    # ── Tier 2 fields — not yet implemented ───────────────────────────────────
    for key, note in ROADMAP_TIER2.items():
        measurements[key] = MeasurementResult(
            status=MeasurementStatus.NOT_YET_IMPLEMENTED,
            tier=AnalysisTier.TIER2_PENDING,
            note=note,
        )

    # ── Determine overall status ───────────────────────────────────────────────
    real_count = sum(1 for m in measurements.values() if m.is_real())
    tier1_keys = {"lumbar_lordosis_cobb", "sacral_slope", "pelvic_tilt",
                  "pelvic_incidence", "pi_ll_mismatch"}
    tier1_real = sum(1 for k, m in measurements.items() if k in tier1_keys and m.is_real())

    if tier1_real >= 4:
        status = "success"
    elif tier1_real >= 2:
        status = "partial"
    elif tier1_real >= 1:
        status = "partial"
    else:
        status = "failed"

    warnings.append(
        "All CV-based measurements are heuristic estimates. "
        "Verify against manual measurement before clinical use."
    )

    return LumbarPelvicResponse(
        module="lumbar_pelvic",
        status=status,
        image_quality=landmarks.image_quality,
        image_width_px=landmarks.image_width_px,
        image_height_px=landmarks.image_height_px,
        measurements=measurements,
        landmarks=_landmarks_to_dict(landmarks),
        warnings=warnings,
        processing_notes=notes,
        overlay_available=True,
    )


def _landmarks_to_dict(lm: LumbarPelvicLandmarks) -> dict:
    """Serialize landmark positions for the API response."""
    def pt(p) -> dict:
        return {"x": round(p.x, 1), "y": round(p.y, 1), "confidence": round(p.confidence, 3)}

    return {
        "source": lm.source,
        "l1_superior": {
            "left":  pt(lm.l1_superior.left_point),
            "right": pt(lm.l1_superior.right_point),
        },
        "s1_superior": {
            "left":  pt(lm.s1_superior.left_point),
            "right": pt(lm.s1_superior.right_point),
        },
        "femoral_left":  pt(lm.femoral_left),
        "femoral_right": pt(lm.femoral_right),
        "femoral_midpoint": {
            "x": round(lm.femoral_midpoint[0], 1),
            "y": round(lm.femoral_midpoint[1], 1),
        } if lm.femoral_midpoint else None,
    }
