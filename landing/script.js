document.documentElement.classList.add('js');

const I18N = {
  en: {
    meta: {
      landing: {
        title: 'HongShu Claw | Open-source XiaoHongShu export and lightweight analysis',
        description: 'HongShu Claw is an open-source Chrome extension for exporting public XiaoHongShu notes and running lightweight analysis.',
        ogTitle: 'HongShu Claw | Open-source XiaoHongShu export and lightweight analysis',
        ogDescription: 'Export public XiaoHongShu notes, keep structured fields, and review them in a lightweight dashboard.',
        twitterTitle: 'HongShu Claw | Open-source XiaoHongShu export and lightweight analysis',
        twitterDescription: 'A lightweight Chrome extension for XiaoHongShu export, competitor research, and content review.',
        locale: 'en_US'
      },
      privacy: {
        title: 'HongShu Claw Privacy Policy',
        description: 'Privacy policy for HongShu Claw, explaining how the extension handles public XiaoHongShu data, local storage, and optional cloud sync.',
        ogTitle: 'HongShu Claw Privacy Policy',
        ogDescription: 'Learn how HongShu Claw handles public page data, browser storage, and optional cloud sync.',
        locale: 'en_US'
      }
    },
    landing: {
      'nav.why': 'Why it matters',
      'nav.features': 'Features',
      'nav.install': 'Install',
      'nav.release': 'Release',
      'nav.faq': 'FAQ',
      'cta.install': 'Install',
      'hero.title': 'Export public XiaoHongShu notes without buying a heavy platform.',
      'hero.lead': 'HongShu Claw is built for one practical job: export public posts faster, keep structured fields, and continue with lightweight analysis.',
      'hero.primary': 'See install steps',
      'hero.secondary': 'Open GitHub',
      'hero.point1': 'Batch export any public profile',
      'hero.point2': 'Keep title, body, tags, images, and engagement',
      'hero.point3': 'Resume, cooldown, and export-ready workflow',
      'hero.point4': 'Open source and reviewable',
      'hero.metric1.label': 'Main outcome',
      'hero.metric1.value': 'Export one account into structured data',
      'hero.metric2.label': 'Core field groups',
      'hero.metric2.value': 'Title, body, tags, images, comments, engagement, and more',
      'hero.metric3.label': 'Best-fit users',
      'hero.metric3.value': 'Ops, competitor research, and content backup',
      'dashboard.headline': 'What you actually get',
      'dashboard.metric1.label': 'Captured notes',
      'dashboard.metric2.label': 'Export format',
      'dashboard.metric3.label': 'Next step',
      'dashboard.metric3.value': 'Dashboard',
      'dashboard.chart': 'Top-content distribution',
      'dashboard.bar1': 'Review template',
      'dashboard.bar2': 'Workspace upgrade',
      'dashboard.bar3': 'Competitor teardown',
      'dashboard.bar4': 'Topic list',
      'dashboard.tag1': '#ExportBody',
      'dashboard.tag2': '#CompetitorResearch',
      'dashboard.tag3': '#OpsReview',
      'dashboard.tag4': '#ContentBackup',
      'sample.title': 'Export sample',
      'sample.code': 'title,likes,collects,comments,tags,image_count,publish_time\nHow I review breakout posts,982,510,41,#ops-review #content-analysis,5,2026-03-12\nWorkspace upgrade on a small budget,1260,441,38,#tools #workspace,7,2026-03-18\nThe fastest way to do competitor research,855,392,22,#competitor-research #planning,4,2026-03-21',
      'trust.1.title': 'Not a bloated platform',
      'trust.1.body': 'The product focuses on export and review, not a full heavy SaaS story.',
      'trust.2.title': 'Solve the valuable part first',
      'trust.2.body': 'Get public post data out first, then decide how deep you want to analyze it.',
      'trust.3.title': 'Public release, real scope',
      'trust.3.body': 'This site describes what the current open build really does, not a future fantasy roadmap.',
      'value.title': 'Most people do not need a giant platform. They just need structured export.',
      'value.lead': 'HongShu Claw sits between manual copy-paste and heavy paid tooling: simpler than scripts, lighter than platforms, and good enough to start working immediately.',
      'value.card1.title': 'Faster than manual copy-paste',
      'value.card1.body': 'Export structured results instead of opening and copying one post at a time.',
      'value.card2.title': 'Simpler than scripts',
      'value.card2.body': 'No Python setup, no deployment, no environment maintenance before you can start.',
      'value.card3.title': 'Lighter than big platforms',
      'value.card3.body': 'If export and lightweight review are enough, you do not need a full enterprise product.',
      'value.card4.title': 'Useful output, not just a demo',
      'value.card4.body': 'The result can go into Excel, Sheets, Python workflows, or the built-in dashboard and material library.',
      'features.title': 'The feature set stays focused on capture, export, and lightweight review.',
      'features.lead': 'The goal is not to win by feature count. It is to help people export one profile cleanly and keep working from there.',
      'features.card1.title': 'Batch profile capture',
      'features.card1.body': 'Open a public profile, collect note cards, and extract each detail page instead of only supporting single-post export.',
      'features.card2.title': 'Rich field export',
      'features.card2.body': 'Keep title, body, tags, images, publish time, and engagement in one structured result set.',
      'features.card3.title': 'Resume support',
      'features.card3.body': 'Long jobs can continue after interruption instead of restarting from scratch.',
      'features.card4.title': 'Delay and cooldown control',
      'features.card4.body': 'Pacing settings help batch jobs feel closer to real browsing behavior.',
      'features.card5.title': 'Built-in dashboard',
      'features.card5.body': 'Review top notes, engagement distribution, tags, and title patterns without leaving the extension.',
      'features.card6.title': 'Material library',
      'features.card6.body': 'Turn captured results into a searchable content bank for later reuse.',
      'screens.title': 'The workflow is already visible in the product, not hidden behind mockups.',
      'screens.card1.title': 'Popup capture entry',
      'screens.card1.body': 'Start a batch task from a public profile page and control pacing before export.',
      'screens.card2.title': 'Single creator dashboard',
      'screens.card2.body': 'Review top-performing notes, creator details, and export actions in one place.',
      'screens.card3.title': 'Material library',
      'screens.card3.body': 'Search and filter captured notes across multiple creators as a reusable reference bank.',
      'install.title': 'Install it, open a profile page, and start exporting.',
      'install.lead': 'The product should feel like a practical tool, not a training course. The shorter the path to the first useful export, the better.',
      'install.step1': 'Download the repository or release ZIP, then unzip it locally.',
      'install.step2': 'Open Chrome and go to chrome://extensions, then enable Developer mode.',
      'install.step3': 'Click Load unpacked and select the folder that contains manifest.json.',
      'install.step4': 'Open a public XiaoHongShu profile page, click the extension icon, and start your export task.',
      'install.action1': 'Open GitHub repository',
      'install.action2': 'Read privacy policy',
      'install.note': 'This public build is installed through Chrome developer mode for now. It does not require a server or account before first use.',
      'safety.card1.title': 'Works on public pages',
      'safety.card1.body': 'The extension is designed around public XiaoHongShu pages instead of account credential collection.',
      'safety.card2.title': 'Local by default',
      'safety.card2.body': 'Captured data stays in browser storage unless the user explicitly enables optional cloud sync.',
      'safety.card3.title': 'AI and cloud are optional',
      'safety.card3.body': 'AI analysis, dashboard import, and cloud sync sit on top of the export flow instead of blocking it.',
      'release.title': 'The current site describes a real public build, not an over-promised pricing page.',
      'release.lead': 'For now, the focus is the open-source release: installable, export-capable, and usable for lightweight review. Packaging and monetization can come later.',
      'release.card1.title': 'Public release',
      'release.card1.item1': 'Open repository',
      'release.card1.item2': 'Chrome developer mode install',
      'release.card1.item3': 'Batch capture, export, dashboard, and material library',
      'release.card1.item4': 'Best for validating fit before anything else',
      'release.card2.title': 'Possible enhanced build',
      'release.card2.item1': 'Clearer packaging and access control',
      'release.card2.item2': 'More stable sync and account binding',
      'release.card2.item3': 'More polished AI workflow',
      'release.card2.item4': 'Driven by real usage and feedback',
      'release.card3.title': 'What may come later',
      'release.card3.item1': 'Store listing and stronger install flow',
      'release.card3.item2': 'Sharper commercial packaging',
      'release.card3.item3': 'Broader documentation and onboarding',
      'release.card3.item4': 'Only after the current product proves itself',
      'faq.title': 'Answer the practical questions before people ask them.',
      'faq.q1': 'Who is HongShu Claw for?',
      'faq.a1': 'It fits XiaoHongShu operators, competitor researchers, content teams, and anyone who wants to export public content into a reusable dataset.',
      'faq.q2': 'Does it only export, or can it analyze too?',
      'faq.a2': 'It does both. Export is the main job, but the current public build also includes a dashboard, comparison views, and a material library.',
      'faq.q3': 'What fields are included in export?',
      'faq.a3': 'Typical fields include title, body text, tags, image links, likes, collects, comments, publish time, source URL, and related metadata.',
      'faq.q4': 'Does it upload data to the cloud by default?',
      'faq.a4': 'No. The product is local-first by default. Cloud sync is optional and only happens when the user explicitly enables it.',
      'faq.q5': 'Why is the site bilingual?',
      'faq.a5': 'The default experience is English for store review and broader accessibility, while Chinese remains available for the core user base.',
      'final.title': 'If you mainly need export and lightweight review, start with the open build.',
      'final.body': 'That is the most honest version of the product today: open, installable, and useful right away.',
      'final.primary': 'Open GitHub',
      'final.secondary': 'Read privacy policy',
      'footer.tagline': 'Open-source XiaoHongShu export and lightweight analysis.',
      'footer.home': 'Home',
      'footer.privacy': 'Privacy',
      'footer.install': 'Install',
      'footer.faq': 'FAQ'
    },
    privacy: {
      'privacy.brand': 'Privacy Policy',
      'privacy.back': 'Back home',
      'privacy.title': 'HongShu Claw Privacy Policy',
      'privacy.updated': 'Last updated: 2026-04-17',
      'privacy.s1.title': '1. Scope',
      'privacy.s1.body': 'This policy applies to the Chrome extension HongShu Claw and explains how it handles public XiaoHongShu data, local analysis data, and optional cloud sync.',
      'privacy.s2.title': '2. Data types the product may process',
      'privacy.s2.i1': 'Publicly visible note titles, body text, tags, image links, comments, and engagement metrics from pages the user actively opens.',
      'privacy.s2.i2': 'Export results, filters, analysis outputs, and local cache data generated inside the extension.',
      'privacy.s2.i3': 'Optional account and sync data when the user explicitly enables cloud sync or AI-related features.',
      'privacy.s3.title': '3. What we do not collect by default',
      'privacy.s3.i1': 'We do not collect or store the user\'s XiaoHongShu password.',
      'privacy.s3.i2': 'We do not intentionally access unrelated browsing content outside the extension\'s feature scope.',
      'privacy.s3.i3': 'We do not upload local content to the cloud unless the user explicitly enables optional sync features.',
      'privacy.s4.title': '4. How data is used',
      'privacy.s4.i1': 'To export public XiaoHongShu note content and engagement data.',
      'privacy.s4.i2': 'To generate local dashboards, lightweight analysis, filters, and material-library indexes.',
      'privacy.s4.i3': 'To support optional AI analysis and optional cloud sync when those features are actively used.',
      'privacy.s4.i4': 'To improve export stability, resume behavior, and product usability.',
      'privacy.s5.title': '5. Local storage and optional cloud sync',
      'privacy.s5.body1': 'By default, HongShu Claw uses browser-local storage. Exported results, analysis state, and local history are primarily stored inside the local browser environment.',
      'privacy.s5.body2': 'If the user explicitly signs in or enables cloud sync, related data may be uploaded to cloud infrastructure to support multi-device access and persistence.',
      'privacy.s6.title': '6. AI features',
      'privacy.s6.body': 'When the user actively uses AI reports or AI chat, the product may send the required summarized analysis context to the configured AI service provider. This is only done to complete the user-requested task.',
      'privacy.s7.title': '7. Third-party services',
      'privacy.s7.body': 'Certain features may rely on third-party services such as AI APIs, cloud databases, analytics providers, or future payment and licensing systems. Data is only shared with such services when the relevant feature is actively enabled or triggered by the user.',
      'privacy.s8.title': '8. Security and user control',
      'privacy.s8.body1': 'We try to follow reasonable technical measures such as local-first defaults, minimum permissions, and opt-in sync behavior. However, no networked or cloud-based service can guarantee absolute security.',
      'privacy.s8.body2': 'Users can control their data footprint by uninstalling the extension, clearing browser storage, removing local data, or disabling optional cloud sync and AI features.',
      'privacy.s9.title': '9. Policy updates',
      'privacy.s9.body': 'If this policy changes, the latest version will be published on this page. Continued use of HongShu Claw means you accept the latest published version.',
      'privacy.action1': 'Back to home',
      'privacy.action2': 'Open current page link',
      'privacy.footer': 'Open-source XiaoHongShu export and lightweight analysis.',
      'privacy.footerHome': 'Home',
      'privacy.footerPrivacy': 'Privacy'
    },
    units: { hours: 'hours' }
  },
  zh: {
    meta: {
      landing: {
        title: '红薯采集器｜开源的小红书笔记导出与轻量分析工具',
        description: '红薯采集器是一款开源、轻量的小红书笔记导出工具，适合竞品研究、运营复盘和内容备份。',
        ogTitle: '红薯采集器｜开源的小红书笔记导出与轻量分析工具',
        ogDescription: '批量导出小红书公开内容，保留结构化字段，并继续做轻量分析。',
        twitterTitle: '红薯采集器｜开源的小红书笔记导出与轻量分析工具',
        twitterDescription: '适合小红书导出、竞品研究和内容复盘的轻量 Chrome 扩展。',
        locale: 'zh_CN'
      },
      privacy: {
        title: '红薯采集器隐私政策',
        description: '红薯采集器隐私政策，说明扩展如何处理小红书公开内容、本地存储和可选云同步。',
        ogTitle: '红薯采集器隐私政策',
        ogDescription: '了解红薯采集器如何处理公开页面数据、浏览器本地存储和可选云同步。',
        locale: 'zh_CN'
      }
    },
    landing: {
      'nav.why': '为什么买',
      'nav.features': '功能',
      'nav.install': '安装',
      'nav.release': '版本',
      'nav.faq': 'FAQ',
      'cta.install': '安装使用',
      'hero.title': '导出小红书公开内容，不必先买一整套重平台。',
      'hero.lead': '红薯采集器专注做一件事：更快导出公开笔记，保留结构化字段，并顺手完成轻量分析。',
      'hero.primary': '查看安装方式',
      'hero.secondary': '打开 GitHub',
      'hero.point1': '批量导出任意公开主页',
      'hero.point2': '标题、正文、标签、图片、互动一起保留',
      'hero.point3': '断点续传、冷却和可持续工作流',
      'hero.point4': '开源可见，先用再说',
      'hero.metric1.label': '主打结果',
      'hero.metric1.value': '把一个账号导成结构化数据',
      'hero.metric2.label': '核心字段组',
      'hero.metric2.value': '标题、正文、标签、图片、评论、互动等',
      'hero.metric3.label': '典型用户',
      'hero.metric3.value': '运营、竞品研究、内容备份',
      'dashboard.headline': '你真正拿到的结果',
      'dashboard.metric1.label': '已抓取笔记',
      'dashboard.metric2.label': '导出格式',
      'dashboard.metric3.label': '继续复盘',
      'dashboard.metric3.value': '看板',
      'dashboard.chart': '爆款内容分布',
      'dashboard.bar1': '运营复盘模板',
      'dashboard.bar2': '预算工位改造',
      'dashboard.bar3': '竞品拆解方法',
      'dashboard.bar4': '选题清单',
      'dashboard.tag1': '#正文导出',
      'dashboard.tag2': '#竞品研究',
      'dashboard.tag3': '#运营复盘',
      'dashboard.tag4': '#内容备份',
      'sample.title': '导出样例',
      'sample.code': '标题,点赞,收藏,评论,标签,图片数,发布时间\n我怎么复盘爆款笔记,982,510,41,#运营复盘 #内容分析,5,2026-03-12\n预算 300 元的工位升级,1260,441,38,#效率工具 #工位改造,7,2026-03-18\n做竞品研究最省时间的方法,855,392,22,#竞品分析 #内容策划,4,2026-03-21',
      'trust.1.title': '不是大而全平台',
      'trust.1.body': '产品聚焦在导出和复盘，不把自己讲成一个笨重的 SaaS。',
      'trust.2.title': '先解决最值钱的部分',
      'trust.2.body': '先把公开内容导出来，再决定你要分析到多深。',
      'trust.3.title': '公开版先讲真实能力',
      'trust.3.body': '这页描述的是当前开源版本真的能做的事，不是未来路线图的幻想。',
      'value.title': '大多数人真正需要的，不是大平台，而是结构化导出。',
      'value.lead': '红薯采集器处在手动复制和重型付费工具之间：比脚本更简单，比平台更轻，也足够让你马上开始工作。',
      'value.card1.title': '比手动复制快很多',
      'value.card1.body': '不用一篇篇打开和复制，直接导出结构化结果。',
      'value.card2.title': '比脚本更简单',
      'value.card2.body': '不需要 Python、部署或环境维护，打开网页就能开始。',
      'value.card3.title': '比大平台更轻',
      'value.card3.body': '如果导出和轻量复盘已经够用，就没必要先买一整套重产品。',
      'value.card4.title': '结果可直接使用',
      'value.card4.body': '导出结果可以进入 Excel、Sheets、Python 流程，也可以继续进入内置看板和素材库。',
      'features.title': '功能只围绕抓取、导出和轻量复盘展开。',
      'features.lead': '目标不是比功能数，而是让用户把一个账号干净地导出来，并顺手接上后续工作。',
      'features.card1.title': '主页批量抓取',
      'features.card1.body': '打开公开主页，收集笔记卡片并逐篇提取详情，而不是只能导单篇。',
      'features.card2.title': '丰富字段导出',
      'features.card2.body': '标题、正文、标签、图片、发布时间和互动数据都保留在一个结构化结果中。',
      'features.card3.title': '断点续传',
      'features.card3.body': '长任务中断后可以继续，不必从头开始。',
      'features.card4.title': '延时与冷却控制',
      'features.card4.body': '抓取节奏更接近真实浏览方式，更适合中长任务。',
      'features.card5.title': '内置分析看板',
      'features.card5.body': '直接看 Top 内容、互动分布、标签和标题规律，不必离开扩展。',
      'features.card6.title': '素材库',
      'features.card6.body': '把抓取结果沉淀成可搜索的内容库，便于后续复用。',
      'screens.title': '这条工作流已经真实存在于产品里，不是只靠 mockup 讲故事。',
      'screens.card1.title': 'Popup 抓取入口',
      'screens.card1.body': '在公开主页上发起批量任务，并在导出前控制抓取节奏。',
      'screens.card2.title': '单博主分析看板',
      'screens.card2.body': '在一个页面里查看高表现内容、账号信息和导出动作。',
      'screens.card3.title': '素材库',
      'screens.card3.body': '跨多个博主搜索和筛选抓取结果，形成可复用的素材参考库。',
      'install.title': '装好之后，打开主页，直接开始导出。',
      'install.lead': '这个产品应该像一个实用工具，而不是培训课程。越快拿到第一份有用结果越好。',
      'install.step1': '下载仓库代码或 release ZIP，并先在本地解压。',
      'install.step2': '打开 Chrome，进入 chrome://extensions，并开启开发者模式。',
      'install.step3': '点击“加载已解压的扩展程序”，选择包含 manifest.json 的文件夹。',
      'install.step4': '打开任意小红书公开主页，点击扩展图标，开始导出任务。',
      'install.action1': '打开 GitHub 仓库',
      'install.action2': '查看隐私政策',
      'install.note': '当前公开版通过 Chrome 开发者模式安装，不需要服务器，也不要求先注册账号。',
      'safety.card1.title': '面向公开页面工作',
      'safety.card1.body': '扩展围绕公开可见的小红书页面工作，不走账号凭证收集路线。',
      'safety.card2.title': '默认本地优先',
      'safety.card2.body': '抓取数据默认留在浏览器本地，只有用户主动开启可选云同步时才会上云。',
      'safety.card3.title': 'AI 和云同步都是可选层',
      'safety.card3.body': 'AI 分析、后台导入和云同步都建立在导出链路之上，而不是先拦住主流程。',
      'release.title': '当前页面描述的是一个真实可用的公开版，而不是夸大的价格页。',
      'release.lead': '现阶段重点是开源公开版：能安装、能导出、能做轻量复盘。后续包装和商业化可以再做。',
      'release.card1.title': '公开版本',
      'release.card1.item1': '仓库公开可见',
      'release.card1.item2': 'Chrome 开发者模式安装',
      'release.card1.item3': '批量抓取、导出、看板和素材库',
      'release.card1.item4': '适合先验证它是不是你要的工具',
      'release.card2.title': '可能的增强版',
      'release.card2.item1': '更明确的版本分层和权限控制',
      'release.card2.item2': '更稳定的同步和账号绑定',
      'release.card2.item3': '更完整的 AI 工作流',
      'release.card2.item4': '基于真实使用和反馈推进',
      'release.card3.title': '后续可能演进',
      'release.card3.item1': '商店上架和更顺滑的安装流程',
      'release.card3.item2': '更明确的商业包装',
      'release.card3.item3': '更完整的文档和引导',
      'release.card3.item4': '前提是当前产品先证明自己',
      'faq.title': '先把用户真正会问的问题讲清楚。',
      'faq.q1': '红薯采集器适合谁？',
      'faq.a1': '适合小红书运营、竞品研究者、内容团队，以及任何想把公开内容导成可复用数据集的人。',
      'faq.q2': '它只有导出功能，还是也能分析？',
      'faq.a2': '两者都有。导出是主任务，但当前公开版也包含看板、对比视图和素材库。',
      'faq.q3': '导出里包含哪些字段？',
      'faq.a3': '通常包括标题、正文、标签、图片链接、点赞、收藏、评论、发布时间、原文链接和相关元数据。',
      'faq.q4': '会默认把数据上传到云端吗？',
      'faq.a4': '不会。产品默认本地优先。云同步是可选能力，只有用户主动开启时才会发生。',
      'faq.q5': '为什么要做双语？',
      'faq.a5': '默认英文是为了更适合商店审核和更广泛访问，同时保留中文切换，服务核心用户群。',
      'final.title': '如果你主要要的是导出和轻量复盘，就先从公开版开始。',
      'final.body': '这是当前最诚实的产品形态：开源、可安装、并且马上有用。',
      'final.primary': '打开 GitHub',
      'final.secondary': '查看隐私政策',
      'footer.tagline': '开源的小红书笔记导出与轻量分析工具。',
      'footer.home': '首页',
      'footer.privacy': '隐私',
      'footer.install': '安装',
      'footer.faq': 'FAQ'
    },
    privacy: {
      'privacy.brand': '隐私政策',
      'privacy.back': '返回首页',
      'privacy.title': '红薯采集器隐私政策',
      'privacy.updated': '最后更新：2026-04-17',
      'privacy.s1.title': '1. 适用范围',
      'privacy.s1.body': '本政策适用于 Chrome 扩展“红薯采集器”，用于说明产品如何处理小红书公开数据、本地分析数据以及可选云同步。',
      'privacy.s2.title': '2. 产品可能处理的数据类型',
      'privacy.s2.i1': '用户主动打开的公开页面中的笔记标题、正文、标签、图片链接、评论与互动数据。',
      'privacy.s2.i2': '扩展内部生成的导出结果、筛选条件、分析结果和本地缓存数据。',
      'privacy.s2.i3': '当用户主动启用云同步或 AI 功能时，相关账号信息和同步数据。',
      'privacy.s3.title': '3. 默认不会收集的内容',
      'privacy.s3.i1': '不会收集或存储用户的小红书密码。',
      'privacy.s3.i2': '不会主动访问与本扩展功能无关的浏览内容。',
      'privacy.s3.i3': '不会在未经用户主动开启的情况下将本地内容上传到云端。',
      'privacy.s4.title': '4. 数据如何使用',
      'privacy.s4.i1': '用于导出小红书公开笔记内容和互动数据。',
      'privacy.s4.i2': '用于生成本地看板、轻量分析、筛选结果和素材库索引。',
      'privacy.s4.i3': '用于在用户主动使用时支持 AI 分析和可选云同步。',
      'privacy.s4.i4': '用于提升导出稳定性、续传体验和产品可用性。',
      'privacy.s5.title': '5. 本地存储与可选云同步',
      'privacy.s5.body1': '默认情况下，红薯采集器主要使用浏览器本地存储。导出结果、分析状态和本地历史记录主要保存在本地浏览器环境中。',
      'privacy.s5.body2': '如果用户主动登录或启用云同步，与同步相关的数据可能会上传到云基础设施，以支持多设备访问和持久化。',
      'privacy.s6.title': '6. AI 功能',
      'privacy.s6.body': '当用户主动使用 AI 报告或 AI 对话时，产品可能会将完成该任务所需的摘要数据发送给已配置的 AI 服务提供商。',
      'privacy.s7.title': '7. 第三方服务',
      'privacy.s7.body': '部分功能可能依赖第三方服务，例如 AI API、云数据库、分析服务或未来的支付与授权系统。只有在相关功能被用户主动启用时，才会发生必要的数据交互。',
      'privacy.s8.title': '8. 安全与用户控制',
      'privacy.s8.body1': '我们会尽量采用本地优先、最小权限和按需同步等合理措施，但任何网络或云服务都无法保证绝对安全。',
      'privacy.s8.body2': '用户可以通过卸载扩展、清除浏览器存储、删除本地数据，或关闭云同步与 AI 功能来控制自己的数据范围。',
      'privacy.s9.title': '9. 政策更新',
      'privacy.s9.body': '如果本政策发生变化，最新版本会发布在本页面。继续使用红薯采集器，即表示你接受最新公布的政策版本。',
      'privacy.action1': '返回首页',
      'privacy.action2': '打开当前页面链接',
      'privacy.footer': '开源的小红书笔记导出与轻量分析工具。',
      'privacy.footerHome': '首页',
      'privacy.footerPrivacy': '隐私'
    },
    units: { hours: '小时' }
  }
};

