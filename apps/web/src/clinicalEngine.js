/**
 * SpineMetrics Clinical Engine v2
 * ─────────────────────────────────────────────────────────────────────────────
 * All interpretation logic is deterministic and runs in the browser.
 * The LLM is used ONLY for prose enhancement if the API is reachable.
 * A full structured report is always produced from this engine alone.
 *
 * Rules:
 * - NEVER use "sarcopenia" as a diagnosis from imaging alone.
 * - NEVER recommend treatment.
 * - ALWAYS state limitations explicitly.
 * - All cutoffs cite their source in the output.
 */

// ─── Validated Cutoffs ────────────────────────────────────────────────────────
export const CUTOFFS = {
  // Prado et al. 2008, Am J Clin Nutr
  smi_male_class1:   52.4,
  smi_male_class2:   43.0,
  smi_female_class1: 38.5,
  smi_female_class2: 41.0,
  // Derstine et al. 2018, Sci Rep
  pmi_male:   6.36,
  pmi_female: 3.84,
  // Schwab SRS-Schwab, Spine 2012
  pt_plus:      20,
  pt_plusplus:  30,
  pill_plus:    10,
  pill_plusplus: 20,
  sva_plus:      40,
  sva_plusplus:  95,
  // Lumbar lordosis: Roussouly 2005 population range
  ll_low:  40,
  ll_high: 60,
  // Cervical lordosis: normal C2-C7 Cobb
  cl_low:  10,
  cl_high: 40,
  // Frobin 1997 disc height index at L4-L5
  dhi_normal_low:    0.33,
  dhi_normal_high:   0.40,
  dhi_severe_cutoff: 0.20,
  // Hayashi 1995 cervical canal
  canal_absolute_stenosis: 10,
  // Martin et al. 2013 myosteatosis (BMI-stratified)
  hu_bmi_lt25_male:   41,
  hu_bmi_lt25_female: 33,
  hu_bmi_ge25_male:   33,
  hu_bmi_ge25_female: 22,
}

// ─── Validation helpers ───────────────────────────────────────────────────────

/**
 * Returns array of { field, message } validation errors for a module's values.
 * These are hard blocks — report cannot generate until resolved.
 */
export function validateFields(module, values) {
  const errors = []
  const v = values

  const num = (key) => parseFloat(v[key])
  const has = (key) => v[key] !== undefined && v[key] !== '' && v[key] !== null

  if (module === 'muscle') {
    if (has('height') && (num('height') < 100 || num('height') > 230))
      errors.push({ field: 'height', message: 'Height must be between 100 and 230 cm.' })
    if (has('weight') && (num('weight') < 20 || num('weight') > 300))
      errors.push({ field: 'weight', message: 'Weight must be between 20 and 300 kg.' })
    if (has('age') && (num('age') < 18 || num('age') > 110))
      errors.push({ field: 'age', message: 'Age must be between 18 and 110 years.' })
    if (has('psoas_l') && (num('psoas_l') < 0.5 || num('psoas_l') > 60))
      errors.push({ field: 'psoas_l', message: 'Left psoas CSA: implausible value (expected 0.5–60 cm²).' })
    if (has('psoas_r') && (num('psoas_r') < 0.5 || num('psoas_r') > 60))
      errors.push({ field: 'psoas_r', message: 'Right psoas CSA: implausible value (expected 0.5–60 cm²).' })
    if (has('total_sma') && (num('total_sma') < 20 || num('total_sma') > 400))
      errors.push({ field: 'total_sma', message: 'Total SMA: implausible value (expected 20–400 cm²).' })
    if (has('mean_hu') && (num('mean_hu') < -100 || num('mean_hu') > 100))
      errors.push({ field: 'mean_hu', message: 'Mean HU: implausible for skeletal muscle (expected -100 to +100 HU).' })
    // Psoas sum vs SMA sanity
    if (has('psoas_l') && has('psoas_r') && has('total_sma')) {
      const psoas_tot = num('psoas_l') + num('psoas_r')
      if (psoas_tot > num('total_sma'))
        errors.push({ field: 'total_sma', message: 'Total SMA cannot be less than sum of bilateral psoas CSA.' })
    }
  }

  if (module === 'lumbar') {
    if (has('ll_cobb') && (num('ll_cobb') < -30 || num('ll_cobb') > 100))
      errors.push({ field: 'll_cobb', message: 'Lumbar lordosis: implausible (expected -30° to +100°).' })
    if (has('pi') && (num('pi') < 20 || num('pi') > 100))
      errors.push({ field: 'pi', message: 'PI: implausible (expected 20°–100°).' })
    if (has('pt') && (num('pt') < -10 || num('pt') > 60))
      errors.push({ field: 'pt', message: 'PT: implausible (expected -10° to +60°).' })
    if (has('ss') && (num('ss') < 0 || num('ss') > 80))
      errors.push({ field: 'ss', message: 'SS: implausible (expected 0°–80°).' })
    if (has('sva') && (num('sva') < -200 || num('sva') > 400))
      errors.push({ field: 'sva', message: 'SVA: implausible (expected -200 to +400 mm).' })
    if (has('spondylo_pct') && (num('spondylo_pct') < 0 || num('spondylo_pct') > 100))
      errors.push({ field: 'spondylo_pct', message: 'Slip %: must be 0–100%.' })
    if (has('disc_height') && (num('disc_height') < 0 || num('disc_height') > 1))
      errors.push({ field: 'disc_height', message: 'DHI: must be between 0 and 1.' })
  }

  if (module === 'cervical') {
    if (has('c2c7_cobb') && (num('c2c7_cobb') < -60 || num('c2c7_cobb') > 80))
      errors.push({ field: 'c2c7_cobb', message: 'C2–C7 angle: implausible (expected -60° to +80°).' })
    if (has('c2c7_sva') && (num('c2c7_sva') < -50 || num('c2c7_sva') > 200))
      errors.push({ field: 'c2c7_sva', message: 'C2–C7 SVA: implausible (expected -50 to +200 mm).' })
    if (has('t1_slope') && (num('t1_slope') < 0 || num('t1_slope') > 60))
      errors.push({ field: 't1_slope', message: 'T1 slope: implausible (expected 0°–60°).' })
    if (has('mcl') && (num('mcl') < 3 || num('mcl') > 25))
      errors.push({ field: 'mcl', message: 'Canal diameter: implausible (expected 3–25 mm).' })
  }

  if (module === 'pelvic') {
    if (has('pi') && (num('pi') < 20 || num('pi') > 100))
      errors.push({ field: 'pi', message: 'PI: implausible (expected 20°–100°).' })
    if (has('pt') && (num('pt') < -10 || num('pt') > 60))
      errors.push({ field: 'pt', message: 'PT: implausible (expected -10° to +60°).' })
    if (has('ss') && (num('ss') < 0 || num('ss') > 80))
      errors.push({ field: 'ss', message: 'SS: implausible (expected 0°–80°).' })
  }

  return errors
}

