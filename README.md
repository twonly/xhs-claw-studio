# xhs-claw-studio

<p align="center">
  <img src="icons/icon128.png" alt="xhs-claw-studio" width="96" height="96">
</p>

<p align="center">
  <strong>太贵？只想导出，不想为整套平台买单？</strong>
</p>

<p align="center">
  <strong>红薯采集器：专注小红书内容导出与轻量分析。</strong>
</p>

<p align="center">
  <a href="./README.en.md">English README</a>
</p>

<p align="center">
  <img alt="Chrome Extension" src="https://img.shields.io/badge/Chrome-Extension-111111?style=for-the-badge&logo=googlechrome&logoColor=white">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-444444?style=for-the-badge">
  <img alt="Local First" src="https://img.shields.io/badge/Local-First-ff2442?style=for-the-badge">
</p>

## ✨ 如果你也在想这些问题

- 太贵？
- 只想导出，不想买整套平台？
- 只想先把数据抓下来，再做轻量分析和复盘？
- 不想被复杂 SaaS 工作台绑住，只想要一个能马上用的工具？

`红薯采集器` 就是为这类需求做的。

它不做“大而全”的内容平台，而是专注把小红书公开页抓取、导出、分析、素材沉淀和创作者后台导入串成一条轻量工作流。

对个人博主、小团队和 MCN 来说，这类需求往往不需要为重平台买单。`红薯采集器` 的定位也很直接：专注内容导出与轻量分析，价格只占传统平台的一小部分。

### 🧭 示意图：从痛点到价值闭环

![从痛点到价值闭环](docs/diagrams/03-pain-to-value.svg)

你真正拿到的是一条完整但不臃肿的工作流：

- 抓取小红书个人主页和笔记详情页
- 导出 CSV / JSON
- 做单博主分析和多博主对比
- 沉淀素材库，继续筛选、搜索和复盘
- 需要更深数据时，再导入创作者后台 Excel
- 需要 AI 时，再接你自己的兼容 API Key

### 🖼️ 截图 1：插件 Popup / 批量抓取入口

![插件 Popup / 批量抓取入口](docs/screenshots/01-popup-batch-capture.png)

说明：
导入 Chrome 插件后，在小红书博主页面打开，即可批量抓取笔记数据。建议控制延时范围和每批抓取数量，避免触发反爬机制。如果抓取失败，可打开 `F12` 查看 `Network` 信息并提交 issue。

## 🎯 它解决什么问题

核心不是“功能多”，而是“别为不需要的东西买单”。

如果你只需要小红书内容导出、轻量分析、竞品对比和素材沉淀，`红薯采集器` 就是更轻、更直接的选择。

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

### 🗺️ 示意图：产品工作流全景

![产品工作流全景](docs/diagrams/01-product-workflow.svg)

## 🧩 核心功能

### 1. 数据抓取 📥

- 批量抓取小红书个人主页
- 单篇抓取小红书笔记详情页
- 提取标题、正文、标签、图片、评论、互动数据、发布时间、原文链接
- 支持断点续传
- 支持冷却分段，降低长批次抓取时的中断概率

### 🖼️ 截图 2：抓取结果与后续操作

![抓取结果与后续操作](docs/screenshots/02-capture-result-actions.png)

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

![单博主分析看板](docs/screenshots/03-single-blogger-dashboard.png)

说明：
进入分析页后，可以查看单个博主的核心指标、Top 内容、画像信息和导出入口。这个页面适合做账号复盘、内容拆解和阶段性数据回看。

### 🖼️ 截图 4：多博主对比

![多博主对比](docs/screenshots/04-multi-blogger-comparison.png)

说明：
支持多位博主横向对比，查看笔记数、总点赞、平均赞/篇、收藏/赞比、爆款率、标题长度、正文长度等指标，适合做竞品研究和同赛道对标。

### 4. 素材库 🗂️

- 跨博主统一检索
- 按标题 / 正文 / 标签 / 博主搜索
- 按类型、互动区间、标签筛选
- 展开笔记详情
- 导出筛选结果

### 🖼️ 截图 5：素材库

![素材库](docs/screenshots/05-material-library.png)

说明：
抓取过的数据会沉淀成统一素材库，支持搜索、筛选、排序和导出。适合长期做选题库、爆款库和竞品素材沉淀。

### 5. AI 🤖

- 默认 BYOK，不代付模型费用
- 支持 DeepSeek、OpenAI、Moonshot、GLM、Qwen、SiliconFlow
- 支持自定义模型名称

### 🖼️ 截图 6：AI 深度分析与问答

![AI 深度分析与问答](docs/screenshots/06-ai-analysis-and-chat.png)

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

## 🧱 产品模块示意

![产品模块示意](docs/diagrams/02-product-module-map.svg)