const STORAGE_KEY = 'xhs-claw-lang';
const page = document.body.dataset.page;

function getCurrentLanguage() {
  const saved = localStorage.getItem(STORAGE_KEY);
  return saved === 'zh' ? 'zh' : 'en';
}

function setMeta(lang) {
  const meta = I18N[lang]?.meta?.[page];
  if (!meta) return;
  document.title = meta.title;
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';

  const set = (selector, value, attr = 'content') => {
    const node = document.querySelector(selector);
    if (node && value) node.setAttribute(attr, value);
  };

  set('meta[name="description"]', meta.description);
  set('meta[property="og:title"]', meta.ogTitle);
  set('meta[property="og:description"]', meta.ogDescription);
  set('meta[name="twitter:title"]', meta.twitterTitle || meta.ogTitle);
  set('meta[name="twitter:description"]', meta.twitterDescription || meta.ogDescription);
  set('meta[property="og:locale"]', meta.locale);
}

function applyTranslations(lang) {
  const dict = I18N[lang]?.[page];
  if (!dict) return;

  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.dataset.i18n;
    if (dict[key] !== undefined) node.textContent = dict[key];
  });

  document.querySelectorAll('[data-i18n-html]').forEach((node) => {
    const key = node.dataset.i18nHtml;
    if (dict[key] !== undefined) node.innerHTML = dict[key];
  });

  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.lang === lang);
  });

  setMeta(lang);
}

