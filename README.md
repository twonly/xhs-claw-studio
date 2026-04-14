# xhs-claw-studio

<p align="center">
  <img src="icons/icon128.png" alt="xhs-claw-studio" width="96" height="96">
</p>

<p align="center">
  <strong>一个真实可用的小红书 Chrome 插件：批量抓取、导出、分析、素材库、创作者数据导入、AI 复盘。</strong>
</p>

<p align="center">
  <a href="./README.en.md">English README</a>
</p>

<p align="center">
  <img alt="Chrome Extension" src="https://img.shields.io/badge/Chrome-Extension-111111?style=for-the-badge&logo=googlechrome&logoColor=white">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-444444?style=for-the-badge">
  <img alt="Local First" src="https://img.shields.io/badge/Local-First-ff2442?style=for-the-badge">
</p>

## ✨ 这是什么

`xhs-claw-studio` 不是概念项目，也不是虚构产品页。

它是一个已经可运行的 Chrome 扩展，当前已经实现：

- 小红书个人主页批量抓取
- 小红书笔记详情页单篇抓取
- CSV / JSON 导出
- 博主分析看板
- 多博主对比
- 素材库搜索与筛选
- 创作者后台 Excel 导入
- AI 报告与对话
- 可选云同步

### 🖼️ 截图 1：插件 Popup / 批量抓取入口

预留图片路径：`docs/screenshots/01-popup-batch-capture.png`

说明：
导入 Chrome 插件后，在小红书博主页面打开，即可批量抓取笔记数据。建议控制延时范围和每批抓取数量，避免触发反爬机制。如果抓取失败，可打开 `F12` 查看 `Network` 信息并提交 issue。

## 🎯 它解决什么问题

把小红书公开页面上的内容提取成结构化数据，然后继续走到分析、复盘和素材沉淀流程，而不是停留在“导出一个文件”。

适合的使用场景：

- 运营复盘
- 竞品研究
- 选题找灵感
- 内容归档
- 创作者账号分析

## 🧭 当前真实支持的流程

1. 打开小红书个人主页或笔记详情页
2. 用插件抓取单篇或批量抓取整页笔记
3. 导出 CSV / JSON，或者直接进入分析看板
4. 在分析页看爆款内容、互动分布、标签策略和多博主对比
5. 在素材库里统一搜索、筛选和导出已抓取内容
6. 如果你有创作者后台导出的 Excel，可以继续导入做更深层的个人分析
7. 如果你配置了自己的兼容 API Key，可以继续用 AI 报告和 AI 问答

## 🧩 核心功能

### 1. 数据抓取 📥

- 批量抓取小红书个人主页
- 单篇抓取小红书笔记详情页
- 提取标题、正文、标签、图片、评论、互动数据、发布时间、原文链接
- 支持断点续传
- 支持冷却分段，降低长批次抓取时的中断概率

### 🖼️ 截图 2：抓取结果与后续操作

预留图片路径：`docs/screenshots/02-capture-result-actions.png`

说明：
批量抓取完成后，可以直接下载 `CSV`、`JSON`，进入 `数据分析` 看板，或者把当前博主数据上传到云端，形成从抓取到分析的连续工作流。

### 2. 数据导出 📦

- 导出 CSV
- 导出 JSON
- 支持标准分析导出
- 支持完整原始数据导出

### 3. 分析看板 📊

- 单博主分析
- Top 内容排行
- 互动分布
- 标签与标题规律分析
- 多博主对比
- 创作者后台导入后的个人分析

### 🖼️ 截图 3：单博主分析看板

预留图片路径：`docs/screenshots/03-single-blogger-dashboard.png`

说明：
进入分析页后，可以查看单个博主的核心指标、Top 内容、画像信息和导出入口。这个页面适合做账号复盘、内容拆解和阶段性数据回看。

### 🖼️ 截图 4：多博主对比

预留图片路径：`docs/screenshots/04-multi-blogger-comparison.png`

说明：
支持多位博主横向对比，查看笔记数、总点赞、平均赞/篇、收藏/赞比、爆款率、标题长度、正文长度等指标，适合做竞品研究和同赛道对标。

### 4. 素材库 🗂️

- 跨博主统一检索
- 按标题 / 正文 / 标签 / 博主搜索
- 按类型、互动区间、标签筛选
- 展开笔记详情
- 导出筛选结果

### 🖼️ 截图 5：素材库

预留图片路径：`docs/screenshots/05-material-library.png`

说明：
抓取过的数据会沉淀成统一素材库，支持搜索、筛选、排序和导出。适合长期做选题库、爆款库和竞品素材沉淀。

### 5. AI 🤖

- 默认 BYOK，不代付模型费用
- 支持 DeepSeek、OpenAI、Moonshot、GLM、Qwen、SiliconFlow
- 支持自定义模型名称

### 🖼️ 截图 6：AI 深度分析与问答

预留图片路径：`docs/screenshots/06-ai-analysis-and-chat.png`

说明：
支持综合分析、问答式分析，以及围绕特定专题做针对性分析。当前已经集成 LLM 能力，但需要用户自行配置兼容 API Key 才能使用。

## 🚀 安装方式

当前适合通过 Chrome 开发者模式安装：

1. 克隆或下载本仓库
2. 打开 `chrome://extensions/`
3. 打开右上角“开发者模式”
4. 点击“加载已解压的扩展程序”
5. 选择当前项目目录

如果你下载的是 `dist/` 里的打包 ZIP，也可以使用，但需要先解压，再选择解压后的文件夹。Chrome 的 `加载已解压的扩展程序` 入口不能直接选择 ZIP 文件。

## 🌐 当前支持页面

- `https://www.xiaohongshu.com/user/profile/*`
- `https://www.xiaohongshu.com/explore/*`
- `https://www.xiaohongshu.com/discovery/item/*`
- `https://creator.xiaohongshu.com/statistics/*`