/**
 * Returns array of warning strings (non-blocking).
 */
export function getClinicalWarnings(module, values, hasImage) {
  const warnings = []
  const v = values
  const num = (key) => parseFloat(v[key])
  const has = (key) => v[key] !== undefined && v[key] !== '' && v[key] !== null

  if (['lumbar', 'pelvic'].includes(module) && has('film_type') && v.film_type !== 'Standing') {
    warnings.push(
      `Non-standing film selected (${v.film_type}). Pelvic parameters (PI, PT, SS) and sagittal alignment measurements are position-dependent and cannot be reliably interpreted from non-weight-bearing imaging. All spinopelvic values will be flagged in the report.`
    )
  }

  if (['lumbar', 'pelvic'].includes(module)) {
    if (has('pi') && has('pt') && has('ss')) {
      const diff = Math.abs(num('pi') - num('pt') - num('ss'))
      if (diff > 4) {
        warnings.push(
          `Geometric inconsistency: PI (${v.pi}°) should equal PT (${v.pt}°) + SS (${v.ss}°) by definition. Current difference = ${diff.toFixed(1)}°, which exceeds the ±4° tolerance. Please verify all three measurements.`
        )
      }
    }
  }

  if (module === 'muscle') {
    if (!hasImage) {
      warnings.push(
        'No imaging uploaded. Measurements must be derived from a validated axial CT at L3 with bilateral transverse processes visible. Confirm all values were obtained from appropriate DICOM-sourced imaging.'
      )
    }
    if (has('mean_hu') && !hasImage) {
      warnings.push(
        'HU-based myosteatosis assessment requires DICOM-sourced non-contrast CT with a standard soft-tissue reconstruction kernel. Values entered without uploaded imaging cannot be verified for scanner calibration.'
      )
    }
    if (has('mean_hu') && has('imaging_notes')) {
      const notes = v.imaging_notes.toLowerCase()
      if (notes.includes('contrast') || notes.includes('portal') || notes.includes('arterial')) {
        warnings.push(
          'Contrast-enhanced CT is noted. Hounsfield unit thresholds for myosteatosis (Martin et al. 2013) were established on non-contrast CT. HU values from contrast phases are not directly comparable to these cutoffs and will be flagged accordingly.'
        )
      }
    }
  }

  if (module === 'cervical' && has('film_position') && v.film_position !== 'Neutral') {
    warnings.push(
      `Neck position is ${v.film_position}. Cervical alignment measurements in non-neutral positions reflect dynamic positioning, not static anatomical lordosis. These values should not be compared directly to neutral-position normative data.`
    )
  }

  if (module === 'pelvic' && has('both_heads') && v.both_heads !== 'Yes') {
    warnings.push(
      'Both femoral heads are not fully visible. Pelvic incidence requires the midpoint of the femoral head axis. When only one head is visible, the midpoint is estimated by assuming bilateral symmetry — this introduces measurement error of approximately ±3–5°.'
    )
  }

  return warnings
}

// ─── Derived calculations ─────────────────────────────────────────────────────

export function computeDerived(module, values) {
  const out = []
  const num = (key) => parseFloat(values[key])
  const has = (key) => values[key] !== undefined && values[key] !== '' && !isNaN(parseFloat(values[key]))

  if (module === 'muscle') {
    const h = num('height')
    const ht = h / 100
    const ht2 = ht * ht
    if (has('height') && has('total_sma')) {
      const smi = num('total_sma') / ht2
      out.push(`SMI = ${num('total_sma')} cm² ÷ (${ht.toFixed(2)} m)² = ${smi.toFixed(2)} cm²/m²`)
    }
    if (has('height') && has('psoas_l') && has('psoas_r')) {
      const tot = num('psoas_l') + num('psoas_r')
      const pmi = tot / ht2
      out.push(`Psoas total = ${num('psoas_l')} + ${num('psoas_r')} = ${tot.toFixed(1)} cm²  →  PMI = ${pmi.toFixed(2)} cm²/m²`)
    }
    if (has('height') && has('weight')) {
      const bmi = num('weight') / ht2
      out.push(`BMI = ${num('weight')} kg ÷ (${ht.toFixed(2)} m)² = ${bmi.toFixed(1)} kg/m²`)
    }
  }

  if (module === 'lumbar') {
    if (has('pi') && has('ll_cobb')) {
      const m = num('pi') - num('ll_cobb')
      out.push(`PI-LL mismatch = ${num('pi')}° − ${num('ll_cobb')}° = ${m > 0 ? '+' : ''}${m.toFixed(1)}°`)
    }
    if (has('pi') && has('pt')) {
      out.push(`PI − PT = ${num('pi')}° − ${num('pt')}° = ${(num('pi') - num('pt')).toFixed(1)}°`)
    }
    if (has('pi') && has('pt') && has('ss')) {
      const diff = num('pi') - num('pt') - num('ss')
      const ok = Math.abs(diff) <= 4
      out.push(`Geo check: PI(${num('pi')}) − PT(${num('pt')}) − SS(${num('ss')}) = ${diff.toFixed(1)}° ${ok ? '✓ within tolerance' : '⚠ INCONSISTENCY'}`)
    }
  }

  if (module === 'pelvic') {
    if (has('pi') && has('pt') && has('ss')) {
      const diff = num('pi') - num('pt') - num('ss')
      const ok = Math.abs(diff) <= 4
      out.push(`PI − PT − SS = ${num('pi')} − ${num('pt')} − ${num('ss')} = ${diff.toFixed(1)}° ${ok ? '✓ consistent' : '⚠ INCONSISTENCY'}`)
    }
  }

  if (module === 'cervical') {
    if (has('c2c7_cobb') && has('t1_slope')) {
      out.push(`T1 slope − CL mismatch = ${num('t1_slope')}° − ${num('c2c7_cobb')}° = ${(num('t1_slope') - num('c2c7_cobb')).toFixed(1)}°`)
    }
  }

  return out
}

