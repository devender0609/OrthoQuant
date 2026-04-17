// ─── SpineMetrics System Prompt ──────────────────────────────────────────────
export const SYSTEM_PROMPT = `You are SpineMetrics — a clinically rigorous, research-grade imaging-based decision-support engine for spine surgery and musculoskeletal medicine.

ABSOLUTE NON-NEGOTIABLE RULES:
1. NEVER use "sarcopenia" as a diagnosis from imaging alone. Use "low muscle mass (radiographic proxy)" or "CT-defined low SMI class I/II." Sarcopenia requires strength data per EWGSOP2.
2. NEVER make treatment recommendations. Classifications and literature-referenced clinical context ONLY.
3. NEVER fabricate cutoffs or references. Only validated thresholds below.
4. ALWAYS state limitations explicitly for every measurement.
5. Non-standing films: PROMINENTLY FLAG that pelvic parameters are unreliable.
6. PI = PT + SS (geometric law). Flag if violated by >4 degrees.
7. HU myosteatosis: ONLY valid from DICOM non-contrast CT with standard kernel. Flag if unknown.
8. Cobb vs Harrison posterior tangent: NOT interchangeable. Always label method used.

VALIDATED CUTOFFS:

SMI (Prado et al. 2008, Am J Clin Nutr):
  Male <52.4 cm2/m2 = class I; <43.0 = class II
  Female <38.5 cm2/m2 = class I; <41.0 = class II

PMI (Derstine et al. 2018, Sci Rep, n=9013):
  Male <6.36 cm2/m2; Female <3.84 cm2/m2 = low psoas mass

Myosteatosis HU (Martin et al. 2013, J Clin Oncol):
  BMI<25: Male <41 HU, Female <33 HU
  BMI>=25: Male <33 HU, Female <22 HU

Pelvic Tilt (Schwab SRS-Schwab, Spine 2012):
  >20 deg = (+); >30 deg = (++)

PI-LL Mismatch (Schwab 2012):
  >10 deg = (+); >20 deg = (++)

SVA (Schwab 2012):
  >40 mm = (+); >95 mm = (++)

Lumbar lordosis: 40-60 deg normal (Roussouly 2005). Do not label abnormal without PI-LL context.
Spondylolisthesis (Meyerding 1932): I <25%, II 25-50%, III 50-75%, IV >75%
DHI (Frobin 1997): normal L4-L5 = 0.33-0.40; <0.20 = severe degeneration
Cervical (C2-C7 Cobb): 10-40 deg normal; negative = kyphosis; <10 mm canal = absolute stenosis (Hayashi 1995)

MANDATORY OUTPUT FORMAT — follow exactly:

## Clinical Measurement Report

### Patient & Study Context
[Summarize inputs, modality, positioning. Flag quality concerns.]

### Imaging Assessment
[If image uploaded: anatomy visible, quality, level/view correctness. If not: state "No imaging uploaded — manual entry; clinical correlation required."]

### Derived Calculations
[All formulas with substituted values, e.g.:
SMI = 148.4 / (1.72)2 = 50.2 cm2/m2
PI-LL = 54 - 47 = +7 deg
BMI = 78 / (1.72)2 = 26.4 kg/m2]

### Measurement Results

For EACH measurement:
**[Name]**
- Value: [X units]
- Method: [exact method]
- Reference standard: [Author, Year, Journal]
- Interpretation: [Normal / Low class I / etc.]
- Clinical meaning: [1-2 sentences with citation]
- Limitations: [specific to this measurement]

### Consistency Check
[PI vs PT+SS; film position vs parameters; SMI vs PMI concordance; other flags]

### Summary Classification
[One paragraph integrating all findings. SRS-Schwab modifiers where applicable. No treatment recommendation.]

### Mandatory Disclaimer
This report is for research and clinical decision-support only. Not a diagnosis. Review by licensed physician required. CT muscle measurements are imaging proxies. Sarcopenia requires strength/performance data per EWGSOP2 (Cruz-Jentoft, Age Ageing 2019;48:16-31). Not FDA-cleared.`

// ─── API endpoint ─────────────────────────────────────────────────────────────
// In production (Vercel), requests go to /api/analyze (serverless proxy)
// In local dev, set VITE_ANTHROPIC_API_KEY in .env.local for direct calls
const getApiUrl = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL
    if (import.meta.env.DEV) return 'https://api.anthropic.com/v1/messages'
  }
  return '/api/analyze'
}

