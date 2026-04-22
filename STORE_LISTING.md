# Chrome Web Store 发布文案

## 扩展名称
Claw Studio — Creator Content Exporter

## 简短描述（132 字符内）
面向内容创作者的数据导出助手。将你访问到的笔记正文、图片、标签和公开互动数据一键导出为 CSV / JSON，辅助创作复盘和行业研究。

## 详细描述

**Claw Studio 是一款面向内容创作者的数据导出与分析工具。**

创作者日常需要复盘自己的历史笔记表现、研究行业优秀内容的创作规律。平台内只提供有限的数据摘要，无法导出笔记正文、图片和标签等结构化字段。一遍遍复制粘贴既低效又容易出错。

Claw Studio 在你主动触发下完成这件事——只读取你当前访问的公开页面内容，默认本地保存。

### 核心功能

**笔记导出**
- 单篇导出：打开任意笔记详情页，提取标题、正文、标签、高清图、公开互动数据
- 批量导出：你访问的创作者主页中，逐篇自动收集笔记详情
- 断点续传：大批量任务关闭后可继续，已抓数据不丢
- 节流控制：用户可配置延时区间 + 分段冷却，尊重平台节奏

**数据分析看板**
- 概览指标：点赞 / 收藏 / 评论 / 互动率
- Top 10：按点赞 / 收藏 / 评论排序的高互动笔记
- 分布图：点赞与收藏分布
- 标签词频：高频话题统计

**深度洞察**（基于历史数据计算）
- 标签 ROI：各标签平均互动效果对比
- 标题模式分析：问句 / 数字 / 关键词标题公式的互动差异
- 发布时间热力图：7×24 时段互动分布
- 配图数量 vs 互动、视频 vs 图文、正文长度 vs 互动
- 数据增长趋势：历次采集的聚合指标变化曲线

**素材库**
- 全文搜索：标题 / 正文 / 标签 / 作者多关键词 AND 匹配
- 多维筛选：作者、内容类型、标签、互动区间
- 筛选统计面板：均值、爆款率、藏赞比
- 一键复制：标题 / 正文 / 标签 / 链接
- 批量导出 CSV / JSON

**AI 分析（自配 API Key）**
- AI 分析报告、AI 对话问答、多账号对比
- 兼容 DeepSeek、OpenAI、Moonshot、智谱、通义千问、SiliconFlow 等 OpenAI 兼容接口
- 发送给 AI 的是聚合后的数据摘要，而非原始笔记集
- 不代付 API 费用，模型费用由用户自行承担

**云同步（可选）**
- 邮箱注册后按需开启；也支持匿名上传
- 同步内容：账号元信息、笔记数据、AI 报告
- 本地数据始终是 source of truth，云端仅作备份和跨设备访问

**导出格式**
- CSV / JSON 全格式（分析页 & 素材库均可）
- PDF：完整分析页面导出为 A4 报告

### 适用场景

- **个人内容复盘**：导出自己发布过的所有笔记做历史数据分析
- **内容备份**：一键保存笔记正文和图片链接，防止误删或平台变化
- **行业研究**：在你访问的公开内容基础上整理结构化数据做趋势分析
- **选题参考**：素材库全文搜索快速找到灵感
- **BI 分析**：导出 CSV 送入 Excel / Python / Tableau

### 数据与隐私

- 只读取你**当前主动访问的公开页面**内容，不涉及登录凭证、私信或他人非公开数据
- 默认**本地存储**，无自动上传
- 云同步为**可选**功能，完全由用户主动触发
- AI 分析由用户**自行配置** API Key，Claw Studio 不代理任何模型调用
- 开源透明，代码审查可见 GitHub
- 详细隐私政策：https://xhs-claw-studio.pages.dev/privacy

### 使用方法

1. 安装后打开目标笔记详情页或创作者主页
2. 点击扩展图标或打开侧边栏
3. 选择单篇或批量模式 → 点击「开始导出」
4. 抓取完成后，点击「数据分析」查看看板或下载 CSV / JSON / PDF
5. 在分析页面打开「素材库」跨博主检索

---

## 分类
Productivity（效率工具）

## 单一用途声明（Single Purpose）