// ─── Interpretation helpers ───────────────────────────────────────────────────

function classifySMI(smi, sex) {
  const c = CUTOFFS
  if (sex === 'Male') {
    if (smi < c.smi_male_class2) return { label: 'Low muscle mass — class II (radiographic proxy)', level: 'critical' }
    if (smi < c.smi_male_class1) return { label: 'Low muscle mass — class I (radiographic proxy)', level: 'low' }
    return { label: 'Within expected range', level: 'normal' }
  } else {
    if (smi < c.smi_female_class2) return { label: 'Low muscle mass — class II (radiographic proxy)', level: 'critical' }
    if (smi < c.smi_female_class1) return { label: 'Low muscle mass — class I (radiographic proxy)', level: 'low' }
    return { label: 'Within expected range', level: 'normal' }
  }
}

function classifyPMI(pmi, sex) {
  const threshold = sex === 'Male' ? CUTOFFS.pmi_male : CUTOFFS.pmi_female
  if (pmi < threshold) return { label: 'Low psoas muscle mass (radiographic proxy)', level: 'low' }
  return { label: 'Within expected range', level: 'normal' }
}

function classifyMyosteatosis(hu, bmi, sex) {
  let threshold
  if (bmi < 25) {
    threshold = sex === 'Male' ? CUTOFFS.hu_bmi_lt25_male : CUTOFFS.hu_bmi_lt25_female
  } else {
    threshold = sex === 'Male' ? CUTOFFS.hu_bmi_ge25_male : CUTOFFS.hu_bmi_ge25_female
  }
  if (hu < threshold) return { label: 'Consistent with myosteatosis', threshold, level: 'low' }
  return { label: 'Above myosteatosis threshold', threshold, level: 'normal' }
}

function classifyPILL(mismatch) {
  const abs = Math.abs(mismatch)
  if (mismatch > CUTOFFS.pill_plusplus) return { label: `PI-LL mismatch (++) — severe sagittal malalignment`, modifier: '(++)', level: 'critical' }
  if (mismatch > CUTOFFS.pill_plus) return { label: `PI-LL mismatch (+)`, modifier: '(+)', level: 'low' }
  if (mismatch < -CUTOFFS.pill_plus) return { label: 'Hyperlordosis relative to PI', modifier: '', level: 'low' }
  return { label: 'PI-LL mismatch within acceptable range', modifier: '0', level: 'normal' }
}

function classifyPT(pt) {
  if (pt > CUTOFFS.pt_plusplus) return { label: 'Elevated PT (++) — severe retroversion', modifier: '(++)', level: 'critical' }
  if (pt > CUTOFFS.pt_plus) return { label: 'Elevated PT (+)', modifier: '(+)', level: 'low' }
  return { label: 'PT within acceptable range', modifier: '0', level: 'normal' }
}

function classifySVA(sva) {
  if (sva > CUTOFFS.sva_plusplus) return { label: 'SVA (++) — severe positive sagittal imbalance', modifier: '(++)', level: 'critical' }
  if (sva > CUTOFFS.sva_plus) return { label: 'SVA (+) — positive sagittal imbalance', modifier: '(+)', level: 'low' }
  if (sva < 0) return { label: 'Negative SVA — posterior sagittal imbalance (less common)', modifier: '', level: 'low' }
  return { label: 'SVA within acceptable range', modifier: '0', level: 'normal' }
}

function classifyLL(ll) {
  if (ll < CUTOFFS.ll_low) return { label: 'Reduced lumbar lordosis', level: 'low' }
  if (ll > CUTOFFS.ll_high) return { label: 'Increased lumbar lordosis', level: 'low' }
  return { label: 'Lumbar lordosis within population range (40–60°)', level: 'normal' }
}

function classifySpondylo(pct) {
  if (pct === 0) return null
  if (pct < 25) return { grade: 'I', label: 'Meyerding grade I (<25%)', level: 'low' }
  if (pct < 50) return { grade: 'II', label: 'Meyerding grade II (25–50%)', level: 'low' }
  if (pct < 75) return { grade: 'III', label: 'Meyerding grade III (50–75%)', level: 'critical' }
  return { grade: 'IV', label: 'Meyerding grade IV (>75%)', level: 'critical' }
}

function classifyDHI(dhi) {
  if (dhi < CUTOFFS.dhi_severe_cutoff) return { label: 'Severely reduced DHI — suggests advanced disc degeneration', level: 'critical' }
  if (dhi < CUTOFFS.dhi_normal_low) return { label: 'Reduced DHI — below normal range for L4–L5', level: 'low' }
  if (dhi > CUTOFFS.dhi_normal_high) return { label: 'Above normal DHI range — verify measurement', level: 'low' }
  return { label: 'DHI within normal range for L4–L5 (0.33–0.40)', level: 'normal' }
}

function classifyCervical(angle) {
  if (angle < 0) return { label: 'Cervical kyphosis (negative value)', level: 'critical' }
  if (angle < CUTOFFS.cl_low) return { label: 'Reduced cervical lordosis', level: 'low' }
  if (angle > CUTOFFS.cl_high) return { label: 'Increased cervical lordosis', level: 'low' }
  return { label: 'Cervical lordosis within normal range (10–40° Cobb)', level: 'normal' }
}

function classifyCanal(mm) {
  if (mm < CUTOFFS.canal_absolute_stenosis) return { label: 'Absolute stenosis by AP diameter (<10 mm)', level: 'critical' }
  if (mm < 13) return { label: 'Relative stenosis by AP diameter (10–12 mm)', level: 'low' }
  return { label: 'Canal diameter within acceptable range', level: 'normal' }
}

// ─── Deterministic Report Generator ──────────────────────────────────────────

/**
 * Generates a complete structured clinical report as a plain-text string.
 * This runs entirely in the browser without any LLM call.
 * The LLM may later polish the prose, but this is the canonical output.
 */
