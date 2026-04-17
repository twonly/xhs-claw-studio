# HongShu Claw

> ⚠️ This project is for learning and research purposes only. Do not use it for commercial abuse, illegal scraping, infringement, or any activity that violates platform rules or local laws.

**A lighter, cheaper XiaoHongShu note export tool.**

HongShu Claw is a Chrome extension focused on one thing:
**export public XiaoHongShu content faster, then make basic analysis easy.**

If what you want is simply to:

- export all public notes from a creator account
- run competitor research, content teardown, and topic review
- keep titles, body text, tags, images, and engagement metrics
- quickly see which posts perform better

then you probably do not need a full, expensive platform.

HongShu Claw keeps the workflow short:

**Open a profile page → batch capture → export CSV / JSON → open the analysis dashboard**

No server required. No account required. Local-first by default.  
Cloud sync, AI analysis, and creator dashboard import are optional layers, not blockers in the main flow.

---

## Install with a coding agent

Send this repo to your coding agent (Claude Code, Codex, etc.) and say:

**`install this`**

```txt
https://github.com/twonly/xhs-claw-studio
```

It should walk you through setup in about a minute.

## Manual Setup

**1. Clone the repo**

```bash
git clone https://github.com/twonly/xhs-claw-studio.git
```

**2. Load the Chrome extension**

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode**
3. Click **Load unpacked**
4. Select this repository root directory (the folder containing `manifest.json`)

**3. Open any XiaoHongShu profile page**

Click the extension icon and start capturing.

---

## Features

- **Batch capture public notes from any creator** including title, body, tags, images, engagement metrics, and publish time
- **Single-note export** directly from note detail pages
- **Resume support** for interrupted long-running jobs
- **Delay and cooldown controls** to make batch capture more stable
- **CSV / JSON export** for both clean analysis workflows and raw archival use
- **Analysis dashboard** for top-performing notes, engagement distribution, tags, and title patterns
- **Multi-creator comparison** for side-by-side benchmarking
- **Material library** to search, filter, and reuse captured content
- **Creator dashboard import** for deeper metrics such as impressions, CTR, and follower growth
- **AI deep analysis** with your own API key
- **Optional cloud sync** with Supabase
- **Local-first storage** using `chrome.storage.local`

---

## How it works

```txt
Open a XiaoHongShu creator profile
  → Click batch capture
  → The extension extracts titles, body text, tags, images, and engagement data
  → Export CSV / JSON
  → Or jump into the analysis dashboard
  → Review top notes, engagement distribution, multi-creator comparison, and the material library
  → Optionally import creator dashboard data
  → Optionally connect your own API key for AI analysis
```

Everything runs inside the Chrome extension.  
No external server is required by default.  
If you need multi-device sync, enable cloud sync separately.

---

## Tech stack

| What | How |
|------|-----|
| Extension | Chrome Manifest V3 |
| Storage | chrome.storage.local |
| Charts | ECharts |
| Excel Parse | SheetJS |
| PDF Export | html2pdf.js |
| AI | OpenAI-compatible API (BYOK) |
| Cloud Sync | Supabase (optional) |

---

## Screenshot

| Popup / Batch Capture | Capture Results / Actions |
|:---:|:---:|
| ![Popup](docs/screenshots/01-popup-batch-capture.png) | ![Capture Actions](docs/screenshots/02-capture-result-actions.png) |

| Single Creator Dashboard | Multi-Creator Comparison |
|:---:|:---:|
| ![Dashboard](docs/screenshots/03-single-blogger-dashboard.png) | ![Comparison](docs/screenshots/04-multi-blogger-comparison.png) |

| Material Library | AI Deep Analysis |
|:---:|:---:|
| ![Library](docs/screenshots/05-material-library.png) | ![AI Analysis](docs/screenshots/06-ai-analysis-and-chat.png) |

---

## License

MIT
