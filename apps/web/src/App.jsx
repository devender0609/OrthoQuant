import { useState, useRef, useCallback, useEffect } from 'react'
import './index.css'
import { MODULES, FIELDS } from './constants.js'
import { renderMarkdown } from './markdown.js'
import {
  validateFields, getClinicalWarnings,
  computeDerived, generateDeterministicReport,
} from './clinicalEngine.js'
import {
  analyzeModule, responseToFormValues,
  getBackendStatus, ApiError,
} from './backendClient.js'
import { enhanceReportWithLLM } from './api.js'
import MeasurementField from './components/MeasurementField.jsx'
import RoadmapPanel from './components/RoadmapPanel.jsx'

// ─── Backend banner ───────────────────────────────────────────────────────────
function BackendBanner({ status, error }) {
  if (error) return (
    <div className="backend-banner backend-offline">
      <span className="backend-dot offline" />
      <span>
        Backend offline — start with:{' '}
        <code>uvicorn apps.api.main:app --reload --port 8000</code>
      </span>
    </div>
  )
  if (!status) return null
  const lp = status.modules?.lumbar_pelvic
  return (
    <div className={`backend-banner ${lp?.status === 'available' ? 'backend-live' : 'backend-mock'}`}>
      <span className={`backend-dot ${lp?.status === 'available' ? 'live' : 'mock'}`} />
      <span>
        Backend v{status.version} · inference: <strong>{status.inference_backend}</strong>
        {lp?.status === 'available'
          ? ' · lumbar/pelvic CV pipeline ready'
          : ' · degraded (OpenCV not installed?)'}
      </span>
    </div>
  )
}

