/**
 * MeasurementField — a form field with explicit measurement status.
 *
 * Status system mirrors backend MeasurementStatus:
 *   available_real           → green border, "✓ CV measured" badge
 *   available_low_confidence → amber border, "⚠ low confidence" badge + warning
 *   manual_only              → normal field, "manual entry" label
 *   not_yet_implemented      → normal field, "not yet automated" label
 *   failed                   → normal field, "detection failed" label + note
 *   not_applicable           → grayed out, not shown for entry
 */

const STATUS_CONFIG = {
  available_real: {
    badge:     '✓ CV measured',
    cls:       'field-real',
    badgeCls:  'badge-real',
    showNote:  false,
  },
  available_low_confidence: {
    badge:     '⚠ low confidence',
    cls:       'field-low-conf',
    badgeCls:  'badge-low-conf',
    showNote:  true,
  },
  manual_only: {
    badge:     'manual entry',
    cls:       '',
    badgeCls:  'badge-manual',
    showNote:  false,
  },
  not_yet_implemented: {
    badge:     'not yet automated',
    cls:       '',
    badgeCls:  'badge-nyi',
    showNote:  false,
  },
  failed: {
    badge:     'detection failed',
    cls:       '',
    badgeCls:  'badge-failed',
    showNote:  true,
  },
  not_applicable: {
    badge:     'n/a',
    cls:       'field-na',
    badgeCls:  'badge-na',
    showNote:  false,
  },
}

export default function MeasurementField({
  field,
  value,
  onChange,
  fieldError,
  fieldStatus,   // MeasurementStatus string from backend
  fieldNote,     // note string from backend FieldResult
  confidence,    // 0–1 from backend
}) {
  const status = fieldStatus || 'manual_only'
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.manual_only
  const isReadOnly = status === 'not_applicable'
  const hasError = !!fieldError
  const hasLowConf = status === 'available_low_confidence'

  const inputCls = [
    'field-input',
    hasError    ? 'invalid'       : '',
    cfg.cls,
  ].filter(Boolean).join(' ')

  return (
    <div className={`field${field.type === 'text' ? ' field-full' : ''} mfield`}>
      <label className="field-label">
        <span className="field-label-text">
          {field.label}
          {field.required && <span className="req-star">*</span>}
        </span>
        <span className={`mfield-badge ${cfg.badgeCls}`}>
          {cfg.badge}
          {confidence !== null && confidence !== undefined && status === 'available_real' && (
            <span className="mfield-conf">{Math.round(confidence * 100)}%</span>
          )}
          {confidence !== null && confidence !== undefined && status === 'available_low_confidence' && (
            <span className="mfield-conf">{Math.round(confidence * 100)}%</span>
          )}
        </span>
      </label>

      {isReadOnly ? (
        <div className="field-na-placeholder">—</div>
      ) : field.type === 'select' ? (
        <select
          value={value || ''}
          onChange={e => onChange(field.id, e.target.value)}
          className={hasError ? 'invalid' : ''}
        >
          <option value="">— select —</option>
          {field.options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input
          type={field.type === 'text' ? 'text' : 'number'}
          step="any"
          placeholder={field.placeholder}
          value={value || ''}
          onChange={e => onChange(field.id, e.target.value)}
          className={inputCls}
        />
      )}

      {hasError && (
        <span className="field-error">⚠ {fieldError}</span>
      )}

      {hasLowConf && fieldNote && (
        <span className="field-low-conf-note">⚠ {fieldNote}</span>
      )}

      {status === 'failed' && fieldNote && (
        <span className="field-failed-note">{fieldNote}</span>
      )}
    </div>
  )
}
