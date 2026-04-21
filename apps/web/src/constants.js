// ─── Clinical Modules ─────────────────────────────────────────────────────────
// Mode labels accurately reflect what this application does and does not do.
export const MODULES = [
  {
    id: 'muscle',
    label: 'Muscle / Body Composition',
    icon: 'M',
    color: '#0E6E55',
    desc: 'L3 CT · Psoas CSA · SMI · PMI · Myosteatosis',
    imageReq: 'Axial CT at L3 level with bilateral transverse processes visible. Soft-tissue window (W:400 L:50). DICOM preferred. Image upload is for documentation only — measurements must be entered manually below.',
    imageMode: 'documentation', // 'documentation' | 'measurement'
  },
  {
    id: 'lumbar',
    label: 'Lumbar Alignment',
    icon: 'L',
    color: '#185FA5',
    desc: 'Standing lateral XR · LL · PI · PT · PI-LL · SVA',
    imageReq: 'Weight-bearing lateral lumbar radiograph. L1 through S1 (including superior S1 endplate) must be fully visible. Image upload is for documentation only — measurements must be entered manually below.',
    imageMode: 'documentation',
  },
  {
    id: 'cervical',
    label: 'Cervical Alignment',
    icon: 'C',
    color: '#7B3F9E',
    desc: 'Lateral XR or mid-sagittal MRI · C2–C7 Cobb',
    imageReq: 'Lateral cervical radiograph or mid-sagittal T2 MRI. C2 and C7 inferior endplates must be visible. Image upload is for documentation only — measurements must be entered manually below.',
    imageMode: 'documentation',
  },
  {
    id: 'pelvic',
    label: 'Pelvic Parameters',
    icon: 'P',
    color: '#A0420D',
    desc: 'Standing lumbopelvic XR · PI · PT · SS',
    imageReq: 'Standing lateral lumbopelvic radiograph. Both femoral heads and entire sacrum must be visible. Image upload is for documentation only — measurements must be entered manually below.',
    imageMode: 'documentation',
  },
]

