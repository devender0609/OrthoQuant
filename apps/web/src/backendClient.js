/**
 * SpineMetrics — Backend API Client
 *
 * All analysis calls go to the FastAPI backend.
 * VITE_BACKEND_URL defaults to http://localhost:8000 in dev.
 * In production (Railway, Fly, etc.) set VITE_BACKEND_URL to your backend URL.
 *
 * Response shape (v6):
 *   {
 *     module, status, version, image_quality,
 *     real_count, total_fields,
 *     fields: {
 *       field_name: { status, value, unit, confidence, note, tier, overlay }
 *     },
 *     measurements: { field_name: value },   // flat
 *     landmarks: { ... },
 *     warnings, errors, processing_notes,
 *     overlay_available
 *   }
 */

// In dev, Vite proxies /analyze and /status to localhost:8000 — no BASE needed.
// In production, set VITE_BACKEND_URL to your deployed backend URL.
const BASE = import.meta.env.VITE_BACKEND_URL || ''

export class ApiError extends Error {
  constructor(status, message) {
    super(message); this.status = status; this.name = 'ApiError'
  }
}

async function postImage(path, file) {
  const form = new FormData()
  form.append('image', file)
  const res = await fetch(`${BASE}${path}`, { method: 'POST', body: form })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new ApiError(res.status, err.detail || err.error || 'Backend error')
  }
  return res.json()
}

export async function getBackendStatus() {
  const res = await fetch(`${BASE}/status`)
  if (!res.ok) throw new ApiError(res.status, 'Backend unreachable')
  return res.json()
}

// Primary real endpoint
export const analyzeLumbarPelvic = (f) => postImage('/analyze/lumbar-pelvic', f)

// Legacy module routing (for UI compatibility)
export async function analyzeModule(moduleId, file) {
  switch (moduleId) {
    case 'lumbar':
    case 'pelvic':
      return analyzeLumbarPelvic(file)
    case 'cervical':
      return postImage('/analyze/cervical', file)
    case 'muscle':
      return postImage('/analyze/muscle', file)
    default:
      throw new Error(`Unknown module: ${moduleId}`)
  }
}

// ─── Field mapping: backend key → frontend form field id ─────────────────────
const FIELD_MAP = {
  lumbar: {
    lumbar_lordosis_cobb:  'll_cobb',
    sacral_slope:          'ss',
    pelvic_tilt:           'pt',
    pelvic_incidence:      'pi',
    pi_ll_mismatch:        null,         // derived — shown but not a form input
    spondylolisthesis_pct: 'spondylo_pct',
    disc_height_index:     'disc_height',
  },
  pelvic: {
    pelvic_incidence: 'pi',
    pelvic_tilt:      'pt',
    sacral_slope:     'ss',
  },
  cervical: {
    c2c7_cobb:    'c2c7_cobb',
    t1_slope:     't1_slope',
    c2c7_sva:     'c2c7_sva',
    canal_ap_mm:  'mcl',
  },
  muscle: {
    psoas_csa_left:  'psoas_l',
    psoas_csa_right: 'psoas_r',
    total_sma:       'total_sma',
    mean_hu:         'mean_hu',
  },
}

const REAL_STATUSES = new Set(['available_real', 'available_low_confidence'])

/**
 * Parse backend response into form-ready data.
 * Only real measurements (available_real / available_low_confidence) fill form values.
 * All other fields get their status/note for display but no auto-filled value.
 */
export function responseToFormValues(moduleId, apiResponse) {
  const map = FIELD_MAP[moduleId] || FIELD_MAP.lumbar
  const fields = apiResponse.fields || {}

  const formValues    = {}
  const fieldStatuses = {}
  const fieldNotes    = {}
  const fieldConfs    = {}
  const overlays      = {}

  Object.entries(map).forEach(([backendKey, formFieldId]) => {
    if (!formFieldId) return
    const d = fields[backendKey]
    if (!d) return

    fieldStatuses[formFieldId] = d.status
    if (d.note)       fieldNotes[formFieldId]  = d.note
    if (d.confidence != null) fieldConfs[formFieldId] = d.confidence
    if (d.overlay)    overlays[formFieldId]    = d.overlay

    // Only auto-fill real values
    if (REAL_STATUSES.has(d.status) && d.value != null) {
      formValues[formFieldId] = String(d.value)
    }
  })

  return { formValues, fieldStatuses, fieldNotes, fieldConfs, overlays }
}
