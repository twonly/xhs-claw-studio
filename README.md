# 红薯采集器

> ⚠️ 本项目仅供学习交流使用，禁止任何商业化行为。请遵守目标平台规则与当地法律法规，禁止将本项目用于非法采集、侵权或其他违规用途。

**更轻、更便宜的小红书笔记导出工具。**

红薯采集器是一个 Chrome 扩展，专注做一件事：  
**把小红书公开内容更快导出来，并顺手完成基础分析。**

如果你只是想：
- 导出某个博主的全部公开笔记
- 做竞品研究、内容拆解、选题整理
- 保存标题、正文、标签、图片和互动数据
- 看一眼哪些内容表现更好

那「红薯采集器」把流程压到最短：

**打开博主主页 → 批量抓取 → 导出 CSV / JSON（可选） → 进入Web分析看板**

无需服务器。无需账号。默认纯本地运行。  
云同步、AI 分析、创作者后台导入都是可选能力，不打断主流程。

---

## 安装方式

把这个仓库发给你的 coding agent（Claude Code、Codex 等），然后说一声：

**`install this`**

```txt
https://github.com/twonly/xhs-claw-studio
```

它会带你完成安装，通常 1 分钟内能搞定。

## Manual Setup

**1. Clone the repo**

```bash
git clone https://github.com/twonly/xhs-claw-studio.git
```

**2. 安装 Chrome 插件**

1. 打开 Chrome，进入 `chrome://extensions`
2. 打开右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择这个仓库根目录（包含 `manifest.json` 的文件夹）

**3. 打开任意博主首页**

打开任意小红书博主主页，点击插件图标开始抓取。

---

## Features

- **批量抓取任意博主公开笔记** 标题、正文、标签、图片、互动数据、发布时间
- **单篇导出** 在笔记详情页可直接抓当前内容
- **断点续传** 中断后可以继续抓，不需要从头再来
- **延时与分段控制** 支持设置冷却区间，降低连续抓取风险
- **CSV / JSON 导出** 既能喂给分析工具，也能保留完整原始数据
- **分析看板** 看 Top 内容、互动分布、标签与标题规律
- **多博主对比** 横向比较不同账号的内容和互动表现
- **素材库** 把抓过的内容统一搜索、筛选、导出
- **创作者后台导入** 可补充曝光、CTR、涨粉等更深指标
- **AI 深度分析** 支持接入你自己的 API Key 生成总结与问答
- **可选云同步** 可上传到 Supabase，在多设备之间同步
- **100% 本地优先** 默认数据保存在 `chrome.storage.local`

---

## How it works

```txt
打开小红书博主主页
  → 点击「批量抓取笔记内容」
  → 插件逐页抓取标题、正文、标签、图片、互动数据
  → 抓完直接导出 CSV / JSON
  → 或点击「数据分析」进入看板
  → 查看 Top 内容、互动分布、多博主对比、素材库
  → 可选：导入创作者后台数据
  → 可选：配置 API Key 做 AI 深度分析
```

整个流程都跑在 Chrome 扩展里。  
默认不依赖外部服务器，不要求注册登录。  
如果你需要跨设备同步，再单独开启云同步即可。

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

| Popup / 批量抓取 | 抓取结果 / 操作区 |
|:---:|:---:|
| ![Popup](docs/screenshots/01-popup-batch-capture.png) | ![Capture Actions](docs/screenshots/02-capture-result-actions.png) |

| 单博主分析看板 | 多博主对比 |
|:---:|:---:|
| ![Dashboard](docs/screenshots/03-single-blogger-dashboard.png) | ![Comparison](docs/screenshots/04-multi-blogger-comparison.png) |

| 素材库 | AI 深度分析 |
|:---:|:---:|
| ![Library](docs/screenshots/05-material-library.png) | ![AI Analysis](docs/screenshots/06-ai-analysis-and-chat.png) |

---

## License

MIT