function setLanguage(lang) {
  localStorage.setItem(STORAGE_KEY, lang);
  applyTranslations(lang);
  updateCalculator(lang);
}

const revealNodes = document.querySelectorAll('.reveal-up');

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-visible');
      revealObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.14 }
);

revealNodes.forEach((node) => revealObserver.observe(node));

const counters = document.querySelectorAll('[data-counter]');
const counterObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;

      const target = Number(entry.target.dataset.counter || 0);
      const start = performance.now();
      const duration = 1200;

      const tick = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        entry.target.textContent = String(Math.round(target * eased));
        if (progress < 1) requestAnimationFrame(tick);
      };

      requestAnimationFrame(tick);
      counterObserver.unobserve(entry.target);
    });
  },
  { threshold: 0.45 }
);

counters.forEach((counter) => counterObserver.observe(counter));

const noteRange = document.getElementById('note-range');
const rangeValue = document.getElementById('note-range-value');
const manualTime = document.getElementById('manual-time');
const toolTime = document.getElementById('tool-time');
const savedTime = document.getElementById('saved-time');

function updateCalculator(lang = getCurrentLanguage()) {
  if (noteRange && rangeValue && manualTime && toolTime && savedTime) {
    const notes = Number(noteRange.value);
    const manualMinutes = notes * 7;
    const toolMinutes = notes * 1.35;
    const savedMinutes = Math.max(manualMinutes - toolMinutes, 0);
    const unit = I18N[lang]?.units?.hours || 'hours';
    const toHours = (minutes) => `${(minutes / 60).toFixed(1)} ${unit}`;

    rangeValue.textContent = String(notes);
    manualTime.textContent = toHours(manualMinutes);
    toolTime.textContent = toHours(toolMinutes);
    savedTime.textContent = toHours(savedMinutes);
  }
}

if (noteRange && rangeValue && manualTime && toolTime && savedTime) {
  noteRange.addEventListener('input', () => updateCalculator(getCurrentLanguage()));
}

document.querySelectorAll('.lang-btn').forEach((btn) => {
  btn.addEventListener('click', () => setLanguage(btn.dataset.lang === 'zh' ? 'zh' : 'en'));
});

applyTranslations(getCurrentLanguage());
updateCalculator(getCurrentLanguage());