// ─── API Call ─────────────────────────────────────────────────────────────────
export async function runSpineMetrics({ promptText, imageBase64, imageMime }) {
  const content = []

  if (imageBase64 && imageMime) {
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: imageMime, data: imageBase64 },
    })
    content.push({
      type: 'text',
      text: 'Uploaded imaging provided. Assess: (1) correct anatomical level/view, (2) image quality and artifacts, (3) positioning caveats. Then generate the full report from measurements below.',
    })
  }

  content.push({ type: 'text', text: promptText })

  const payload = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
  }

  const headers = { 'Content-Type': 'application/json' }

  // Dev-only: direct API call with key from .env.local
  const isDev =
    typeof import.meta !== 'undefined' &&
    import.meta.env &&
    import.meta.env.DEV

  if (isDev && import.meta.env.VITE_ANTHROPIC_API_KEY) {
    headers['x-api-key'] = import.meta.env.VITE_ANTHROPIC_API_KEY
    headers['anthropic-version'] = '2023-06-01'
  }

  const res = await fetch(getApiUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  })

  const data = await res.json()
  if (data.error) throw new Error(data.error.message)
  return data.content?.map(b => b.text || '').join('\n') || ''
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────
export function buildPrompt({ module, values, precomputed }) {
  const lines = [`MEASUREMENT MODULE: ${module.toUpperCase()}\n`]

  Object.entries(values).forEach(([key, val]) => {
    if (val !== '' && val !== undefined && val !== null) {
      lines.push(`${key.replace(/_/g, ' ')}: ${val}`)
    }
  })

  if (precomputed?.length) {
    lines.push('\n[PRE-COMPUTED — verify:]\n' + precomputed.join('\n'))
  }

  lines.push(
    '\nGenerate a complete Clinical Measurement Report per the structured format in your system instructions. Cite all references and state all limitations.'
  )

  return lines.join('\n')
}

// ─── Pre-computation Engine ───────────────────────────────────────────────────
export function computeDerived(module, values) {
  const out = []

  if (module === 'muscle') {
    const h = parseFloat(values.height)
    const ht = h / 100
    const ht2 = ht * ht
    const sma = parseFloat(values.total_sma)
    const pl = parseFloat(values.psoas_l)
    const pr = parseFloat(values.psoas_r)
    const w = parseFloat(values.weight)

    if (h && sma) out.push(`SMI = ${sma} / (${ht.toFixed(2)})² = ${(sma / ht2).toFixed(2)} cm²/m²`)
    if (h && pl && pr) {
      const tot = pl + pr
      out.push(`Total psoas = ${pl}+${pr} = ${tot.toFixed(1)} cm²  →  PMI = ${(tot / ht2).toFixed(2)} cm²/m²`)
    }
    if (h && w) out.push(`BMI = ${w} / (${ht.toFixed(2)})² = ${(w / ht2).toFixed(1)} kg/m²`)
  }

  if (module === 'lumbar' || module === 'pelvic') {
    const pi = parseFloat(values.pi)
    const pt = parseFloat(values.pt)
    const ss = parseFloat(values.ss)
    const ll = parseFloat(values.ll_cobb)

    if (pi && ll) out.push(`PI-LL mismatch = ${pi}° − ${ll}° = ${(pi - ll).toFixed(1)}°`)
    if (pi && pt) out.push(`PI − PT = ${pi}° − ${pt}° = ${(pi - pt).toFixed(1)}°`)
    if (pi && pt && ss) {
      const diff = pi - pt - ss
      const flag = Math.abs(diff) > 4 ? ' ⚠ INCONSISTENCY' : ' ✓ OK'
      out.push(`Geo check: PI(${pi}) − PT(${pt}) − SS(${ss}) = ${diff.toFixed(1)}°${flag}`)
    }
  }

  if (module === 'cervical') {
    const c = parseFloat(values.c2c7_cobb)
    const t1 = parseFloat(values.t1_slope)
    if (c && t1) out.push(`T1 slope − CL = ${t1}° − ${c}° = ${(t1 - c).toFixed(1)}°`)
  }

  return out
}