// ─── Upload + analyze zone ────────────────────────────────────────────────────
function AnalyzeZone({ moduleId, modStatus, file, processing, onFile }) {
  const [drag, setDrag] = useState(false)
  const isReal = modStatus === 'available'

  const onDrop = useCallback(e => {
    e.preventDefault(); setDrag(false)
    const f = e.dataTransfer.files[0]; if (f) onFile(f)
  }, [onFile])

  return (
    <div
      className={`analyze-zone${drag ? ' drag' : ''}${processing ? ' processing' : ''}`}
      onDragOver={e => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={onDrop}
    >
      <input type="file" accept="image/jpeg,image/png,image/webp"
        onChange={e => e.target.files[0] && onFile(e.target.files[0])}
        disabled={processing} />
      {processing ? (
        <div className="analyze-processing">
          <div className="analyze-spinner" />
          <div className="analyze-processing-label">Backend CV analysis running…</div>
          <div className="analyze-processing-sub">Landmark detection → geometric measurement</div>
        </div>
      ) : !file ? (
        <>
          <div className="analyze-icon">{isReal ? '📡' : '📂'}</div>
          <div className="analyze-text">
            {isReal
              ? 'Upload standing lateral radiograph → backend analysis → auto-fill measurements'
              : 'Upload for documentation — this module requires manual measurement entry'}
          </div>
          <div className="analyze-sub">JPEG · PNG · WEBP</div>
        </>
      ) : (
        <div className="analyze-file-loaded">
          <span className="analyze-file-name">📄 {file.name}</span>
          <span className="analyze-file-size">({(file.size/1024).toFixed(0)} KB)</span>
        </div>
      )}
    </div>
  )
}

// ─── Analysis result summary ──────────────────────────────────────────────────
function AnalysisSummary({ result, onDismiss }) {
  if (!result) return null
  const realCount = result.real_count || 0
  const total = result.total_fields || 0
  const failed = result.status === 'failed'

  return (
    <div className={`cv-summary ${failed ? 'cv-sum-error' : realCount > 0 ? 'cv-sum-real' : 'cv-sum-unavail'}`}>
      <div className="cv-sum-header">
        <span className="cv-sum-title">
          {failed
            ? `Analysis failed — ${result.errors?.[0] || 'unknown error'}`
            : `Analysis: ${realCount}/${total} measurements extracted · image quality: ${result.image_quality || 'unknown'}`}
        </span>
        <button className="cv-result-dismiss" onClick={onDismiss}>✕</button>
      </div>
      {result.warnings?.map((w, i) => (
        <div key={i} className="cv-sum-warning">{w}</div>
      ))}
      {result.processing_notes && (
        <details className="cv-sum-details">
          <summary>Processing notes ({result.processing_notes.length})</summary>
          <ul>{result.processing_notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
        </details>
      )}
    </div>
  )
}

// ─── Warning box ─────────────────────────────────────────────────────────────
function WarningBox({ warnings }) {
  if (!warnings?.length) return null
  return <>{warnings.map((w, i) => (
    <div className="warning-box" key={i}>
      <span className="warning-box-label">⚠ Clinical Flag</span>{w}
    </div>
  ))}</>
}

// ─── Pre-computed banner ──────────────────────────────────────────────────────
function PrecomputedBanner({ module, values, accentColor }) {
  const derived = computeDerived(module, values)
  if (!derived.length) return null
  return (
    <div className="precomputed">
      <span className="precomputed-label" style={{ color: accentColor }}>Derived ·</span>
      {derived.map((d, i) => <span className="precomputed-value" key={i}>{d}</span>)}
    </div>
  )
}

// ─── Report ───────────────────────────────────────────────────────────────────
function Report({ report, moduleName, moduleColor, isEnhanced }) {
  return (
    <div className="report">
      <div className="report-header">
        <div className="report-title">Clinical Measurement Report</div>
        <div className="report-meta">
          <span className="report-module" style={{ background: moduleColor }}>{moduleName}</span>
          <span className="report-ts">{new Date().toLocaleString()}</span>
          <span className={`report-source-badge ${isEnhanced ? 'badge-enhanced' : 'badge-deterministic'}`}>
            {isEnhanced ? '✦ LLM prose' : '⊙ Deterministic'}
          </span>
        </div>
      </div>
      <div className="report-body" dangerouslySetInnerHTML={{ __html: renderMarkdown(report) }} />
      <div className="disclaimer-box">
        <span className="disclaimer-label">⚠ Mandatory Disclaimer</span>
        SpineMetrics v6 — Research use only. Backend CV measurements are heuristic estimates
        from Hough line/circle detection. Verify all values against manual reading before
        clinical use. Fields labeled "not yet implemented" require manual entry.
        Sarcopenia requires strength/performance data beyond imaging
        (EWGSOP2, Cruz-Jentoft AJ et al., Age Ageing 2019;48:16–31). Not FDA-cleared.
      </div>
      <div className="report-actions">
        <button className="btn-outline" onClick={() => navigator.clipboard.writeText(report)}>Copy</button>
        <button className="btn-outline" onClick={() => window.print()}>Print / PDF</button>
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [selectedModule, setSelectedModule] = useState(null)
  const [values, setValues]               = useState({})
  const [fieldStatuses, setFieldStatuses] = useState({})
  const [fieldNotes, setFieldNotes]       = useState({})
  const [fieldConfs, setFieldConfs]       = useState({})
  const [file, setFile]                   = useState(null)
  const [imgB64, setImgB64]               = useState(null)
  const [imgMime, setImgMime]             = useState(null)
  const [processing, setProcessing]       = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [loading, setLoading]             = useState(false)
  const [loadingStage, setLoadingStage]   = useState('')
  const [report, setReport]               = useState(null)
  const [isEnhanced, setIsEnhanced]       = useState(false)
  const [error, setError]                 = useState(null)
  const [fieldErrors, setFieldErrors]     = useState({})
  const [backendStatus, setBackendStatus] = useState(null)
  const [backendError, setBackendError]   = useState(false)

  const reportRef = useRef(null)

  useEffect(() => {
    getBackendStatus()
      .then(s => { setBackendStatus(s); setBackendError(false) })
      .catch(() => setBackendError(true))
  }, [])

  const moduleStatus = (id) => backendStatus?.modules?.[id]?.status

  const handleModuleSelect = (id) => {
    setSelectedModule(id); setValues({}); setFieldStatuses({})
    setFieldNotes({}); setFieldConfs({}); setAnalysisResult(null)
    setReport(null); setError(null); setFieldErrors({})
    setIsEnhanced(false); clearFile()
  }

  const handleField = (id, val) => {
    setValues(v => ({ ...v, [id]: val }))
    if (['available_real','available_low_confidence'].includes(fieldStatuses[id])) {
      setFieldStatuses(s => ({ ...s, [id]: 'manual' }))
    }
    if (fieldErrors[id]) setFieldErrors(e => { const n={...e}; delete n[id]; return n })
  }

  const handleFile = useCallback(async (f) => {
    const allowed = ['image/jpeg','image/png','image/webp']
    if (!allowed.includes(f.type)) { setError('Use JPEG, PNG, or WEBP.'); return }
    setError(null); setFile(f); setAnalysisResult(null)
    const reader = new FileReader()
    reader.onload = e => { setImgB64(e.target.result.split(',')[1]); setImgMime(f.type) }
    reader.readAsDataURL(f)
    if (selectedModule) await runAnalysis(f)
  }, [selectedModule])

  const clearFile = () => {
    setFile(null); setImgB64(null); setImgMime(null); setAnalysisResult(null)
  }

  const runAnalysis = async (imageFile) => {
    setProcessing(true); setError(null)
    try {
      const result = await analyzeModule(selectedModule, imageFile)
      setAnalysisResult(result)
      const { formValues, fieldStatuses: fs, fieldNotes: fn, fieldConfs: fc } =
        responseToFormValues(selectedModule, result)
      setValues(prev => ({ ...prev, ...formValues }))
      setFieldStatuses(prev => ({ ...prev, ...fs }))
      setFieldNotes(prev => ({ ...prev, ...fn }))
      setFieldConfs(prev => ({ ...prev, ...fc }))
    } catch (e) {
      if (e instanceof ApiError) setError(`Backend error (${e.status}): ${e.message}`)
      else setError(`Analysis failed: ${e.message}`)
    } finally {
      setProcessing(false)
    }
  }

  const warnings = selectedModule ? getClinicalWarnings(selectedModule, values, !!file) : []

  const requiredMet = () => {
    if (!selectedModule) return false
    return FIELDS[selectedModule].filter(f => f.required)
      .every(f => values[f.id] && values[f.id] !== '')
  }

  const handleSubmit = async () => {
    const errs = validateFields(selectedModule, values)
    if (errs.length > 0) {
      const m = {}; errs.forEach(e => { m[e.field] = e.message })
      setFieldErrors(m)
      setError(`${errs.length} validation error${errs.length>1?'s':''}.`)
      return
    }
    setFieldErrors({}); setLoading(true); setReport(null)
    setError(null); setIsEnhanced(false)
    try {
      setLoadingStage('Generating deterministic clinical report…')
      const filmWarn = ['lumbar','pelvic'].includes(selectedModule)
        && values.film_type && values.film_type !== 'Standing'
      const det = generateDeterministicReport(selectedModule, values, !!file, filmWarn)
      const srcNote = analysisResult
        ? `\n[Backend analysis: ${analysisResult.real_count||0} measurements from ${analysisResult.module}, quality: ${analysisResult.image_quality||'unknown'}]`
        : ''
      setLoadingStage('Attempting LLM prose enhancement…')
      const final = await enhanceReportWithLLM(det + srcNote, imgB64, imgMime)
      const enhanced = final?.trim().length > 0 && final !== det
      setReport(final || det); setIsEnhanced(enhanced)
      setTimeout(() => reportRef.current?.scrollIntoView({ behavior:'smooth', block:'start' }), 150)
    } catch (e) {
      setError('Report error: ' + e.message)
    } finally { setLoading(false); setLoadingStage('') }
  }

  const handleClear = () => {
    setValues({}); setFieldStatuses({}); setFieldNotes({})
    setFieldConfs({}); setReport(null); setError(null)
    setFieldErrors({}); setIsEnhanced(false)
    setAnalysisResult(null); clearFile()
  }

  const currentModule = MODULES.find(m => m.id === selectedModule)

  // Build roadmap-compatible status for RoadmapPanel
  const roadmapStatus = backendStatus ? {
    modules: Object.fromEntries(
      Object.entries(backendStatus.modules || {}).map(([k, v]) => [k, {
        real_count: (v.tier1_measurements || []).length,
        total_count: ((v.tier1_measurements||[]).length + (v.tier2_measurements||[]).length),
        fields: Object.fromEntries([
          ...(v.tier1_measurements||[]).map(m => [m, { label: m.replace(/_/g,' '), tier: 'tier1_real_cv', current_status: 'available_real' }]),
          ...(v.tier2_measurements||[]).map(m => [m, { label: m.replace(/_/g,' '), tier: 'tier2_pending', current_status: 'not_yet_implemented' }]),
        ]),
      }])
    ),
  } : null

  return (
    <div className="app">
      <header className="header">
        <div className="header-left">
          <div className="header-logo">
            <div className="logo-mark">S</div>
            <div><div className="header-title">Spine<span>Metrics</span></div></div>
          </div>
          <div className="header-sub">Backend-Driven Clinical Imaging Platform · v6</div>
        </div>
        <div className="header-right">
          <span className="badge-ruo">Research Use Only</span>
          <span className="badge-version">v6 · Not FDA-Cleared</span>
        </div>
      </header>

      <BackendBanner status={backendStatus} error={backendError} />

      <div className="section-label">Select module</div>
      <div className="modules">
        {MODULES.map(m => {
          const ms = moduleStatus(m.id)
          return (
            <button key={m.id}
              className={`module-btn${selectedModule === m.id ? ' active' : ''}`}
              onClick={() => handleModuleSelect(m.id)}>
              <div className="module-icon" style={{ background: m.color }}>{m.icon}</div>
              <div>
                <div className="module-name">{m.label}</div>
                <div className="module-desc">{m.desc}</div>
                <div className="module-cap">
                  {ms === 'available' ? '✓ backend CV pipeline' :
                   ms === 'unavailable' ? 'manual entry only' :
                   ms === 'degraded' ? '⚠ degraded' : '—'}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {selectedModule && (
        <>
          <div className="form-section" style={{ marginBottom:'1.25rem' }}>
            <div className="section-label" style={{ marginBottom:'0.75rem' }}>
              Image upload — {moduleStatus(selectedModule) === 'available'
                ? 'triggers backend analysis'
                : 'documentation only for this module'}
            </div>
            <AnalyzeZone
              moduleId={selectedModule}
              modStatus={moduleStatus(selectedModule)}
              file={file} processing={processing}
              onFile={handleFile}
            />
            {file && !processing && (
              <div style={{ display:'flex', gap:'0.75rem', marginTop:'0.75rem', flexWrap:'wrap' }}>
                {moduleStatus(selectedModule) === 'available' && (
                  <button className="btn-secondary" onClick={() => runAnalysis(file)}>↺ Re-analyze</button>
                )}
                <button className="btn-secondary" onClick={clearFile}>Remove</button>
              </div>
            )}
          </div>

          {analysisResult && (
            <AnalysisSummary result={analysisResult} onDismiss={() => setAnalysisResult(null)} />
          )}

          {roadmapStatus && (
            <RoadmapPanel moduleId={selectedModule} backendStatus={roadmapStatus} />
          )}

          <WarningBox warnings={warnings} />

          <div className="form-section">
            <div className="section-label" style={{ marginBottom:'1rem' }}>
              Measurements — {currentModule?.label}
            </div>
            <div className="form-grid">
              {FIELDS[selectedModule].map(field => (
                <MeasurementField
                  key={field.id}
                  field={field}
                  value={values[field.id]}
                  onChange={handleField}
                  fieldError={fieldErrors[field.id]}
                  fieldStatus={fieldStatuses[field.id]}
                  fieldNote={fieldNotes[field.id]}
                  confidence={fieldConfs[field.id]}
                />
              ))}
            </div>
          </div>

          <PrecomputedBanner module={selectedModule} values={values} accentColor={currentModule?.color} />

          <div className="submit-row">
            <button className="btn-primary"
              disabled={!requiredMet() || loading || processing}
              onClick={handleSubmit}>
              {loading ? 'Generating…' : 'Generate Clinical Report →'}
            </button>
            <button className="btn-secondary" onClick={handleClear}>Clear</button>
            {!requiredMet() && !loading && !processing && (
              <span className="submit-hint">Complete required fields (*) to proceed</span>
            )}
          </div>

          {loading && (
            <div className="thinking">
              <div className="thinking-dots">
                <div className="thinking-dot"/><div className="thinking-dot"/><div className="thinking-dot"/>
              </div>
              <div className="thinking-label">{loadingStage}</div>
            </div>
          )}

          {error && <div className="error-box">{error}</div>}

          {report && (
            <div ref={reportRef}>
              <Report report={report} moduleName={currentModule?.label}
                moduleColor={currentModule?.color} isEnhanced={isEnhanced} />
            </div>
          )}
        </>
      )}

      <footer className="footer">
        <span>SpineMetrics v6 · FastAPI backend · CV heuristic → model-ready architecture</span>
        <span>Lumbar/Pelvic: Tier 1 CV · Cervical: planned · Muscle: segmentation model required</span>
        <span>Not FDA-cleared · Research use only</span>
      </footer>
    </div>
  )
}