export function generateDeterministicReport(module, values, hasImage, filmWarning) {
  const num = (key) => parseFloat(values[key])
  const has = (key) => values[key] !== undefined && values[key] !== '' && !isNaN(parseFloat(values[key])) && values[key] !== 'Not measured'
  const str = (key) => values[key] || 'Not provided'
  const v = values

  const lines = []
  const ts = new Date().toLocaleString()

  lines.push(`## Clinical Measurement Report`)
  lines.push(``)
  lines.push(`### Patient & Study Context`)
  lines.push(``)
  lines.push(`**Module:** ${moduleName(module)}`)
  lines.push(`**Generated:** ${ts} (deterministic engine — no LLM dependency)`)
  lines.push(`**Sex:** ${str('sex')}`)
  if (has('age')) lines.push(`**Age:** ${num('age')} years`)
  if (has('height')) lines.push(`**Height:** ${num('height')} cm`)
  if (has('weight')) lines.push(`**Weight:** ${num('weight')} kg`)
  if (v.clinical_context) lines.push(`**Clinical context:** ${v.clinical_context}`)
  lines.push(``)

  if (filmWarning) {
    lines.push(`> ⚠ **Film position flag:** Film position is "${str('film_type')}". Spinopelvic parameters derived from non-standing imaging are unreliable for clinical alignment assessment. All values below are reported with this limitation prominently noted.`)
    lines.push(``)
  }

  // ── Imaging Assessment ──
  lines.push(`### Imaging Assessment`)
  lines.push(``)
  if (!hasImage) {
    lines.push(`No imaging was uploaded. All measurements were entered manually by the clinician. This tool cannot verify that values were derived from appropriate imaging. Clinical correlation and confirmation of measurement source are mandatory before any report interpretation.`)
  } else {
    lines.push(`An image was uploaded for documentation and contextual review. **This application does not perform automated image analysis or pixel-based measurement extraction.** The image is provided for reference only and was assessed visually via the Claude vision model for gross quality and positioning concerns. All quantitative values were entered manually by the clinician.`)
  }
  if (module === 'muscle' && has('imaging_notes')) {
    lines.push(`Imaging notes provided: ${v.imaging_notes}.`)
  }
  lines.push(``)

  // ── Derived Calculations ──
  const derived = computeDerived(module, values)
  if (derived.length > 0) {
    lines.push(`### Derived Calculations`)
    lines.push(``)
    derived.forEach(d => lines.push(`- ${d}`))
    lines.push(``)
  }

  // ── Measurement Results ──
  lines.push(`### Measurement Results`)
  lines.push(``)

  if (module === 'muscle') {
    const sex = str('sex')
    const ht = num('height') / 100
    const ht2 = ht * ht

    // SMI
    if (has('height') && has('total_sma')) {
      const smi = num('total_sma') / ht2
      const interp = classifySMI(smi, sex)
      const refCutoff = sex === 'Male' ? `${CUTOFFS.smi_male_class1} (class I) / ${CUTOFFS.smi_male_class2} (class II)` : `${CUTOFFS.smi_female_class1} (class I) / ${CUTOFFS.smi_female_class2} (class II)`
      lines.push(`**Skeletal Muscle Index (SMI)**`)
      lines.push(`- Value: ${smi.toFixed(2)} cm²/m²`)
      lines.push(`- Method: Total L3 skeletal muscle area divided by height squared. Segmentation method and image source: manually entered by clinician.`)
      lines.push(`- Reference standard: Prado CM et al. 2008, Am J Clin Nutr. Sex-specific cutoff (${sex}): ${refCutoff} cm²/m²`)
      lines.push(`- Interpretation: **${interp.label}**`)
      lines.push(`- Clinical meaning: CT-defined low SMI at L3 has been independently associated with increased postoperative complications, prolonged LOS, and 90-day mortality in abdominal and spine surgery (Sheetz et al. 2020, JAMA Surgery; Tenny et al. 2023). Prehabilitation and nutrition consultation may be warranted.`)
      lines.push(`- ⚠ Limitations: (1) CT SMI is an imaging proxy for muscle quantity only. **Sarcopenia diagnosis requires muscle strength assessment (e.g., grip dynamometry) and/or physical performance (gait speed, SPPB) per EWGSOP2 — this tool cannot diagnose sarcopenia.** (2) Prado cutoffs derived from Canadian oncology cohort — generalizability to other populations uncertain. (3) Single time-point measurement; longitudinal change is more informative.`)
      lines.push(``)
    }

    // PMI
    if (has('height') && has('psoas_l') && has('psoas_r')) {
      const tot = num('psoas_l') + num('psoas_r')
      const pmi = tot / ht2
      const interp = classifyPMI(pmi, sex)
      const threshold = sex === 'Male' ? CUTOFFS.pmi_male : CUTOFFS.pmi_female
      lines.push(`**Psoas Muscle Index (PMI)**`)
      lines.push(`- Value: ${pmi.toFixed(2)} cm²/m² (bilateral psoas total: ${tot.toFixed(1)} cm²)`)
      lines.push(`- Method: Sum of bilateral psoas CSA at L3 divided by height squared. Segmentation: manually entered.`)
      lines.push(`- Reference standard: Derstine BA et al. 2018, Sci Rep (n=9,013 US CT cohort). Sex-specific cutoff (${sex}): <${threshold} cm²/m²`)
      lines.push(`- Interpretation: **${interp.label}**`)
      lines.push(`- Clinical meaning: Low PMI has been associated with frailty, increased surgical risk, and adverse outcomes in lumbar spine surgery. Psoas CSA at L3 is frequently used as a proxy for overall sarcopenic status in surgical planning literature.`)
      lines.push(`- ⚠ Limitations: Derstine cutoffs derived predominantly from a non-Hispanic white US population. Generalizability to other ethnic populations requires caution. PMI is not a standalone diagnostic criterion for sarcopenia.`)
      lines.push(``)
    }

    // Myosteatosis
    if (has('mean_hu')) {
      const bmi = has('weight') && has('height') ? num('weight') / ht2 : null
      const contrastFlagged = v.imaging_notes && /contrast|portal|arterial/i.test(v.imaging_notes)
      lines.push(`**Muscle Attenuation (Hounsfield Units) — Myosteatosis Proxy**`)
      lines.push(`- Value: ${num('mean_hu').toFixed(1)} HU (mean of entered muscle ROI)`)
      lines.push(`- Method: Mean HU of entered muscle compartment. This value was manually entered and cannot be verified against scanner calibration.`)
      if (bmi !== null) {
        const interp = classifyMyosteatosis(num('mean_hu'), bmi, sex)
        lines.push(`- Reference standard: Martin L et al. 2013, J Clin Oncol. BMI-stratified threshold (${sex}, BMI ${bmi.toFixed(1)} kg/m²): <${interp.threshold} HU = myosteatosis`)
        lines.push(`- Interpretation: **${interp.label}**`)
      } else {
        lines.push(`- Reference standard: Martin L et al. 2013, J Clin Oncol. BMI-stratified — weight not provided, so exact threshold cannot be determined.`)
        lines.push(`- Interpretation: **Cannot classify — weight required for BMI-stratified HU threshold**`)
      }
      lines.push(`- Clinical meaning: Myosteatosis (intramuscular fat infiltration) independently predicts postoperative complications and mortality beyond muscle mass alone (Martin et al. 2013; Stretch et al. 2019, J Surg Oncol).`)
      lines.push(`- ⚠ Limitations: (1) HU thresholds established on non-contrast CT with standard soft-tissue kernel only. ${contrastFlagged ? '**Contrast-enhanced CT was noted — these HU values are NOT directly comparable to Martin 2013 cutoffs.**' : 'If contrast-enhanced CT was used, values are not comparable to this reference.'} (2) HU varies by scanner model and reconstruction kernel. Without phantom calibration, cross-institutional comparison is unreliable. (3) No imaging was verified by this tool.`)
      lines.push(``)
    }
  }

  if (module === 'lumbar') {
    const isStanding = v.film_type === 'Standing'
    const posFlag = isStanding ? '' : ` ⚠ Non-standing film — value unreliable for clinical interpretation.`

    // Lumbar lordosis
    if (has('ll_cobb')) {
      const interp = classifyLL(num('ll_cobb'))
      lines.push(`**Lumbar Lordosis (L1–S1 Cobb)**`)
      lines.push(`- Value: ${num('ll_cobb')}°${posFlag}`)
      lines.push(`- Method: Cobb angle between superior endplate of L1 and superior endplate of S1. Measurement: manually entered by clinician.`)
      lines.push(`- Reference standard: Roussouly P et al. 2005, Spine. Normal population range: 40–60° (SD ±11–13°).`)
      lines.push(`- Interpretation: **${interp.label}**`)
      lines.push(`- Clinical meaning: Lumbar lordosis should be interpreted in the context of PI-LL mismatch, not in isolation. A lordosis of 47° may be appropriate for a patient with PI 50° but pathological for PI 70°. Do not label lordosis as abnormal without PI-LL context (Schwab 2012).`)
      lines.push(`- ⚠ Limitations: (1) Single Cobb measurement; inter-observer variability ±3–5°. (2) Lordosis changes with position — supine values underestimate standing lordosis. (3) Manual entry cannot be verified.`)
      lines.push(``)
    }

    // PI-LL
    if (has('pi') && has('ll_cobb')) {
      const mismatch = num('pi') - num('ll_cobb')
      const interp = classifyPILL(mismatch)
      lines.push(`**PI-LL Mismatch**`)
      lines.push(`- Value: ${mismatch > 0 ? '+' : ''}${mismatch.toFixed(1)}°${posFlag}`)
      lines.push(`- Method: PI minus lumbar lordosis (L1–S1 Cobb). Formula: ${num('pi')}° − ${num('ll_cobb')}° = ${mismatch.toFixed(1)}°`)
      lines.push(`- Reference standard: Schwab F et al. 2012, Spine (SRS-Schwab ASD Classification). Clinically significant: >10° (+); severe: >20° (++).`)
      lines.push(`- Interpretation: **${interp.label}** SRS-Schwab modifier: ${interp.modifier}`)
      lines.push(`- Clinical meaning: PI-LL mismatch is the most important sagittal alignment parameter for adult spinal deformity. Mismatch >10° is independently associated with increased ODI, worse VAS back pain, and higher revision rates (Schwab 2012). Pre-operative restoration of lordosis to within 10° of PI is a commonly cited surgical goal.`)
      lines.push(`- ⚠ Limitations: This calculation depends on accurate PI and LL measurements. Error propagation: if each measurement has ±3° error, mismatch may have ±6° error. Non-standing films make this calculation unreliable.`)
      lines.push(``)
    }

    // PT
    if (has('pt')) {
      const interp = classifyPT(num('pt'))
      lines.push(`**Pelvic Tilt (PT)**`)
      lines.push(`- Value: ${num('pt')}°${posFlag}`)
      lines.push(`- Method: Angle between vertical and line from femoral head axis to S1 endplate midpoint. Measurement: manually entered.`)
      lines.push(`- Reference standard: Schwab F et al. 2012, Spine. PT modifier (+): >20°; (++): >30°.`)
      lines.push(`- Interpretation: **${interp.label}** SRS-Schwab modifier: ${interp.modifier}`)
      lines.push(`- Clinical meaning: Elevated PT indicates pelvic retroversion — a compensatory mechanism for sagittal malalignment. Persistent PT >20° after surgical correction is associated with inferior patient-reported outcomes (Glassman et al. 2005, Spine).`)
      lines.push(`- ⚠ Limitations: PT is measured on standing lateral radiograph. Non-standing values are unreliable. Measurement error ±2–4°.`)
      lines.push(``)
    }

    // SVA
    if (has('sva')) {
      const interp = classifySVA(num('sva'))
      lines.push(`**Sagittal Vertical Axis (SVA)**`)
      lines.push(`- Value: ${num('sva')} mm${posFlag}`)
      lines.push(`- Method: Horizontal distance from C7 plumb line to posterior-superior corner of S1. Measurement: manually entered.`)
      lines.push(`- Reference standard: Schwab F et al. 2012, Spine. SVA modifier (+): >40 mm; (++): >95 mm.`)
      lines.push(`- Interpretation: **${interp.label}** SRS-Schwab modifier: ${interp.modifier}`)
      lines.push(`- Clinical meaning: SVA >40 mm is associated with pain and disability. SVA >95 mm represents severe positive sagittal imbalance requiring surgical consideration (Glassman et al. 2005).`)
      lines.push(`- ⚠ Limitations: Full-length standing scoliosis film required for accurate SVA. Measurement reflects global sagittal balance, not isolated lumbar pathology.`)
      lines.push(``)
    }

    // Spondylolisthesis
    if (has('spondylo_pct') && num('spondylo_pct') > 0) {
      const interp = classifySpondylo(num('spondylo_pct'))
      lines.push(`**Spondylolisthesis**`)
      lines.push(`- Value: ${num('spondylo_pct').toFixed(1)}% slip`)
      lines.push(`- Method: (Anterior displacement of superior vertebral body / AP diameter of inferior vertebral body) × 100. Meyerding classification.`)
      lines.push(`- Reference standard: Meyerding HW. 1932, Surg Gynecol Obstet. Grade I: <25%; II: 25–50%; III: 50–75%; IV: >75%.`)
      lines.push(`- Interpretation: **${interp.label}**`)
      lines.push(`- Clinical meaning: Grade III–IV spondylolisthesis is associated with increased neurological risk and typically represents high-grade instability. Grades I–II may be managed conservatively depending on symptoms and progression.`)
      lines.push(`- ⚠ Limitations: Slip % varies with patient positioning. Measurement accuracy depends on clear visualization of posterior vertebral cortices.`)
      lines.push(``)
    }

    // DHI
    if (has('disc_height') && v.disc_level && v.disc_level !== 'Not measured') {
      const interp = classifyDHI(num('disc_height'))
      lines.push(`**Disc Height Index (DHI) — ${v.disc_level}**`)
      lines.push(`- Value: ${num('disc_height').toFixed(3)}`)
      lines.push(`- Method: Mean disc height (anterior + middle + posterior) divided by AP diameter of adjacent superior vertebral body (Farfan method). Measurement: manually entered.`)
      lines.push(`- Reference standard: Frobin W et al. 1997, Clin Biomech. Normal range at L4–L5: 0.33–0.40. <0.20 = severe degeneration.`)
      lines.push(`- Interpretation: **${interp.label}**`)
      lines.push(`- Clinical meaning: DHI below 0.20 suggests Pfirrmann grade IV–V disc degeneration on MRI correlation (imperfect). Reduced DHI at the index level may indicate a motion segment that is a pain generator in the appropriate clinical context.`)
      lines.push(`- ⚠ Limitations: Frobin normative data primarily at L4–L5; values at other levels may differ. Radiographic disc height correlates imperfectly with MRI Pfirrmann grade. Measurement sensitive to X-ray beam angle.`)
      lines.push(``)
    }
  }

  if (module === 'cervical') {
    const isNeutral = v.film_position === 'Neutral'
    const posFlag = isNeutral ? '' : ` ⚠ Non-neutral position (${v.film_position}) — not comparable to normative data.`
    const methodLabel = v.method || 'Not specified'

    // C2-C7
    if (has('c2c7_cobb')) {
      const interp = classifyCervical(num('c2c7_cobb'))
      lines.push(`**Cervical Lordosis / Kyphosis (C2–C7)**`)
      lines.push(`- Value: ${num('c2c7_cobb')}° (lordosis positive, kyphosis negative)${posFlag}`)
      lines.push(`- Method: ${methodLabel}. ⚠ Cobb method and Harrison posterior tangent method are not interchangeable and will differ by 5–15° on the same image. Ensure method is consistent across serial measurements.`)
      lines.push(`- Reference standard: Oe S et al. 2019, Spine (age-stratified normative data). Normal range by Cobb method: approximately 10–40° lordosis in neutral.`)
      lines.push(`- Interpretation: **${interp.label}**`)
      lines.push(`- Clinical meaning: Cervical kyphosis (negative value) is associated with accelerated adjacent segment degeneration and myelopathy progression in the setting of DCM. Post-laminectomy kyphosis requires monitoring. Loss of lordosis <10° in a myelopathic patient warrants clinical attention.`)
      lines.push(`- ⚠ Limitations: (1) Normal range has wide SD (±10°) in the general population. (2) Measurement method not standardized across studies — specify method in all serial comparisons. (3) Cervical lordosis varies substantially with head and neck positioning.`)
      lines.push(``)
    }

    // C2-C7 SVA
    if (has('c2c7_sva')) {
      lines.push(`**C2–C7 Sagittal Vertical Axis (C2–C7 SVA)**`)
      lines.push(`- Value: ${num('c2c7_sva')} mm`)
      lines.push(`- Method: Horizontal distance from C2 plumb line to C7 posterior-superior endplate corner. Measurement: manually entered.`)
      lines.push(`- Reference standard: Tang JA et al. 2012, J Neurosurg Spine. C2–C7 SVA >40 mm associated with increased disability and pain.`)
      lines.push(`- Interpretation: **${num('c2c7_sva') > 40 ? 'Elevated C2–C7 SVA — associated with increased disability' : 'Within acceptable range'}**`)
      lines.push(`- ⚠ Limitations: Requires standing lateral radiograph with full C2–C7 visualization. Varies with head position.`)
      lines.push(``)
    }

    // T1 slope
    if (has('t1_slope')) {
      const mismatch = has('c2c7_cobb') ? num('t1_slope') - num('c2c7_cobb') : null
      lines.push(`**T1 Slope**`)
      lines.push(`- Value: ${num('t1_slope')}°`)
      lines.push(`- Method: Angle between T1 superior endplate and horizontal. Measurement: manually entered.`)
      lines.push(`- Reference standard: Lee SH et al. 2012, Spine. T1 slope >40° associated with cervical sagittal imbalance.`)
      lines.push(`- Interpretation: **${num('t1_slope') > 40 ? 'Elevated T1 slope (>40°)' : 'Within expected range'}**`)
      if (mismatch !== null) {
        lines.push(`- T1 slope − CL mismatch: ${mismatch.toFixed(1)}° ${mismatch > 17 ? '⚠ Mismatch >17° associated with cervical sagittal imbalance (Hyun et al. 2016)' : ''}`)
      }
      lines.push(`- ⚠ Limitations: T1 slope requires visualization of T1 superior endplate, which may be obscured by the shoulder girdle. Measurement sensitivity ±3–5°.`)
      lines.push(``)
    }

    // Canal diameter
    if (has('mcl')) {
      const interp = classifyCanal(num('mcl'))
      lines.push(`**Canal AP Diameter (at index level)**`)
      lines.push(`- Value: ${num('mcl')} mm`)
      lines.push(`- Method: AP diameter of spinal canal at index level. Measurement: manually entered. This is a gross proxy — formal stenosis grading requires radiologist interpretation using Schizas or Lee classification on MRI.`)
      lines.push(`- Reference standard: Hayashi H et al. 1995. <10 mm = absolute stenosis; 10–12 mm = relative stenosis.`)
      lines.push(`- Interpretation: **${interp.label}**`)
      lines.push(`- ⚠ Limitations: AP diameter is a single linear measure. Canal shape, foraminal stenosis, and dynamic compression require cross-sectional area assessment (MRI axial T2). This measurement does NOT replace formal stenosis grading.`)
      lines.push(``)
    }
  }

  if (module === 'pelvic') {
    const isStanding = v.film_type === 'Standing'
    const posFlag = isStanding ? '' : ` ⚠ Non-standing film — pelvic parameters unreliable.`
    const headFlag = v.both_heads === 'No — midpoint estimated' ? ' (both femoral heads not fully visible — midpoint estimated, ±3–5° error)' : ''

    // PI
    if (has('pi')) {
      lines.push(`**Pelvic Incidence (PI)**`)
      lines.push(`- Value: ${num('pi')}°${posFlag}${headFlag}`)
      lines.push(`- Method: Angle between perpendicular to S1 superior endplate and line from S1 midpoint to femoral head axis center. Measurement: manually entered.`)
      lines.push(`- Reference standard: Legaye J et al. 1998, Eur Spine J. PI is a fixed morphological parameter — does not change with position in adults. Normal population range: approximately 40–65° (wide inter-individual variation).`)
      lines.push(`- Interpretation: **PI ${num('pi')}° — fixed morphological parameter. Target LL = PI ±9° (Schwab 2012).**`)
      lines.push(`- Clinical meaning: PI determines the required lumbar lordosis. Patients with high PI require more lordosis to maintain sagittal balance. PI should anchor all surgical lordosis planning.`)
      lines.push(`- ⚠ Limitations: Measurement error ±3–5° (Tyrakowski et al. 2014, Eur Spine J). True lateral radiograph required — even minor rotation introduces error. PI appears stable through adulthood but may increase with sacropelvic remodeling in elderly.`)
      lines.push(``)
    }

    // PT
    if (has('pt')) {
      const interp = classifyPT(num('pt'))
      lines.push(`**Pelvic Tilt (PT)**`)
      lines.push(`- Value: ${num('pt')}°${posFlag}`)
      lines.push(`- Method: Angle between vertical and line from femoral head axis center to S1 superior endplate midpoint. Measurement: manually entered.`)
      lines.push(`- Reference standard: Schwab F et al. 2012, Spine. PT modifier (+): >20°; (++): >30°.`)
      lines.push(`- Interpretation: **${interp.label}** SRS-Schwab modifier: ${interp.modifier}`)
      lines.push(`- Clinical meaning: PT reflects pelvic retroversion as a compensatory sagittal balance mechanism. Elevated PT in a balanced patient indicates significant compensatory effort.`)
      lines.push(`- ⚠ Limitations: Position-dependent. Only valid on standing lateral radiograph.`)
      lines.push(``)
    }

    // SS
    if (has('ss')) {
      lines.push(`**Sacral Slope (SS)**`)
      lines.push(`- Value: ${num('ss')}°${posFlag}`)
      lines.push(`- Method: Angle between S1 superior endplate and horizontal. Measurement: manually entered.`)
      lines.push(`- Reference standard: Legaye J et al. 1998. SS = PI − PT (geometric relationship). Normal range: 30–50° in standing.`)
      lines.push(`- Interpretation: **${num('ss') < 20 ? 'Low sacral slope — suggests pelvic retroversion' : num('ss') > 55 ? 'High sacral slope — suggests anterior pelvic tilt' : 'Sacral slope within expected range'}**`)
      lines.push(`- ⚠ Limitations: Position-dependent.`)
      lines.push(``)
    }

    // Geometric consistency
    if (has('pi') && has('pt') && has('ss')) {
      const diff = num('pi') - num('pt') - num('ss')
      const absDiff = Math.abs(diff)
      lines.push(`**Geometric Consistency Check (PI = PT + SS)**`)
      lines.push(`- Calculated: ${num('pi')}° − ${num('pt')}° − ${num('ss')}° = ${diff.toFixed(1)}°`)
      lines.push(`- Tolerance: ±4°`)
      lines.push(`- Result: **${absDiff <= 4 ? '✓ Consistent — values are internally valid' : `⚠ INCONSISTENCY DETECTED — difference of ${absDiff.toFixed(1)}° exceeds ±4° tolerance. Verify all three measurements before using in clinical decision-making.`}**`)
      lines.push(``)
    }
  }

  // ── Consistency Check ──
  lines.push(`### Consistency Check`)
  lines.push(``)
  const consistencyIssues = []

  if ((module === 'lumbar' || module === 'pelvic') && has('pi') && has('pt') && has('ss')) {
    const diff = Math.abs(num('pi') - num('pt') - num('ss'))
    if (diff > 4) consistencyIssues.push(`PI ≠ PT + SS: difference of ${diff.toFixed(1)}° — exceeds ±4° tolerance.`)
  }
  if (['lumbar', 'pelvic'].includes(module) && v.film_type && v.film_type !== 'Standing') {
    consistencyIssues.push(`Film position is "${v.film_type}" — spinopelvic parameters not suitable for clinical alignment assessment.`)
  }
  if (module === 'muscle' && has('height') && has('psoas_l') && has('psoas_r') && has('total_sma')) {
    const psoas_tot = num('psoas_l') + num('psoas_r')
    if (psoas_tot > num('total_sma')) {
      consistencyIssues.push(`Psoas total (${psoas_tot.toFixed(1)} cm²) exceeds total SMA (${num('total_sma')} cm²) — this is anatomically impossible. Verify values.`)
    }
  }
  if (module === 'cervical' && has('c2c7_cobb') && has('t1_slope')) {
    const mismatch = num('t1_slope') - num('c2c7_cobb')
    if (mismatch > 17) consistencyIssues.push(`T1 slope − CL mismatch = ${mismatch.toFixed(1)}° (>17° threshold, Hyun et al. 2016) — suggests cervical sagittal imbalance.`)
  }

  if (consistencyIssues.length === 0) {
    lines.push(`No critical consistency issues detected. Standard measurement caveats apply.`)
  } else {
    consistencyIssues.forEach(i => lines.push(`- ⚠ ${i}`))
  }
  lines.push(``)

  // ── Summary Classification ──
  lines.push(`### Summary Classification`)
  lines.push(``)
  lines.push(generateSummary(module, values))
  lines.push(``)

  // ── Limitations ──
  lines.push(`### Known Limitations of This Report`)
  lines.push(``)
  lines.push(`- All measurements were entered manually by the clinician. This tool does not perform automated image analysis, pixel-based measurement, or DICOM parsing. Values cannot be verified against the source imaging.`)
  lines.push(`- The image upload feature (if used) provides documentation only. No automated quantification was performed on the uploaded image.`)
  lines.push(`- This report was generated by a deterministic rule-based engine using validated published cutoffs. It does not account for clinical nuances, comorbidities, or patient-specific factors not captured in the input fields.`)
  lines.push(`- All cutoffs are derived from the referenced study populations and may not generalize to all clinical contexts.`)
  lines.push(`- Measurement error for manual radiographic techniques is approximately ±3–5° for angular measurements and ±5–10% for area measurements.`)
  lines.push(``)

  lines.push(`### Mandatory Disclaimer`)
  lines.push(``)
  lines.push(`This report was generated by SpineMetrics v2.0 for research and clinical decision-support purposes only. It does not constitute a medical diagnosis or treatment recommendation. All outputs must be reviewed and validated by a licensed physician or qualified healthcare professional before clinical use. CT-based muscle measurements are imaging proxies for muscle quantity only — **sarcopenia diagnosis requires assessment of muscle strength (grip dynamometry) and/or physical performance (gait speed, SPPB, chair stand) per EWGSOP2** (Cruz-Jentoft AJ et al., Age Ageing, 2019;48:16–31). This tool is not FDA-cleared and is not a regulated medical device.`)

  return lines.join('\n')
}

