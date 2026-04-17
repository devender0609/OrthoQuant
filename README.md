# SpineMetrics v1.0

**Imaging-Based Clinical Decision Support for Spine Surgery & Musculoskeletal Medicine**

> **Research Use Only · Not FDA-Cleared · Not a Diagnostic Device**

---

## What It Does

SpineMetrics is a research-grade, AI-powered clinical decision-support tool that accepts
manually entered imaging measurements and generates structured clinical reports with:

- Quantitative values with units
- Validated reference cutoffs with citations
- Clinical interpretation labels
- Literature-referenced clinical meaning
- Explicit limitations per measurement

### Modules

| Module | Measurements |
|---|---|
| **Muscle / Body Composition** | Psoas CSA, SMI, PMI, myosteatosis (HU) |
| **Lumbar Alignment** | LL Cobb, PI, PT, SS, PI-LL mismatch, SVA, spondylolisthesis, DHI |
| **Cervical Alignment** | C2–C7 Cobb, C2–C7 SVA, T1 slope, canal diameter |
| **Pelvic Parameters** | PI, PT, SS with geometric consistency check |

---

## Validated Cutoffs Used

| Measurement | Source |
|---|---|
| SMI class I/II | Prado et al. 2008, *Am J Clin Nutr* |
| Psoas/PMI | Derstine et al. 2018, *Sci Rep* |
| Myosteatosis HU | Martin et al. 2013, *J Clin Oncol* |
| PI-LL, PT, SVA | Schwab et al. 2012, *Spine* (SRS-Schwab) |
| Lumbar lordosis | Roussouly et al. 2005, *Spine* |
| DHI | Frobin et al. 1997, *Clin Biomech* |
| Spondylolisthesis | Meyerding 1932 |
| Cervical stenosis | Hayashi et al. 1995 |
| Sarcopenia definition | EWGSOP2, Cruz-Jentoft et al. 2019, *Age Ageing* |

---

## Quick Deploy (GitHub + Vercel)

### Step 1 — Clone and push to GitHub

```bash
git init
git add .
git commit -m "Initial SpineMetrics deployment"
gh repo create spinemetrics --public --push
# or: git remote add origin https://github.com/YOUR_USER/spinemetrics.git && git push -u origin main
```

### Step 2 — Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your `spinemetrics` GitHub repository
3. Framework preset: **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`

### Step 3 — Set environment variable

In Vercel dashboard → Project → **Settings → Environment Variables**:

| Key | Value |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-your-key-here` |

Set for **Production**, **Preview**, and **Development** environments.

Click **Deploy**. Done.

---

## Local Development

```bash
# 1. Install dependencies
npm install

# 2. Set up your API key
cp .env.example .env.local
# Edit .env.local and add your VITE_ANTHROPIC_API_KEY

# 3. Run dev server
npm run dev
# Open http://localhost:5173
```

---

## Architecture

```
spinemetrics/
├── api/
│   └── analyze.js          # Vercel serverless proxy (keeps API key server-side)
├── src/
│   ├── main.jsx            # React entry point
│   ├── App.jsx             # Main application component
│   ├── api.js              # Anthropic API call + prompt builder + pre-computation
│   ├── constants.js        # Clinical modules, form fields, cutoff values
│   ├── markdown.js         # Lightweight markdown → HTML renderer
│   └── index.css           # All styles (DM Serif Display + Instrument Sans)
├── public/
│   └── favicon.svg
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```

### Security Model

The Vercel serverless function (`/api/analyze.js`) proxies all API calls server-side.
Your `ANTHROPIC_API_KEY` is **never** exposed to the browser. The frontend calls
`/api/analyze`, which adds the key from the server environment variable.

In local development, a `VITE_ANTHROPIC_API_KEY` in `.env.local` is used for
direct calls to avoid needing to run the serverless function locally.

---

## Clinical Safeguards

- The AI engine is instructed via a hardcoded system prompt to NEVER diagnose sarcopenia from imaging alone
- Non-standing film detection triggers automatic warning before submission
- PI ≠ PT + SS inconsistency is flagged in both the UI and the report
- HU myosteatosis analysis limitations are stated if DICOM not available
- Every report includes a mandatory disclaimer block
- No treatment recommendations are ever generated

---

## Regulatory Status

This software is:
- **Not** FDA-cleared as a medical device
- **Not** CE-marked
- Intended for **research and clinical decision support only**
- Not a replacement for physician judgment
- Outputs require validation by a qualified clinician before clinical use

If deploying in a clinical environment, consult your institution's IT security,
compliance, and IRB/ethics offices before use with patient data.

---

## Citation (if used in research)

If you use SpineMetrics in a research context, please acknowledge:

> SpineMetrics v1.0 (Ascension Texas Spine & Scoliosis, 2025). Imaging-based
> clinical decision-support tool for spinal alignment and body composition analysis.
> [Your institution / URL]

---

## License

Internal research tool. Not for commercial distribution without authorization.