**English**:
Claw Studio is a data export and analysis tool for content creators. Its single purpose is to help users export, organize, and analyze publicly visible notes and engagement metrics from pages they actively visit.

**中文**:
Claw Studio 是面向内容创作者的数据导出和分析工具，单一用途是帮助用户从其主动访问的页面导出、整理并分析公开笔记及互动数据。

---

## 权限说明（用于 Chrome Web Store Permissions tab 逐条填写）

### API Permissions

| 权限 | Justification (EN) | 中文参考 |
|------|---|---|
| `scripting` | Inject the capture script into target pages when the user triggers a capture from the popup/side panel. | 触发抓取时向目标页面注入内容脚本 |
| `tabs` | Detect the active tab and route capture messages to the correct tab; no browsing history is collected. | 判断活跃标签并路由抓取消息 |
| `storage` | Store user preferences (AI key, export format) and captured data locally in the browser. | 本地保存用户偏好和已抓数据 |
| `unlimitedStorage` | Batch captures can accumulate significant data volume; the default 10 MB storage quota is insufficient for power users. | 批量抓取数据量较大，10 MB 默认配额不够 |
| `downloads` | Save generated CSV / JSON / PDF files to the user's local Downloads folder. | 下载导出的 CSV/JSON/PDF |
| `sidePanel` | Provide a persistent side panel UI alternative to the popup so the panel stays open when the user switches tabs. | 提供常驻侧边栏 UI |

### Host Permissions

| Host | Justification |
|------|------|
| `https://www.xiaohongshu.com/*` | Inject the content script into public note and profile pages the user actively visits to extract the content the user is viewing. |
| `https://creator.xiaohongshu.com/statistics/*` | Read the user's own creator dashboard (user must be logged into their own account) to export historical statistics. |
| `https://api.deepseek.com/*` | Forward user-configured AI API key to DeepSeek for report generation. Activated only after the user configures their own API key and triggers an AI feature. |
| `https://api.openai.com/*` | Same as above, for OpenAI. |
| `https://api.moonshot.cn/*` | Same as above, for Moonshot (Kimi). |
| `https://open.bigmodel.cn/*` | Same as above, for ZhiPu GLM. |
| `https://dashscope.aliyuncs.com/*` | Same as above, for Alibaba QianWen. |
| `https://api.siliconflow.cn/*` | Same as above, for SiliconFlow. |
| `https://*.supabase.co/*` | Backend endpoint for optional cloud sync (Supabase). Activated only when the user explicitly enables backup. |
| `https://api.mixpanel.com/*` | Anonymous usage analytics with no user-identifying data. User can disable in settings. |

### Remote Code

**No remote code execution.** All executable JavaScript is bundled within the extension package. Remote endpoints serve only data payloads (JSON); there is no `eval` of remote responses and no dynamic script loading.

### Data Usage Disclosure

**What we collect (only when user triggers capture):**
- Publicly visible note content (title, body, tags, images, public engagement counts) from pages the user actively visits
- The user's own creator-dashboard statistics when the user visits their own dashboard

**What we do NOT collect:**
- Passwords, authentication tokens, private messages
- Browsing history or pages the user did not explicitly visit
- Any content from third-party users the extension does not have on-screen access to

**Where the data goes:**
- **Default**: stored locally in Chrome's `storage.local`
- **Optional cloud sync**: uploaded to Supabase only when the user enables backup
- **Optional AI analysis**: an aggregated summary (not raw notes) is sent to a user-configured AI provider only when the user triggers an AI feature

---

## 关键词 / 标签

content creator, creator tools, note export, content export, content research, data export, productivity, analytics, content library, AI analysis, CSV export, cross-device sync

## 隐私政策 URL
https://xhs-claw-studio.pages.dev/privacy

---

## 截图清单（1280×800 PNG）

位于 `docs/screenshots/store/`：
1. `store-01-capture.png` — 扩展弹窗 + 设置项 + 开始导出
2. `store-02-dashboard.png` — 单博主分析看板
3. `store-03-insights.png` — 深度洞察（热力图 + ROI）
4. `store-04-library.png` — 素材库全文搜索
5. `store-05-ai.png` — AI 分析报告