// ─── Summary paragraph generator ─────────────────────────────────────────────

function generateSummary(module, values) {
  const num = (key) => parseFloat(values[key])
  const has = (key) => values[key] !== undefined && values[key] !== '' && !isNaN(parseFloat(values[key]))
  const v = values

  if (module === 'muscle') {
    const sex = v.sex || 'unknown sex'
    const ht = num('height') / 100
    const ht2 = ht * ht
    const parts = []

    if (has('height') && has('total_sma')) {
      const smi = num('total_sma') / ht2
      const interp = classifySMI(smi, v.sex)
      parts.push(`SMI is ${smi.toFixed(2)} cm²/m² — ${interp.label}`)
    }
    if (has('height') && has('psoas_l') && has('psoas_r')) {
      const pmi = (num('psoas_l') + num('psoas_r')) / ht2
      const interp = classifyPMI(pmi, v.sex)
      parts.push(`PMI is ${pmi.toFixed(2)} cm²/m² — ${interp.label}`)
    }
    if (parts.length === 0) return 'Insufficient data for summary classification.'
    return `This ${sex} patient has the following imaging-based body composition profile: ${parts.join('; ')}. These findings represent CT-based imaging proxies for muscle quantity and do NOT constitute a diagnosis of sarcopenia. Sarcopenia diagnosis requires muscle strength and/or physical performance data (EWGSOP2). Clinical correlation, nutritional assessment, and prehabilitation evaluation are recommended if operative intervention is planned.`
  }

  if (module === 'lumbar') {
    const modifiers = []
    if (has('pi') && has('ll_cobb')) {
      const m = num('pi') - num('ll_cobb')
      modifiers.push(classifyPILL(m).modifier !== '0' ? `PI-LL ${classifyPILL(m).modifier}` : 'PI-LL 0')
    }
    if (has('pt')) modifiers.push(`PT ${classifyPT(num('pt')).modifier}`)
    if (has('sva')) modifiers.push(`SVA ${classifySVA(num('sva')).modifier}`)

    const srsLabel = modifiers.length > 0 ? `SRS-Schwab modifiers: ${modifiers.join(', ')}.` : ''
    const nonStanding = v.film_type !== 'Standing' ? ' ⚠ Note: non-standing film — all spinopelvic values unreliable for alignment assessment.' : ''
    return `Lumbar alignment summary: ${srsLabel} ${nonStanding} These values characterize the patient's sagittal alignment profile based on manually entered radiographic measurements. Interpretation must be integrated with clinical symptoms, neurological status, and surgical planning context. No treatment recommendation is implied.`
  }

  if (module === 'cervical') {
    if (!has('c2c7_cobb')) return 'Insufficient data for summary classification.'
    const interp = classifyCervical(num('c2c7_cobb'))
    return `Cervical alignment: C2–C7 angle of ${num('c2c7_cobb')}° by ${v.method || 'unspecified method'} is classified as ${interp.label}. This measurement reflects static alignment in the ${v.film_position || 'unknown'} position. Cervical alignment should be interpreted in the context of symptoms, myelopathy status, and planned surgical approach. No treatment recommendation is implied.`
  }

  if (module === 'pelvic') {
    if (!has('pi')) return 'Insufficient data for summary classification.'
    const ptInterp = has('pt') ? classifyPT(num('pt')) : null
    const piLLNote = has('pt') ? `Pelvic tilt is ${num('pt')}° (${ptInterp.label}).` : ''
    const nonStanding = v.film_type !== 'Standing' ? ' ⚠ Non-standing film — pelvic parameters unreliable.' : ''
    return `Pelvic morphology: PI = ${num('pi')}° (fixed morphological parameter). ${piLLNote} PI anchors the surgical correction target for lumbar lordosis (target LL = PI ±9°, Schwab 2012). ${nonStanding} No treatment recommendation is implied.`
  }

  return 'Summary not available for this module.'
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function moduleName(module) {
  const map = {
    muscle: 'Muscle / Body Composition',
    lumbar: 'Lumbar Alignment',
    cervical: 'Cervical Alignment',
    pelvic: 'Pelvic Parameters',
  }
  return map[module] || module
}