// ─── Form Fields Per Module ───────────────────────────────────────────────────
export const FIELDS = {
  muscle: [
    { id: 'sex',        label: 'Biological sex',                              type: 'select', options: ['Male', 'Female'], required: true },
    { id: 'height',     label: 'Height (cm)',                                  type: 'number', placeholder: 'e.g. 172',    required: true,  min: 100, max: 230 },
    { id: 'weight',     label: 'Weight (kg)',                                  type: 'number', placeholder: 'e.g. 78',     required: false, min: 20,  max: 300 },
    { id: 'age',        label: 'Age (years)',                                  type: 'number', placeholder: 'e.g. 65',     required: false, min: 18,  max: 110 },
    { id: 'psoas_l',    label: 'Left psoas CSA (cm²)',                        type: 'number', placeholder: 'e.g. 14.2',   required: true,  min: 0.5, max: 60 },
    { id: 'psoas_r',    label: 'Right psoas CSA (cm²)',                       type: 'number', placeholder: 'e.g. 13.8',   required: true,  min: 0.5, max: 60 },
    { id: 'total_sma',  label: 'Total skeletal muscle area at L3 (cm²)',      type: 'number', placeholder: 'e.g. 148.4',  required: true,  min: 20,  max: 400 },
    { id: 'mean_hu',    label: 'Mean muscle attenuation — HU (DICOM only)',   type: 'number', placeholder: 'e.g. 42',     required: false, min: -100,max: 100 },
    { id: 'imaging_notes',    label: 'Imaging notes / contrast phase',        type: 'text',   placeholder: 'e.g. non-contrast, portal venous phase', required: false },
    { id: 'clinical_context', label: 'Clinical context (optional)',           type: 'text',   placeholder: 'e.g. pre-op lumbar fusion, cancer screening', required: false },
  ],
  lumbar: [
    { id: 'sex',           label: 'Biological sex',                           type: 'select', options: ['Male', 'Female'],                                  required: true },
    { id: 'age',           label: 'Age (years)',                              type: 'number', placeholder: 'e.g. 58',    required: true,  min: 18, max: 110 },
    { id: 'film_type',     label: 'Film position',                            type: 'select', options: ['Standing', 'Supine', 'Prone', 'Unknown'],           required: true },
    { id: 'll_cobb',       label: 'Lumbar lordosis L1–S1 Cobb (°)',          type: 'number', placeholder: 'e.g. 47 (auto-filled from canvas)',    required: true,  min: -30, max: 100 },
    { id: 'pi',            label: 'Pelvic incidence — PI (°)',                type: 'number', placeholder: 'e.g. 54 (auto-filled from canvas)',    required: true,  min: 20, max: 100 },
    { id: 'pt',            label: 'Pelvic tilt — PT (°)',                     type: 'number', placeholder: 'e.g. 18 (auto-filled from canvas)',    required: true,  min: -10, max: 60 },
    { id: 'ss',            label: 'Sacral slope — SS (°)',                    type: 'number', placeholder: 'e.g. 36',    required: false, min: 0, max: 80 },
    { id: 'sva',           label: 'Sagittal vertical axis — SVA (mm)',        type: 'number', placeholder: 'e.g. 32',    required: false, min: -200, max: 400 },
    { id: 'spondylo_pct',  label: 'Spondylolisthesis slip % (0 if none)',    type: 'number', placeholder: 'e.g. 0',     required: false, min: 0, max: 100 },
    { id: 'disc_level',    label: 'Disc level for DHI',                       type: 'select', options: ['Not measured','L1-L2','L2-L3','L3-L4','L4-L5','L5-S1'], required: false },
    { id: 'disc_height',   label: 'Disc height index — DHI (0–1)',           type: 'number', placeholder: 'e.g. 0.28',  required: false, min: 0, max: 1 },
    { id: 'clinical_context', label: 'Clinical context (optional)',           type: 'text',   placeholder: 'e.g. adult flatback, revision fusion', required: false },
  ],
  cervical: [
    { id: 'sex',           label: 'Biological sex',                           type: 'select', options: ['Male', 'Female'],                                                  required: true },
    { id: 'age',           label: 'Age (years)',                              type: 'number', placeholder: 'e.g. 52',  required: true, min: 18, max: 110 },
    { id: 'modality',      label: 'Imaging modality',                         type: 'select', options: ['Lateral radiograph', 'Mid-sagittal T2 MRI', 'CT sagittal reformat'], required: true },
    { id: 'film_position', label: 'Neck position',                            type: 'select', options: ['Neutral', 'Flexion', 'Extension', 'Unknown'],                       required: true },
    { id: 'method',        label: 'Measurement method',                       type: 'select', options: ['Cobb (standard)', 'Harrison posterior tangent', 'Unknown'],          required: true },
    { id: 'c2c7_cobb',     label: 'C2–C7 angle (°) — lordosis +, kyphosis −', type: 'number', placeholder: 'e.g. 14 or -6', required: true, min: -60, max: 80 },
    { id: 'c2c7_sva',      label: 'C2–C7 SVA (mm)',                          type: 'number', placeholder: 'e.g. 18',  required: false, min: -50, max: 200 },
    { id: 't1_slope',      label: 'T1 slope (°)',                             type: 'number', placeholder: 'e.g. 24',  required: false, min: 0, max: 60 },
    { id: 'mcl',           label: 'Canal AP diameter at index level (mm)',    type: 'number', placeholder: 'e.g. 10',  required: false, min: 3, max: 25 },
    { id: 'clinical_context', label: 'Clinical context (optional)',           type: 'text',   placeholder: 'e.g. DCM, cervicogenic pain, post-laminoplasty', required: false },
  ],
  pelvic: [
    { id: 'sex',        label: 'Biological sex',             type: 'select', options: ['Male', 'Female'],                                       required: true },
    { id: 'age',        label: 'Age (years)',                type: 'number', placeholder: 'e.g. 61', required: true, min: 18, max: 110 },
    { id: 'film_type',  label: 'Film position',              type: 'select', options: ['Standing', 'Supine', 'Prone', 'Unknown'],                required: true },
    { id: 'both_heads', label: 'Both femoral heads visible?', type: 'select', options: ['Yes', 'No — midpoint estimated'],                      required: true },
    { id: 'pi',         label: 'Pelvic incidence — PI (°)', type: 'number', placeholder: 'e.g. 52', required: true,  min: 20, max: 100 },
    { id: 'pt',         label: 'Pelvic tilt — PT (°)',      type: 'number', placeholder: 'e.g. 22', required: true,  min: -10, max: 60 },
    { id: 'ss',         label: 'Sacral slope — SS (°)',      type: 'number', placeholder: 'e.g. 30', required: true,  min: 0, max: 80 },
    { id: 'clinical_context', label: 'Clinical context (optional)', type: 'text', placeholder: 'e.g. pre-op deformity planning', required: false },
  ],
}

// ─── Valid range lookup (for inline field validation) ─────────────────────────
export function getFieldRange(moduleId, fieldId) {
  const field = (FIELDS[moduleId] || []).find(f => f.id === fieldId)
  if (!field || field.min === undefined) return null
  return { min: field.min, max: field.max }
}
