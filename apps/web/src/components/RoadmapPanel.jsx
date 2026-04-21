/**
 * RoadmapPanel — shows full measurement roadmap for a module.
 * Displays tier, current status, and what is/isn't implemented.
 */

const TIER_LABELS = {
  tier1_real_cv:      { label: 'Tier 1 — Real CV',       cls: 'tier-1' },
  tier2_pending_cv:   { label: 'Tier 2 — Pending CV',    cls: 'tier-2' },
  tier3_segmentation: { label: 'Tier 3 — Segmentation',  cls: 'tier-3' },
}

const STATUS_LABELS = {
  available_real:           { label: 'Available',       cls: 'rs-real'    },
  available_low_confidence: { label: 'Low confidence',  cls: 'rs-low'     },
  manual_only:              { label: 'Manual only',     cls: 'rs-manual'  },
  not_yet_implemented:      { label: 'Not yet built',   cls: 'rs-nyi'     },
}

export default function RoadmapPanel({ moduleId, backendStatus, defaultOpen = false }) {
  const modInfo = backendStatus?.modules?.[moduleId]
  if (!modInfo?.fields) return null

  // Group by tier
  const byTier = {}
  Object.entries(modInfo.fields).forEach(([key, meta]) => {
    const tier = meta.tier || 'tier2_pending_cv'
    if (!byTier[tier]) byTier[tier] = []
    byTier[tier].push({ key, ...meta })
  })

  const tierOrder = ['tier1_real_cv', 'tier2_pending_cv', 'tier3_segmentation']

  return (
    <details className="roadmap-panel" open={defaultOpen}>
      <summary className="roadmap-summary">
        Measurement roadmap — {modInfo.real_count}/{modInfo.total_count} automated
      </summary>
      <div className="roadmap-body">
        {tierOrder.map(tier => {
          const fields = byTier[tier]
          if (!fields?.length) return null
          const tl = TIER_LABELS[tier]
          return (
            <div className="roadmap-tier" key={tier}>
              <div className={`roadmap-tier-label ${tl.cls}`}>{tl.label}</div>
              {fields.map(f => {
                const sl = STATUS_LABELS[f.current_status] || STATUS_LABELS.not_yet_implemented
                return (
                  <div className="roadmap-row" key={f.key}>
                    <span className="roadmap-field-label">{f.label}</span>
                    <span className={`roadmap-status ${sl.cls}`}>{sl.label}</span>
                    {f.note && <span className="roadmap-note" title={f.note}>ⓘ</span>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </details>
  )
}
