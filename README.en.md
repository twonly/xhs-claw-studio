# xhs-claw-studio

<p align="center">
  <img src="icons/icon128.png" alt="xhs-claw-studio" width="96" height="96">
</p>

<p align="center">
  <strong>Too expensive? Only need export, not a full platform?</strong>
</p>

<p align="center">
  <strong>HongShu Claw: focused XiaoHongShu export and lightweight analysis.</strong>
</p>

<p align="center">
  <a href="./README.md">中文 README</a>
</p>

<p align="center">
  <img alt="Chrome Extension" src="https://img.shields.io/badge/Chrome-Extension-111111?style=for-the-badge&logo=googlechrome&logoColor=white">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-444444?style=for-the-badge">
  <img alt="Local First" src="https://img.shields.io/badge/Local-First-ff2442?style=for-the-badge">
</p>

## ✨ If These Questions Sound Familiar

- Too expensive?
- Do you only want export, without buying a full platform?
- Do you just want to capture the data first, then run lightweight analysis and recap?
- Do you want a tool you can start using immediately, instead of another heavy SaaS workspace?

`HongShu Claw` is built for exactly that use case.

It does not try to be an all-in-one content platform. It focuses on turning XiaoHongShu public-page capture, export, analysis, material-library workflows, and creator-dashboard import into one lightweight pipeline.

For solo creators, small teams, and MCNs, that usually means you do not need to pay for a heavy platform. The product positioning is simple: focused export and lightweight analysis, priced at a small fraction of traditional platforms.

### 🧭 Diagram: Pain to Value

![Pain to Value](docs/diagrams/03-pain-to-value.svg)

What you really get is a full workflow without platform bloat:

- capture XiaoHongShu profile pages and note detail pages
- export CSV / JSON
- run single-blogger analysis and multi-blogger comparison
- build a searchable material library for recap and reuse
- import creator dashboard Excel files only when you need deeper metrics
- connect your own compatible API key only when you want AI

### 🖼️ Screenshot 1: Popup / Batch Capture Entry

![Popup / Batch Capture Entry](docs/screenshots/01-popup-batch-capture.png)

Description:
After loading the extension into Chrome, open any XiaoHongShu profile page and use the popup to batch-capture notes. It is recommended to control delay settings and batch size to reduce anti-bot risk. If capture fails, open `F12`, inspect `Network`, and submit an issue with the relevant request details.

## 🎯 What It Solves

The point is not "more features." The point is not paying for the features you do not need.

If what you need is XiaoHongShu export, lightweight analysis, competitor comparison, and material-library workflows, `HongShu Claw` is the more direct and lightweight option.

Typical use cases:

- content ops review
- competitor research
- topic and idea mining
- content archiving
- creator account analysis

## 🧭 Current Real Workflow

1. Open a XiaoHongShu profile page or note detail page
2. Capture a single note or batch-crawl a profile
3. Export CSV / JSON or jump directly into the analysis dashboard
4. Review top content, engagement distribution, tag strategy, and multi-blogger comparison
5. Search, filter, and export captured content from the material library
6. Import creator dashboard Excel files for deeper personal analysis
7. If you configure your own compatible API key, continue with AI reports and AI chat

### 🗺️ Diagram: Product Workflow

![Product Workflow](docs/diagrams/01-product-workflow.svg)

## 🧩 Core Features

### 1. Data Capture 📥

- batch capture from XiaoHongShu profile pages
- single-note capture from note detail pages
- extract title, body, tags, images, comments, engagement metrics, publish time, and source URL
- resume support for interrupted runs
- cooldown-based pacing to reduce failures during longer crawls

### 🖼️ Screenshot 2: Capture Results and Next Actions

![Capture Results and Next Actions](docs/screenshots/02-capture-result-actions.png)

Description:
After a batch capture finishes, you can directly download `CSV` or `JSON`, jump into the `Data Analysis` dashboard, or upload the current blogger dataset to the cloud to form a continuous workflow from capture to analysis.

### 2. Data Export 📦

- CSV export
- JSON export
- standard analysis export
- full raw-data export

### 3. Analysis Dashboard 📊

- single-blogger analysis
- top-content ranking
- engagement distribution
- tag and title pattern analysis
- multi-blogger comparison
- personal analysis after creator dashboard import

### 🖼️ Screenshot 3: Single Blogger Dashboard

![Single Blogger Dashboard](docs/screenshots/03-single-blogger-dashboard.png)

Description:
Inside the analysis page, you can review a blogger's core metrics, top-performing content, profile details, and export actions. This view works well for account review, content breakdown, and periodic performance checks.

### 🖼️ Screenshot 4: Multi-Blogger Comparison

![Multi-Blogger Comparison](docs/screenshots/04-multi-blogger-comparison.png)

Description:
Compare multiple bloggers side by side across note count, total likes, average likes per post, collect-to-like ratio, breakout rate, title length, body length, and more. This is useful for competitor research and same-track benchmarking.

### 4. Material Library 🗂️

- unified cross-blogger search
- search by title, body, tag, or blogger
- filter by content type, engagement range, and tags
- expand note details
- export filtered results

### 🖼️ Screenshot 5: Material Library

![Material Library](docs/screenshots/05-material-library.png)

Description:
Captured data is accumulated into a reusable material library with search, filtering, sorting, and export. It is useful for building long-term topic banks, breakout-post libraries, and competitor inspiration databases.

### 5. AI 🤖

- BYOK by default, no model usage subsidy included
- supports DeepSeek, OpenAI, Moonshot, GLM, Qwen, and SiliconFlow
- custom model names supported

### 🖼️ Screenshot 6: AI Deep Analysis and Chat

![AI Deep Analysis and Chat](docs/screenshots/06-ai-analysis-and-chat.png)

Description:
Supports broad analysis, chat-style exploration, and focused analysis around specific topics. LLM capability is already integrated, but you need to configure your own compatible API key to use it.

## 🚀 Installation

The current recommended install method is Chrome developer mode:

1. Clone or download this repository
2. Open `chrome://extensions/`
3. Enable `Developer mode`
4. Click `Load unpacked`
5. Select this project directory

If you download the packaged ZIP from `dist/`, unzip it first and then select the extracted folder. Chrome developer mode does not load a ZIP file directly through `Load unpacked`.

## 🧱 Product Module Map

![Product Module Map](docs/diagrams/02-product-module-map.svg)
