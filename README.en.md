# xhs-claw-studio

<p align="center">
  <img src="icons/icon128.png" alt="xhs-claw-studio" width="96" height="96">
</p>

<p align="center">
  <strong>A real Chrome extension for XiaoHongShu capture, export, analysis, material library workflows, creator dashboard import, and AI recap.</strong>
</p>

<p align="center">
  <a href="./README.md">中文 README</a>
</p>

<p align="center">
  <img alt="Chrome Extension" src="https://img.shields.io/badge/Chrome-Extension-111111?style=for-the-badge&logo=googlechrome&logoColor=white">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-444444?style=for-the-badge">
  <img alt="Local First" src="https://img.shields.io/badge/Local-First-ff2442?style=for-the-badge">
</p>

## What This Is

`xhs-claw-studio` is a working Chrome extension, not a concept mockup.

It currently supports:

- batch capture from XiaoHongShu profile pages
- single-note capture from note detail pages
- CSV / JSON export
- blogger analysis dashboard
- multi-blogger comparison
- searchable material library
- creator dashboard Excel import
- AI recap and follow-up chat
- optional cloud sync

## What It Solves

It turns XiaoHongShu public-page content into structured data, then keeps going into analysis, comparison, recap, and reusable research workflows.

Typical use cases:

- creator ops review
- competitor research
- idea mining
- content archiving
- account analysis

## Current Real Workflow

1. Open a XiaoHongShu profile page or note detail page
2. Capture a single note or batch-crawl a profile
3. Export CSV / JSON or jump into the dashboard
4. Inspect top notes, engagement distribution, tag patterns, and blogger comparison
5. Use the material library to search and filter all captured content
6. Import creator dashboard Excel data for deeper account analysis
7. Connect your own compatible API key if you want AI reports

## Core Features

### 1. Capture

- batch crawl XiaoHongShu profile pages
- single-note capture for note detail pages
- extract title, body, tags, images, comments, engagement, publish time, and source URL
- task resume support
- cooldown-based crawling for longer runs

### 2. Export

- CSV export
- JSON export
- standard analysis export
- full raw export

### 3. Dashboard

- single-blogger analysis
- top-note ranking
- engagement distribution
- tag and title pattern analysis
- multi-blogger comparison
- creator-dashboard-based personal analysis

### 4. Material Library

- cross-blogger search
- search by title, content, tags, and blogger
- filter by content type, engagement range, and tags
- note detail side panel
- filtered result export

### 5. AI

- BYOK by default
- supports DeepSeek, OpenAI, Moonshot, GLM, Qwen, SiliconFlow
- custom model name supported

## Install

1. Clone or download this repository
2. Open `chrome://extensions/`
3. Enable `Developer mode`
4. Click `Load unpacked`
5. Select this project directory

If you download the packaged ZIP from `dist/`, unzip it first, then select the extracted folder. Chrome developer-mode installation does not load a ZIP file directly through `Load unpacked`.

## Supported Pages

- `https://www.xiaohongshu.com/user/profile/*`
- `https://www.xiaohongshu.com/explore/*`
- `https://www.xiaohongshu.com/discovery/item/*`
- `https://creator.xiaohongshu.com/statistics/*`
