// Popup UI 逻辑 - 三种模式：创作平台 / 单篇笔记 / 个人主页批量

let cachedNotes = [];
let activeTabId = null;
let currentMode = null; // 'creator' | 'note' | 'profile'
let lastBloggerUserId = null; // 最近抓取的博主 ID
let scrapeStartAt = 0;  // 抓取开始时间戳，用于 duration_ms

// DOM 元素
const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const btnStart = document.getElementById('btn-start');
const btnStop = document.getElementById('btn-stop');
const btnCsv = document.getElementById('btn-csv');
const btnJson = document.getElementById('btn-json');
const btnAnalysis = document.getElementById('btn-analysis');
const btnUpload = document.getElementById('btn-upload');
const progressSection = document.getElementById('progress-section');
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const downloadSection = document.getElementById('download-section');
const resultsSection = document.getElementById('results-section');
const statsDiv = document.getElementById('stats');
const previewDiv = document.getElementById('preview');
const settingsDiv = document.getElementById('settings');
const batchSettingsDiv = document.getElementById('batch-settings');
const footerText = document.getElementById('footer-text');
const btnExampleProfile = document.getElementById('btn-example-profile');
const resumeSection = document.getElementById('resume-section');
const resumeText = document.getElementById('resume-text');
const btnResume = document.getElementById('btn-resume');
const btnClearSaved = document.getElementById('btn-clear-saved');
const btnDownloadSaved = document.getElementById('btn-download-saved');
const cloudUploadPanel = document.getElementById('cloud-upload-panel');
const cloudUploadSubtitle = document.getElementById('cloud-upload-subtitle');
const cloudAuthBox = document.getElementById('cloud-auth');
const cloudMsg = document.getElementById('cloud-upload-msg');
const cloudSignoutBtn = document.getElementById('cloud-signout');
const cloudSubmitBtn = document.getElementById('cloud-submit');
const cloudEmailInput = document.getElementById('cloud-email');
const cloudPasswordInput = document.getElementById('cloud-password');

let pendingCloudUpload = false;
let cloudAuthTab = 'signin';
const AUTHOR_PROFILE_URL = 'https://www.xiaohongshu.com/user/profile/6467b1210000000010027a51';

// ========== 初始化 ==========

async function init() {
  // 数据迁移（v2.2 → v2.3）
  await DATA_STORE.migrateIfNeeded();
  initCloudUploadPanel();

  applyFeatureGates();

  // 加载最近抓取记录
  await loadRecentScrapes();

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { setStatus('error', '无法获取当前标签页'); return; }
  activeTabId = tab.id;

  if (tab.url && tab.url.includes('creator.xiaohongshu.com/statistics')) {
    currentMode = 'creator';
    initCreatorMode();
  } else if (tab.url && tab.url.match(/xiaohongshu\.com\/user\/profile\/[a-f0-9]+/)) {
    currentMode = 'profile';
    initProfileMode();
  } else if (tab.url && tab.url.match(/xiaohongshu\.com\/(explore|discovery\/item)\//)) {
    currentMode = 'note';
    initNoteMode();
  } else {
    setStatus('error', '请打开小红书笔记详情页或个人主页，或点击下方示例主页');
    btnStart.textContent = '不支持当前页面';
    footerText.textContent = '也可以直接点示例主页，跳转到作者主页开始体验';
  }

  // 埋点：每次打开 popup
  ANALYTICS.track('session_start', {
    mode: currentMode || 'unsupported',
  });

  // 新用户引导：首次打开 popup 且处于支持的页面时启动
  setTimeout(() => startPopupOnboarding(), 400);
}

// ========== 新用户引导 ==========

function buildPopupOnboardSteps() {
  const steps = [
    {
      selector: '.header',
      title: '欢迎使用红薯采集器',
      content: '一键抓取并分析小红书笔记数据，支持单篇 / 批量 / 创作后台三种模式。<br>整个引导共 <strong>5 步</strong>，约 30 秒。',
      position: 'bottom',
    },
    {
      selector: '.url-input-section',
      title: '①  粘贴博主链接',
      content: '把小红书博主主页的 URL 粘到这里，点 <strong>前往</strong> 即可自动打开并进入批量模式。也可以直接在小红书页面上打开本插件。',
      position: 'bottom',
    },
    {
      selector: '#status-bar',
      title: '②  查看页面状态',
      content: '插件会自动识别当前是 <strong>博主主页 / 笔记详情 / 创作后台</strong>，并在这里显示状态。',
      position: 'bottom',
    },
    {
      selector: '#btn-start',
      title: '③  开始抓取',
      content: '确认无误后点击 <strong>开始导出</strong>。抓取过程中请保持此窗口打开，支持断点续传。',
      position: 'top',
    },
    {
      selector: '#btn-analysis',
      title: '④  进入数据分析',
      content: '抓完后点 <strong>数据分析</strong> 进入看板，可查看多维度统计、导入创作后台数据、AI 生成报告等。',
      position: 'top',
    },
  ];
  return steps;
}

async function startPopupOnboarding() {
  if (typeof ONBOARDING === 'undefined') return;
  const done = await ONBOARDING.isDone('popup');
  if (done) return;
  ONBOARDING.start({
    key: 'popup',
    compact: true,
    steps: buildPopupOnboardSteps(),
  });
}

// ========== 功能门控 ==========

function applyFeatureGates() {
  // v3.0: 所有功能免费开放，仅检查博主数据以启用分析按钮
  if (btnAnalysis) {
    DATA_STORE.getBloggerIndex().then(index => {
      if (index.length > 0) btnAnalysis.disabled = false;
    });
  }
}

// ========== 创作平台模式 ==========

async function initCreatorMode() {
  settingsDiv.classList.remove('hidden');
  btnStart.textContent = '开始导出';

  try {
    const status = await sendToContentWithRetry({ action: 'getStatus' }, 'content/content.js');
    if (!status) { setStatus('error', '页面加载中，请稍后重试'); return; }
    if (!status.hasData) { setStatus('error', '未检测到数据表格，请确认已登录'); return; }
    if (status.isCrawling) { setStatus('crawling', '正在抓取中...'); showCrawlingUI(); return; }

    const pageHint = status.detectedPages > 1 ? `，检测到 ${status.detectedPages} 页` : '';
    setStatus('ready', `创作平台模式${pageHint}`);
    btnStart.disabled = false;
    if (status.detectedPages > 1) {
      document.getElementById('max-pages').placeholder = `自动检测: ${status.detectedPages}`;
    }
  } catch (e) { setStatus('error', '无法连接，请刷新页面'); }
}

// ========== 单篇笔记模式 ==========

async function initNoteMode() {
  btnStart.textContent = '抓取本篇内容';

  try {
    const status = await sendToContentWithRetry({ action: 'getStatus' }, 'content/note-scraper.js');
    if (!status || !status.isNotePage) { setStatus('error', '未检测到笔记内容，请确认页面已加载'); return; }

    if (status.hasCachedResult) {
      const results = await sendToContent({ action: 'getResults' });
      if (results?.notes?.length > 0) { cachedNotes = results.notes; showNoteResult(cachedNotes[0]); return; }
    }

    setStatus('ready', `笔记详情模式 (ID: ${status.noteId})`);
    btnStart.disabled = false;
  } catch (e) { setStatus('error', '无法连接，请刷新页面'); }
}

// ========== 个人主页批量模式 ==========

async function initProfileMode() {
  batchSettingsDiv.classList.remove('hidden');
  btnStart.textContent = '批量抓取笔记内容';
  footerText.textContent = '批量抓取在当前页面进行，请勿关闭页面';

  try {
    const status = await sendToContentWithRetry({ action: 'getStatus' }, 'content/note-scraper.js');

    // 检查是否有正在进行的批量任务
    const batchStatus = await sendToContent({ action: 'getBatchStatus' });
    if (batchStatus?.isRunning) {
      const refreshToggle = document.getElementById('refresh-existing');
      if (refreshToggle) refreshToggle.checked = !!batchStatus.refreshExisting;
      showBatchProgress(batchStatus);
      return;
    }
    if (batchStatus?.scraped > 0 && !batchStatus.isRunning) {
      const refreshToggle = document.getElementById('refresh-existing');
      if (refreshToggle) refreshToggle.checked = !!batchStatus.refreshExisting;
      cachedNotes = batchStatus.results;
      // 救援保存：popup 在 chunk 冷却期间关闭 → batchComplete 无人接收 → blogger_${userId} 未写入
      // 这里检测到内存里有结果但 data-store 里没有，就补写一次
      const info = await getActiveProfileInfo();
      if (info?.userId) {
        await persistMergedProfileData(info);
      }
      await refreshCloudUploadPanel();
      showBatchResults(batchStatus);
      return;
    }

    // 检查存储中的断点续传记录
    const saved = await sendToContent({ action: 'getSavedBatch' });
    if (saved && saved.completedNoteIds?.length > 0) {
      const refreshToggle = document.getElementById('refresh-existing');
      if (refreshToggle) refreshToggle.checked = !!saved.refreshExisting;
      const completed = saved.completedNoteIds.length;
      const total = saved.totalCount || completed;
      const remaining = total - completed - (saved.errors?.length || 0);
      resumeText.textContent = `上次已抓取 ${completed}/${total} 篇${remaining > 0 ? `，剩余 ${remaining} 篇` : '（已完成）'}`;
      resumeSection.classList.remove('hidden');
      cachedNotes = saved.results || [];

      // 救援保存：持久化断点记录但 blogger_${userId} 未写入的情况（同上）
      const info = await getActiveProfileInfo();
      if (info?.userId && cachedNotes.length > 0) {
        await persistMergedProfileData(info);
      }
    }

    const noteCount = status?.noteCount || 0;
    setStatus('ready', `个人主页模式，当前可见 ${noteCount} 篇笔记`);
    btnStart.disabled = false;
    await refreshCloudUploadPanel();
  } catch (e) { setStatus('error', '无法连接，请刷新页面'); }
}

// ========== 消息通信 ==========

function sendToContent(message) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(activeTabId, message, response => {
      resolve(chrome.runtime.lastError ? null : response);
    });
  });
}

function sendToBackground(message) {
  return new Promise(resolve => {
    chrome.runtime.sendMessage(message, response => {
      resolve(chrome.runtime.lastError ? null : response);
    });
  });
}

async function injectContentScript(scriptFile) {
  try {
    await chrome.scripting.executeScript({ target: { tabId: activeTabId }, files: [scriptFile] });
    await new Promise(r => setTimeout(r, 300));
    return true;
  } catch (e) { return false; }
}

async function sendToContentWithRetry(message, scriptFile) {
  let response = await sendToContent(message);
  if (response) return response;
  const injected = await injectContentScript(scriptFile);
  if (!injected) return null;
  return await sendToContent(message);
}

// 监听进度消息
chrome.runtime.onMessage.addListener((message) => {
  switch (message.type) {
    case 'progress':
      updateProgress(message.currentPage, message.totalPages, message.noteCount);
      break;
    case 'complete':
      cachedNotes = message.notes;
      showCreatorResults(cachedNotes, message.stats);
      ANALYTICS.track('scrape_complete', {
        mode: 'creator',
        note_count: cachedNotes.length,
        duration_ms: scrapeStartAt ? Date.now() - scrapeStartAt : 0,
        error_count: 0,
      });
      break;
    case 'error':
      setStatus('error', message.message);
      showIdleUI();
      ANALYTICS.track('scrape_error', {
        mode: currentMode || 'unknown',
        error_type: (message.message || 'unknown').slice(0, 60),
        scraped_before_error: cachedNotes.length,
      });
      break;
    case 'batchProgress':
      updateBatchProgress(message);
      break;
    case 'batchChunkPause':
      setStatus('crawling', `防封冷却中...已完成 ${message.scraped}/${message.total}`);
      break;
    case 'batchCaptchaRequired':
      handleCaptchaRequired(message);
      ANALYTICS.track('scrape_error', {
        mode: 'profile',
        error_type: 'captcha_required',
        scraped_before_error: message.scraped || 0,
      });
      break;
    case 'batchComplete':
      cachedNotes = message.results;
      // 按博主保存到 data-store
      if (message.blogger?.userId) {
        DATA_STORE.saveBlogger(
          message.blogger.userId, message.blogger.nickname,
          message.blogger.avatar, message.blogger.profileUrl,
          message.results, message.blogger.stats || null
        ).then(() => loadRecentScrapes());
        lastBloggerUserId = message.blogger.userId;
      }
      refreshCloudUploadPanel().catch(() => {});
      showBatchResults(message);
      const bloggerAnalytics = buildBloggerAnalyticsProps({
        userId: message.blogger?.userId,
        nickname: message.blogger?.nickname,
        notes: message.results,
      });
      ANALYTICS.track('scrape_complete', {
        mode: 'profile',
        note_count: (message.newResults || message.results || []).length,
        error_count: (message.errors || []).length,
        skipped_existing: message.skippedExistingCount || 0,
        refresh_existing: !!message.refreshExisting,
        duration_ms: scrapeStartAt ? Date.now() - scrapeStartAt : 0,
        ...bloggerAnalytics,
      });
      break;
  }
});

// ========== UI 状态管理 ==========

function setStatus(type, text) {
  statusBar.className = `status-bar status-${type}`;
  statusText.textContent = text;
}

function showCrawlingUI() {
  btnStart.classList.add('hidden');
  btnStop.classList.remove('hidden');
  progressSection.classList.remove('hidden');
  downloadSection.classList.add('hidden');
  cloudUploadPanel?.classList.add('hidden');
  resultsSection.classList.add('hidden');
  settingsDiv.classList.add('hidden');
  batchSettingsDiv.classList.add('hidden');
}

function showIdleUI() {
  btnStart.classList.remove('hidden');
  btnStart.disabled = false;
  btnStop.classList.add('hidden');
  progressSection.classList.add('hidden');
  if (currentMode === 'creator') settingsDiv.classList.remove('hidden');
  if (currentMode === 'profile') batchSettingsDiv.classList.remove('hidden');
  refreshCloudUploadPanel().catch(() => {});
}

function updateProgress(currentPage, totalPages, noteCount) {
  const pct = Math.round((currentPage / totalPages) * 100);
  progressBar.style.width = pct + '%';
  progressText.textContent = `正在抓取第 ${currentPage} / ${totalPages} 页... 已获取 ${noteCount} 条数据`;
  setStatus('crawling', `抓取中 ${currentPage}/${totalPages}`);
}

function updateBatchProgress(msg) {
  const pct = msg.total > 0 ? Math.round((msg.current / msg.total) * 100) : 100;
  progressBar.style.width = pct + '%';
  const waitInfo = msg.waitMsg ? ` (${msg.waitMsg})` : '';
  progressText.textContent = `第 ${msg.current} / ${msg.total} 篇，已成功 ${msg.scraped} 篇，失败 ${msg.errors} 篇${waitInfo}`;
  setStatus('crawling', `批量 ${msg.current}/${msg.total}`);
}

function showBatchProgress(batchStatus) {
  showCrawlingUI();
  updateBatchProgress({
    current: batchStatus.currentIndex + 1,
    total: batchStatus.totalCount,
    scraped: batchStatus.scraped,
    errors: batchStatus.errors,
  });
  if (batchStatus.refreshExisting) {
    setStatus('crawling', `全量刷新 ${batchStatus.currentIndex + 1}/${batchStatus.totalCount || 0}`);
  }
}

// ========== 结果展示 ==========

function showCreatorResults(notes, stats) {
  setStatus('done', `完成，共 ${notes.length} 条数据`);
  btnStart.classList.remove('hidden'); btnStart.disabled = false;
  btnStop.classList.add('hidden'); progressSection.classList.add('hidden');
  settingsDiv.classList.remove('hidden');
  downloadSection.classList.remove('hidden'); resultsSection.classList.remove('hidden');

  const s = stats || {
    total: notes.length,
    totalViews: notes.reduce((sum, n) => sum + (n.views || 0), 0),
    totalLikes: notes.reduce((sum, n) => sum + (n.likes || 0), 0),
    totalCollects: notes.reduce((sum, n) => sum + (n.collects || 0), 0),
  };

  statsDiv.innerHTML = `
    <div class="stat-item"><div class="stat-value">${s.total}</div><div class="stat-label">笔记总数</div></div>
    <div class="stat-item"><div class="stat-value">${formatNum(s.totalViews || 0)}</div><div class="stat-label">总观看</div></div>
    <div class="stat-item"><div class="stat-value">${formatNum(s.totalLikes)}</div><div class="stat-label">总点赞</div></div>
    <div class="stat-item"><div class="stat-value">${formatNum(s.totalCollects)}</div><div class="stat-label">总收藏</div></div>
  `;
  previewDiv.innerHTML = notes.slice(0, 3).map(n => `
    <div class="preview-item"><span class="preview-title">${escapeHtml(n.title)}</span>
    <span class="preview-metrics">${n.likes || 0} 赞 / ${n.collects || 0} 藏</span></div>
  `).join('');
  refreshCloudUploadPanel().catch(() => {});
}

function showNoteResult(note) {
  setStatus('done', '抓取完成');
  btnStart.classList.remove('hidden'); btnStart.disabled = false;
  downloadSection.classList.remove('hidden'); resultsSection.classList.remove('hidden');

  const commentCount = note.commentCount || note.comments?.length || 0;
  statsDiv.innerHTML = `
    <div class="stat-item"><div class="stat-value">${note.likes}</div><div class="stat-label">点赞</div></div>
    <div class="stat-item"><div class="stat-value">${note.collects}</div><div class="stat-label">收藏</div></div>
    <div class="stat-item"><div class="stat-value">${commentCount}</div><div class="stat-label">评论</div></div>
    <div class="stat-item"><div class="stat-value">${note.imageCount}</div><div class="stat-label">图片</div></div>
  `;

  const contentPreview = (note.content || '').substring(0, 100);
  const tagsHtml = note.tags?.length > 0
    ? `<div class="preview-tags">${note.tags.map(t => `<span class="tag-chip">#${escapeHtml(t)}</span>`).join(' ')}</div>` : '';
  const commentsArr = Array.isArray(note.comments) ? note.comments : [];
  const commentsHtml = commentsArr.length > 0
    ? `<div style="margin-top:8px"><span style="font-size:11px;color:#999">评论 (${commentsArr.length}条):</span>
        ${commentsArr.slice(0, 3).map(c => `<div class="preview-item" style="flex-direction:column;align-items:flex-start;gap:2px">
          <span style="font-size:11px;font-weight:500">${escapeHtml(c.author)}${c.isAuthor ? ' <span style="color:#ff2442;font-size:10px">作者</span>' : ''}</span>
          <span style="font-size:11px;color:#666">${escapeHtml((c.content || '').substring(0, 80))}</span>
        </div>`).join('')}</div>` : '';

  previewDiv.innerHTML = `
    <div class="preview-item"><span class="preview-title" style="font-weight:600">${escapeHtml(note.title)}</span></div>
    ${contentPreview ? `<div class="preview-item"><span class="preview-title" style="color:#666">${escapeHtml(contentPreview)}${(note.content || '').length > 100 ? '...' : ''}</span></div>` : ''}
    ${tagsHtml}
    ${note.publishTime ? `<div class="preview-item"><span class="preview-metrics">${escapeHtml(note.publishTime)}</span></div>` : ''}
    ${commentsHtml}
  `;
  refreshCloudUploadPanel().catch(() => {});
}

function showBatchResults(msg) {
  const results = msg.results || cachedNotes;
  const newResults = msg.newResults || results;
  const errors = msg.errors || [];
  const total = msg.total || newResults.length;
  const skippedExisting = msg.skippedExistingCount || 0;
  const localTotal = msg.localTotal || results.length;
  const isRefresh = !!msg.refreshExisting;

  if (!isRefresh && total === 0 && skippedExisting > 0) {
    setStatus('done', `没有发现新笔记，已保留本地 ${localTotal} 篇数据`);
  } else if (isRefresh) {
    setStatus('done', `刷新完成：更新 ${newResults.length}/${total} 篇，${errors.length} 失败`);
  } else {
    setStatus('done', `批量完成：新增 ${newResults.length} 篇，跳过旧笔记 ${skippedExisting} 篇，${errors.length} 失败`);
  }
  btnStart.classList.remove('hidden'); btnStart.disabled = false;
  btnStop.classList.add('hidden'); progressSection.classList.add('hidden');
  batchSettingsDiv.classList.remove('hidden');
  downloadSection.classList.remove('hidden'); resultsSection.classList.remove('hidden');

  const totalLikes = results.reduce((s, n) => s + (n.likes || 0), 0);
  const totalCollects = results.reduce((s, n) => s + (n.collects || 0), 0);
  const totalComments = results.reduce((s, n) => s + (Array.isArray(n.comments) ? n.comments.length : 0), 0);
  const primaryLabel = isRefresh ? '本次刷新' : '本次新增';
  const primaryValue = total === 0 && skippedExisting > 0 && !isRefresh ? 0 : newResults.length;

  statsDiv.innerHTML = `
    <div class="stat-item"><div class="stat-value">${primaryValue}</div><div class="stat-label">${primaryLabel}</div></div>
    <div class="stat-item"><div class="stat-value">${localTotal}</div><div class="stat-label">本地总数</div></div>
    <div class="stat-item"><div class="stat-value">${formatNum(totalLikes)}</div><div class="stat-label">总点赞</div></div>
    <div class="stat-item"><div class="stat-value">${formatNum(totalCollects)}</div><div class="stat-label">总收藏</div></div>
    <div class="stat-item"><div class="stat-value">${totalComments}</div><div class="stat-label">总评论</div></div>
  `;

  previewDiv.innerHTML = results.slice(0, 5).map(n => `
    <div class="preview-item"><span class="preview-title">${escapeHtml(n.title)}</span>
    <span class="preview-metrics">${n.likes || 0} 赞 / ${n.collects || 0} 藏</span></div>
  `).join('') + (errors.length > 0 ? `<div style="margin-top:8px;font-size:11px;color:#ff4d4f">${errors.length} 篇失败：${errors.slice(0, 2).map(e => e.title || e.url).join('、')}${errors.length > 2 ? '...' : ''}</div>` : '');

  cachedNotes = results;
  refreshCloudUploadPanel().catch(() => {});
}

function handleCaptchaRequired(msg) {
  const captchaUrl = msg.captchaUrl || 'https://www.xiaohongshu.com/';
  const scraped = msg.scraped || 0;
  const remaining = msg.remaining || 0;
  setStatus('error', `已被人机验证拦截（已完成 ${scraped} 篇，剩余 ${remaining} 篇）`);
  btnStart.classList.remove('hidden'); btnStart.disabled = false;
  btnStop.classList.add('hidden'); progressSection.classList.add('hidden');
  batchSettingsDiv.classList.remove('hidden');
  resultsSection.classList.remove('hidden');

  // 用 previewDiv 区域显示验证引导，复用现有结果区域，避免改 HTML
  if (typeof previewDiv !== 'undefined' && previewDiv) {
    previewDiv.innerHTML = `
      <div style="padding:12px;background:#fff7e6;border:1px solid #ffd591;border-radius:6px;font-size:12px;line-height:1.6">
        <div style="color:#d46b08;font-weight:600;margin-bottom:6px">需要扫码验证</div>
        <div style="color:#666;margin-bottom:8px">小红书检测到批量行为，请点击下方按钮在新标签页完成验证（手机扫码），然后回到这里点 <b>"开始批量"</b> 自动续传剩余 ${remaining} 篇。</div>
        <button id="btn-open-captcha" style="background:#ff4d4f;color:#fff;border:0;padding:6px 14px;border-radius:4px;cursor:pointer;font-size:12px">打开验证页面</button>
      </div>`;
    const btn = document.getElementById('btn-open-captcha');
    if (btn) btn.addEventListener('click', () => {
      chrome.tabs.create({ url: captchaUrl });
    });
  }
}

// ========== CSV/JSON 生成 ==========

function generateCompatibleCSV(notes) {
  const headers = ['标题', '正文', '点赞数', '收藏数', '评论数', '发布时间', '分享数', '标签/话题', '图片数量', '图片链接', '评论内容'];
  const rows = notes.map(n => {
    const commentsArr = Array.isArray(n.comments) ? n.comments : [];
    return [
      csvEscape(n.title), csvEscape(n.content || ''),
      n.likes || 0, n.collects || 0,
      n.commentCount || commentsArr.length || 0,
      csvEscape(n.publish_time || n.publishTime || ''), 0,
      csvEscape(n.tags ? n.tags.map(t => '#' + t).join('') : ''),
      n.imageCount || n.images?.length || 0,
      csvEscape(n.images ? n.images.join(' | ') : ''),
      csvEscape(commentsArr.map(c => `${c.author}${c.isAuthor ? '(作者)' : ''}: ${c.content}`).join(' || ')),
    ];
  });
  return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

function generateFullCSV(notes) {
  if (currentMode === 'creator') {
    const headers = ['标题', '发布时间', '封面图', '曝光量', '观看数', '点击率', '点赞数', '评论数', '收藏数', '涨粉数', '抓取时间'];
    const rows = notes.map(n => [
      csvEscape(n.title), csvEscape(n.publish_time), csvEscape(n.cover_url),
      n.exposure || 0, n.views || 0, n.click_rate || 0,
      n.likes || 0, n.comments || 0, n.collects || 0, n.followers || 0, csvEscape(n.crawl_time),
    ]);
    return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  const headers = ['笔记ID', '标题', '正文', '标签', '点赞', '收藏', '评论数', '图片数', '图片链接', '评论内容', '作者', '发布时间', '笔记链接', '抓取时间'];
  const rows = notes.map(n => {
    const commentsArr = Array.isArray(n.comments) ? n.comments : [];
    return [
      csvEscape(n.noteId), csvEscape(n.title), csvEscape(n.content),
      csvEscape(n.tags ? n.tags.join(', ') : ''),
      n.likes || 0, n.collects || 0, n.commentCount || commentsArr.length || 0,
      n.imageCount || 0, csvEscape(n.images ? n.images.join(' | ') : ''),
      csvEscape(commentsArr.map(c => `${c.author}${c.isAuthor ? '(作者)' : ''}: ${c.content}`).join(' || ')),
      csvEscape(n.author?.nickname || ''), csvEscape(n.publishTime || ''),
      csvEscape(n.noteUrl || ''), csvEscape(n.crawlTime || ''),
    ];
  });
  return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

function generateJSON(notes) { return JSON.stringify(notes, null, 2); }

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  return (str.includes(',') || str.includes('"') || str.includes('\n'))
    ? '"' + str.replace(/"/g, '""') + '"' : str;
}

// ========== 下载 ==========

function downloadViaBackground(content, filename, mimeType) {
  chrome.runtime.sendMessage({ action: 'download', content, filename, mimeType });
}

function getTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
}

function formatNum(n) {
  if (n >= 10000) return (n / 10000).toFixed(1) + '万';
  return (n || 0).toLocaleString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function getBloggerNameFromNotes(notes = cachedNotes) {
  return notes?.[0]?.author?.nickname || '';
}

function buildBloggerAnalyticsProps(source = {}) {
  const props = {};
  const profileId = source.profileId || source.userId || lastBloggerUserId || '';
  const bloggerName = source.bloggerName || source.nickname || getBloggerNameFromNotes(source.notes);

  if (profileId) props.profile_id = profileId;
  if (bloggerName) props.blogger_name = bloggerName;

  return props;
}

async function getActiveProfileAnalyticsProps() {
  if (currentMode !== 'profile') return {};

  const info = await sendToContent({ action: 'getProfileInfo' });
  return buildBloggerAnalyticsProps({
    userId: info?.userId || '',
    nickname: getBloggerNameFromNotes(),
  });
}

async function getActiveProfileInfo() {
  if (currentMode !== 'profile') return null;
  return await sendToContent({ action: 'getProfileInfo' });
}

async function getMergedProfileData(preferredInfo = null) {
  const info = preferredInfo || await getActiveProfileInfo();
  if (!info?.userId) throw new Error('无法识别当前博主');

  const existing = await DATA_STORE.getBloggerData(info.userId);
  const mergedNotes = DATA_STORE.mergeNotes(existing?.notes || [], cachedNotes || []);
  if (!mergedNotes.length) throw new Error('当前没有可上传的数据');

  const latestNote = mergedNotes[mergedNotes.length - 1] || cachedNotes[0] || {};
  return {
    userId: info.userId,
    nickname: existing?.nickname || latestNote.author?.nickname || '',
    avatar: existing?.avatar || latestNote.author?.avatar || '',
    profileUrl: existing?.profileUrl || info.profileUrl || '',
    notes: mergedNotes,
    stats: info.stats || existing?.stats || null,
    scrapedAt: existing?.scrapedAt || Date.now(),
  };
}

async function persistMergedProfileData(preferredInfo = null) {
  const bloggerData = await getMergedProfileData(preferredInfo);
  await DATA_STORE.saveBlogger(
    bloggerData.userId,
    bloggerData.nickname,
    bloggerData.avatar,
    bloggerData.profileUrl,
    bloggerData.notes,
    bloggerData.stats,
  );
  lastBloggerUserId = bloggerData.userId;
  await loadRecentScrapes();
  return bloggerData;
}

function setCloudMessage(text = '', type = '') {
  if (!cloudMsg) return;
  cloudMsg.textContent = text;
  cloudMsg.className = type ? `cloud-upload-msg ${type}` : 'cloud-upload-msg';
}

function setCloudTab(tab) {
  cloudAuthTab = tab === 'signup' ? 'signup' : 'signin';
  cloudUploadPanel?.querySelectorAll('.cloud-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === cloudAuthTab);
  });
  if (cloudSubmitBtn) {
    cloudSubmitBtn.textContent = cloudAuthTab === 'signin' ? '登录' : '注册';
  }
}

async function refreshCloudUploadPanel(options = {}) {
  if (!cloudUploadPanel || typeof CLOUD_SYNC === 'undefined') return;

  const { forceOpen = false } = options;
  const supported = currentMode === 'profile';
  const info = supported ? await getActiveProfileInfo() : null;
  const existing = info?.userId ? await DATA_STORE.getBloggerData(info.userId) : null;
  const hasData = supported && (((existing?.notes?.length) || 0) > 0 || cachedNotes.length > 0);
  const session = await CLOUD_SYNC.getSession();
  const isLoggedIn = !!session?.access_token;

  btnUpload?.classList.toggle('hidden', !supported || !hasData);
  btnUpload.disabled = !supported || !hasData || typeof CLOUD_SYNC === 'undefined';

  cloudUploadPanel.classList.toggle('hidden', (!supported || !hasData) && !forceOpen);
  if (!supported || !hasData) return;

  cloudAuthBox.classList.toggle('hidden', isLoggedIn);
  cloudSignoutBtn.classList.toggle('hidden', !isLoggedIn);

  if (cloudUploadSubtitle) {
    if (isLoggedIn) {
      cloudUploadSubtitle.textContent = `已登录 ${session.user?.email || ''}，上传当前博主在本地的完整去重数据`;
    } else {
      cloudUploadSubtitle.textContent = '上传当前博主在本地的完整去重数据，未登录时会先完成认证';
    }
  }
}

async function uploadCurrentProfile() {
  if (currentMode !== 'profile') throw new Error('当前页面暂不支持上传');

  const info = await getActiveProfileInfo();
  const bloggerData = await persistMergedProfileData(info);
  const originalText = btnUpload.textContent;

  btnUpload.disabled = true;
  btnUpload.textContent = '上传中...';
  setCloudMessage('正在上传当前博主完整数据...', '');

  const startAt = Date.now();
  try {
    const result = await CLOUD_SYNC.syncBlogger(bloggerData);
    await chrome.storage.local.set({ cloudSyncLastAt: Date.now() });
    setCloudMessage(`上传成功：${result.noteCount} 篇笔记已同步到云端`, 'ok');
    ANALYTICS.track('cloud_sync_single_upload', {
      mode: 'popup',
      note_count: result.noteCount,
      skipped: result.skipped || 0,
      duration_ms: Date.now() - startAt,
      ...buildBloggerAnalyticsProps(bloggerData),
    });
  } finally {
    btnUpload.disabled = false;
    btnUpload.textContent = originalText;
    pendingCloudUpload = false;
    await refreshCloudUploadPanel({ forceOpen: true });
  }
}

function initCloudUploadPanel() {
  if (!cloudUploadPanel || typeof CLOUD_SYNC === 'undefined') return;

  setCloudTab('signin');
  setCloudMessage('');

  cloudUploadPanel.querySelectorAll('.cloud-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      setCloudTab(btn.dataset.tab);
      setCloudMessage('');
    });
  });

  cloudSubmitBtn?.addEventListener('click', async () => {
    const email = cloudEmailInput.value.trim();
    const password = cloudPasswordInput.value;
    if (!email || !password) {
      setCloudMessage('请输入邮箱和密码', 'err');
      return;
    }

    const originalText = cloudSubmitBtn.textContent;
    cloudSubmitBtn.disabled = true;
    cloudSubmitBtn.textContent = '处理中...';
    setCloudMessage('');

    try {
      if (cloudAuthTab === 'signin') {
        await CLOUD_SYNC.signIn(email, password);
        setCloudMessage('登录成功', 'ok');
      } else {
        const result = await CLOUD_SYNC.signUp(email, password);
        if (result.requiresConfirm) {
          setCloudMessage('注册成功，请先完成邮箱验证后再登录', 'warn');
          return;
        }
        setCloudMessage('注册成功并已登录', 'ok');
      }
      ANALYTICS.track('cloud_sync_auth', { action: cloudAuthTab, entry: 'popup' });
      await refreshCloudUploadPanel({ forceOpen: true });
      if (pendingCloudUpload) {
        await uploadCurrentProfile();
      }
    } catch (e) {
      setCloudMessage(e.message || '认证失败', 'err');
    } finally {
      cloudSubmitBtn.disabled = false;
      cloudSubmitBtn.textContent = originalText;
    }
  });

  cloudSignoutBtn?.addEventListener('click', async () => {
    await CLOUD_SYNC.signOut();
    pendingCloudUpload = false;
    setCloudMessage('已退出云端登录', '');
    await refreshCloudUploadPanel({ forceOpen: true });
  });
}

// ========== 事件绑定 ==========

btnStart.addEventListener('click', async () => {
  scrapeStartAt = Date.now();

  if (currentMode === 'note') {
    ANALYTICS.track('scrape_start', { mode: 'note' });
    btnStart.disabled = true;
    setStatus('crawling', '正在抓取笔记内容...');
    const result = await sendToContent({ action: 'scrapeNote' });
    if (result?.title) {
      cachedNotes = [result];
      showNoteResult(result);
      ANALYTICS.track('scrape_complete', {
        mode: 'note',
        note_count: 1,
        duration_ms: Date.now() - scrapeStartAt,
        error_count: 0,
      });
    } else {
      setStatus('error', '抓取失败');
      btnStart.disabled = false;
      ANALYTICS.track('scrape_error', {
        mode: 'note',
        error_type: 'no_result',
        scraped_before_error: 0,
      });
    }

  } else if (currentMode === 'profile') {
    // 批量模式：点击打开笔记弹窗 → 抓取 → 关闭 → 下一篇
    btnStart.disabled = true;
    const refreshExisting = !!document.getElementById('refresh-existing')?.checked;

    let limitInput = document.getElementById('batch-limit').value;
    let batchLimit = limitInput ? parseInt(limitInput) : 0;

    setStatus('crawling', '正在收集笔记列表...');
    progressSection.classList.remove('hidden');
    progressText.textContent = batchLimit
      ? `收集前 ${batchLimit} 篇笔记...`
      : '正在滚动页面加载所有笔记...';

    // 传入 batchLimit，数量足够时跳过滚动
    const result = await sendToContent({
      action: 'collectNotes', maxScrolls: 50, batchLimit: batchLimit || 0,
    });
    if (!result?.cards?.length) {
      setStatus('error', '未找到笔记，请确认在个人主页的「笔记」标签页');
      btnStart.disabled = false;
      return;
    }

    const cards = batchLimit ? result.cards.slice(0, batchLimit) : result.cards;
    const minDelay = (parseInt(document.getElementById('min-delay').value) || 3) * 1000;
    const maxDelay = (parseInt(document.getElementById('max-delay').value) || 8) * 1000;

    setStatus('crawling', refreshExisting
      ? `找到 ${cards.length} 篇笔记，开始全量刷新指标...`
      : `找到 ${cards.length} 篇笔记，开始增量抓取...`);
    showCrawlingUI();

    const chunkSize = parseInt(document.getElementById('chunk-size').value) || 20;
    const bloggerAnalytics = await getActiveProfileAnalyticsProps();

    ANALYTICS.track('scrape_start', {
      mode: 'profile',
      batch_limit: batchLimit || 0,
      chunk_size: chunkSize,
      card_count: cards.length,
      refresh_existing: refreshExisting,
      ...bloggerAnalytics,
    });

    // 发送给 content script（fetch 方式抓取，零点击零导航）
    resumeSection.classList.add('hidden');
    const res = await sendToContent({
      action: 'startBatchScrape', cards, minDelay, maxDelay, chunkSize, refreshExisting,
    });
    if (!res?.success) {
      setStatus('error', res?.reason || '启动失败');
      showIdleUI();
      const bloggerAnalytics = await getActiveProfileAnalyticsProps();
      ANALYTICS.track('scrape_error', {
        mode: 'profile',
        error_type: (res?.reason || 'start_failed').slice(0, 60),
        scraped_before_error: 0,
        ...bloggerAnalytics,
      });
    }

  } else {
    // 创作平台
    ANALYTICS.track('scrape_start', { mode: 'creator' });
    const maxPagesInput = document.getElementById('max-pages').value;
    const result = await sendToContent({ action: 'startCrawl', maxPages: maxPagesInput ? parseInt(maxPagesInput) : null });
    if (result?.success) { showCrawlingUI(); setStatus('crawling', '开始抓取...'); }
    else {
      setStatus('error', result?.reason || '启动失败');
      ANALYTICS.track('scrape_error', {
        mode: 'creator',
        error_type: (result?.reason || 'start_failed').slice(0, 60),
        scraped_before_error: 0,
      });
    }
  }
});

btnStop.addEventListener('click', async () => {
  if (currentMode === 'profile') {
    await sendToContent({ action: 'stopBatchScrape' });
  } else {
    await sendToContent({ action: 'stopCrawl' });
  }
  setStatus('ready', '已停止');
  showIdleUI();
});

btnCsv.addEventListener('click', async () => {
  if (cachedNotes.length === 0) return;
  const format = document.querySelector('input[name="format"]:checked')?.value || 'compatible';
  const csv = format === 'compatible' ? generateCompatibleCSV(cachedNotes) : generateFullCSV(cachedNotes);
  const ts = getTimestamp();
  const prefix = currentMode === 'profile' ? 'xhs_batch' : currentMode === 'note' ? 'xhs_note' : 'xhs_data';
  downloadViaBackground(csv, `${prefix}_${format}_${ts}.csv`, 'text/csv;charset=utf-8');
  const bloggerAnalytics = currentMode === 'profile' ? await getActiveProfileAnalyticsProps() : {};
  ANALYTICS.track('export_data', {
    format: format === 'compatible' ? 'csv_compatible' : 'csv_full',
    note_count: cachedNotes.length,
    mode: currentMode || 'unknown',
    ...bloggerAnalytics,
  });
});

btnJson.addEventListener('click', async () => {
  if (cachedNotes.length === 0) return;
  const ts = getTimestamp();
  const prefix = currentMode === 'profile' ? 'xhs_batch' : currentMode === 'note' ? 'xhs_note' : 'xhs_data';
  downloadViaBackground(generateJSON(cachedNotes), `${prefix}_${ts}.json`, 'application/json');
  const bloggerAnalytics = currentMode === 'profile' ? await getActiveProfileAnalyticsProps() : {};
  ANALYTICS.track('export_data', {
    format: 'json',
    note_count: cachedNotes.length,
    mode: currentMode || 'unknown',
    ...bloggerAnalytics,
  });
});

// ========== 断点续传按钮 ==========

btnResume.addEventListener('click', async () => {
  btnResume.disabled = true;
  setStatus('crawling', '正在收集笔记列表...');
  progressSection.classList.remove('hidden');
  resumeSection.classList.add('hidden');

  // 重新收集卡片（获取最新 token）
  const result = await sendToContent({ action: 'collectNotes', maxScrolls: 50 });
  if (!result?.cards?.length) {
    setStatus('error', '未找到笔记，请确认在个人主页');
    btnResume.disabled = false;
    resumeSection.classList.remove('hidden');
    return;
  }

  const minDelay = (parseInt(document.getElementById('min-delay').value) || 3) * 1000;
  const maxDelay = (parseInt(document.getElementById('max-delay').value) || 8) * 1000;
  const chunkSize = parseInt(document.getElementById('chunk-size').value) || 20;
  const refreshExisting = !!document.getElementById('refresh-existing')?.checked;

  setStatus('crawling', `继续抓取，共 ${result.cards.length} 篇...`);
  showCrawlingUI();

  const res = await sendToContent({
    action: 'startBatchScrape',
    cards: result.cards, minDelay, maxDelay, chunkSize, refreshExisting,
  });
  if (!res?.success) {
    setStatus('error', res?.reason || '启动失败');
    showIdleUI();
  }
});

btnClearSaved.addEventListener('click', async () => {
  await sendToContent({ action: 'clearSavedBatch' });
  resumeSection.classList.add('hidden');
  cachedNotes = [];
  setStatus('ready', '已清除记录');
});

btnDownloadSaved.addEventListener('click', () => {
  if (cachedNotes.length === 0) return;
  const format = document.querySelector('input[name="format"]:checked')?.value || 'compatible';
  const csv = format === 'compatible' ? generateCompatibleCSV(cachedNotes) : generateFullCSV(cachedNotes);
  const ts = getTimestamp();
  downloadViaBackground(csv, `xhs_batch_resume_${ts}.csv`, 'text/csv;charset=utf-8');
});

// ========== 数据分析 ==========

btnAnalysis.addEventListener('click', async () => {
  // 优先打开当前博主的详情页
  if (lastBloggerUserId) {
    chrome.tabs.create({ url: chrome.runtime.getURL(`analysis/analysis.html#detail=${lastBloggerUserId}`) });
    return;
  }
  // 尝试从当前页获取博主 ID
  if (cachedNotes.length > 0 && currentMode === 'profile') {
    const info = await sendToContent({ action: 'getProfileInfo' });
    if (info?.userId) {
      chrome.tabs.create({ url: chrome.runtime.getURL(`analysis/analysis.html#detail=${info.userId}`) });
      return;
    }
  }
  // 兜底：检查是否有任何博主数据
  const index = await DATA_STORE.getBloggerIndex();
  if (index.length === 0) {
    setStatus('error', '暂无数据，请先抓取笔记');
    return;
  }
  // 打开总览页
  chrome.tabs.create({ url: chrome.runtime.getURL('analysis/analysis.html') });
});

btnUpload?.addEventListener('click', async () => {
  if (currentMode !== 'profile') return;
  if (typeof CLOUD_SYNC === 'undefined') {
    setCloudMessage('当前版本未加载云同步模块', 'err');
    cloudUploadPanel?.classList.remove('hidden');
    return;
  }

  await refreshCloudUploadPanel({ forceOpen: true });
  const session = await CLOUD_SYNC.getSession();
  if (!session?.access_token) {
    pendingCloudUpload = true;
    setCloudMessage('请先登录云端账号，登录成功后会自动继续上传', 'warn');
    cloudUploadPanel?.classList.remove('hidden');
    return;
  }

  try {
    await uploadCurrentProfile();
  } catch (e) {
    setCloudMessage(e.message || '上传失败', 'err');
  }
});

// ========== AI 厂商 / 模型 / Key 管理 ==========

function populateModelSelect(provider, currentModel) {
  const sel = document.getElementById('ai-model');
  const customInput = document.getElementById('ai-custom-model');
  const customUrlRow = document.getElementById('ai-custom-url-row');
  const modelHint = document.getElementById('ai-model-hint');
  if (!sel) return;

  const info = AI_CATALOG.getProvider(provider);
  const recommendedModels = AI_CATALOG.getRecommendedModels(provider);
  sel.innerHTML = '';
  customInput.placeholder = AI_CATALOG.getCustomModelPlaceholder(provider);

  if (provider === 'custom') {
    sel.style.display = 'none';
    customUrlRow.style.display = '';
    if (modelHint) modelHint.textContent = '自定义厂商需要填写 API 地址和模型名；如地址已包含 /v1，可直接粘贴。';
  } else {
    sel.style.display = '';
    customUrlRow.style.display = 'none';
    if (modelHint) {
      modelHint.textContent = `已按 ${info.name} 官方文档整理推荐模型；若下拉里没有你要的型号，直接在下方填写模型名即可覆盖。`;
    }

    const knownIds = new Set(recommendedModels.map(item => item.id));
    if (currentModel && !knownIds.has(currentModel)) {
      const opt = document.createElement('option');
      opt.value = currentModel;
      opt.textContent = `${currentModel}（当前已保存）`;
      opt.selected = true;
      sel.appendChild(opt);
    }

    for (const item of recommendedModels) {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = item.label || item.id;
      if (item.id === currentModel) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  updateModelOverrideState();
}

function updateModelOverrideState() {
  const provider = document.getElementById('ai-provider')?.value || 'deepseek';
  const sel = document.getElementById('ai-model');
  const customInput = document.getElementById('ai-custom-model');
  const modelHint = document.getElementById('ai-model-hint');
  if (!sel || !customInput || !modelHint) return;

  const customModel = customInput.value.trim();
  const providerName = AI_CATALOG.getProvider(provider).name;

  if (provider === 'custom') {
    sel.disabled = true;
    sel.classList.add('select-disabled');
    customInput.classList.add('input-active-override');
    modelHint.textContent = customModel
      ? `当前使用你输入的自定义模型：${customModel}`
      : '自定义厂商需要填写 API 地址和模型名；如地址已包含 /v1，可直接粘贴。';
    return;
  }

  if (customModel) {
    sel.disabled = true;
    sel.classList.add('select-disabled');
    customInput.classList.add('input-active-override');
    modelHint.textContent = `已启用自定义模型覆盖：当前将优先使用 ${customModel}；上方 ${providerName} 推荐列表已暂时置灰。`;
  } else {
    sel.disabled = false;
    sel.classList.remove('select-disabled');
    customInput.classList.remove('input-active-override');
    modelHint.textContent = `已按 ${providerName} 官方文档整理推荐模型；若下拉里没有你要的型号，直接在下方填写模型名即可覆盖。`;
  }
}

function toggleHiddenPrefs(visible) {
  document.querySelectorAll('.hidden-pref').forEach((el) => {
    el.classList.toggle('hidden', !visible);
  });
  document.getElementById('hidden-pref-tip')?.classList.toggle('hidden', !visible);
}

async function initHiddenPrefsUnlock() {
  const titleEl = document.getElementById('popup-title');
  if (!titleEl) return;

  const data = await chrome.storage.local.get(AI_CATALOG.HIDDEN_PREFS_KEY);
  const unlocked = data[AI_CATALOG.HIDDEN_PREFS_KEY] === true;
  toggleHiddenPrefs(unlocked);

  let clickCount = 0;
  let resetTimer = null;

  titleEl.addEventListener('click', async () => {
    if ((await chrome.storage.local.get(AI_CATALOG.HIDDEN_PREFS_KEY))[AI_CATALOG.HIDDEN_PREFS_KEY] === true) return;
    clickCount += 1;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { clickCount = 0; }, 1500);
    if (clickCount < 5) return;

    clickCount = 0;
    await chrome.storage.local.set({ [AI_CATALOG.HIDDEN_PREFS_KEY]: true });
    toggleHiddenPrefs(true);
    setStatus('done', '已显示隐藏偏好项');
  });
}

initHiddenPrefsUnlock().catch(() => {});

// 初始化 AI 设置
(async () => {
  const config = await chrome.storage.local.get('aiConfig');
  const aiConfig = AI_CATALOG.normalizeConfig(config.aiConfig || AI_CATALOG.DEFAULT_CONFIG);

  const providerSel = document.getElementById('ai-provider');
  if (providerSel) {
    providerSel.value = aiConfig.provider || 'deepseek';
    populateModelSelect(aiConfig.provider, aiConfig.model);

    if (aiConfig.customBaseUrl) document.getElementById('ai-custom-url').value = aiConfig.customBaseUrl;
    if (aiConfig.customModel) document.getElementById('ai-custom-model').value = aiConfig.customModel;

    providerSel.addEventListener('change', async () => {
      const p = providerSel.value;
      const defaultModel = AI_CATALOG.getDefaultModel(p);
      document.getElementById('ai-custom-model').value = '';
      populateModelSelect(p, defaultModel);
      await saveAiConfig();
    });

    document.getElementById('ai-model')?.addEventListener('change', saveAiConfig);
    document.getElementById('ai-custom-url')?.addEventListener('change', saveAiConfig);
    document.getElementById('ai-custom-model')?.addEventListener('change', () => {
      updateModelOverrideState();
      saveAiConfig();
    });
    document.getElementById('ai-custom-model')?.addEventListener('input', () => {
      updateModelOverrideState();
      saveAiConfig();
    });
    updateModelOverrideState();
  }

  // 显示已有 Key
  const keyData = await chrome.storage.local.get(['aiApiKey', 'deepseekApiKey']);
  const hasKey = keyData.aiApiKey || keyData.deepseekApiKey;
  if (hasKey) {
    const el = document.getElementById('ai-api-key');
    if (el) el.value = '••••••••';
  }
})();

async function saveAiConfig() {
  const provider = document.getElementById('ai-provider')?.value || 'deepseek';
  const model = document.getElementById('ai-model')?.value || '';
  const customBaseUrl = document.getElementById('ai-custom-url')?.value?.trim() || '';
  const customModel = document.getElementById('ai-custom-model')?.value?.trim() || '';
  await chrome.storage.local.set({
    aiConfig: AI_CATALOG.normalizeConfig({ provider, model, customBaseUrl, customModel }),
  });
}

document.getElementById('btn-save-apikey')?.addEventListener('click', async () => {
  const key = document.getElementById('ai-api-key').value.trim();
  if (!key || key === '••••••••') return;
  await chrome.storage.local.set({ aiApiKey: key, deepseekApiKey: key });
  await saveAiConfig();
  document.getElementById('ai-api-key').value = '••••••••';
  setStatus('done', 'AI 设置已保存');
});

btnExampleProfile?.addEventListener('click', async () => {
  urlInput.value = AUTHOR_PROFILE_URL;
  btnGo.disabled = false;
  urlError.classList.add('hidden');
  await navigateToUrl();
});

// ========== 数据统计开关 ==========

(async () => {
  const toggle = document.getElementById('analytics-toggle');
  if (!toggle) return;
  const optedOut = await ANALYTICS.isOptedOut();
  toggle.checked = !optedOut;
  toggle.addEventListener('change', async (e) => {
    await ANALYTICS.setOptOut(!e.target.checked);
    setStatus('ready', e.target.checked ? '数据统计已开启' : '数据统计已关闭');
  });
})();

// ========== 作者推广开关 ==========
// 用 chrome.storage.local 跨 context 共享，sponsor.js 通过 storage.onChanged 即时同步
const SPONSOR_OPTOUT_KEY = 'sponsor_opt_out';

(async () => {
  const toggle = document.getElementById('sponsor-toggle');
  if (!toggle) return;
  const data = await chrome.storage.local.get(SPONSOR_OPTOUT_KEY);
  toggle.checked = data[SPONSOR_OPTOUT_KEY] !== true;
  toggle.addEventListener('change', async (e) => {
    const enabled = !!e.target.checked;
    await chrome.storage.local.set({ [SPONSOR_OPTOUT_KEY]: !enabled });
    setStatus('ready', enabled ? '作者推广已开启' : '作者推广已永久关闭');
  });
})();

// ========== URL 快捷输入 ==========

const urlInput = document.getElementById('url-input');
const btnGo = document.getElementById('btn-go');
const urlError = document.getElementById('url-error');

urlInput.addEventListener('input', () => {
  const val = urlInput.value.trim();
  btnGo.disabled = !DATA_STORE.isValidProfileUrl(val);
  urlError.classList.add('hidden');
});

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !btnGo.disabled) navigateToUrl();
});

btnGo.addEventListener('click', navigateToUrl);

async function navigateToUrl() {
  const url = urlInput.value.trim();
  if (!DATA_STORE.isValidProfileUrl(url)) {
    urlError.textContent = '请输入有效的小红书博主主页链接';
    urlError.classList.remove('hidden');
    return;
  }

  btnGo.disabled = true;
  btnGo.textContent = '跳转中...';
  setStatus('checking', '正在跳转到博主主页...');

  try {
    await chrome.tabs.update(activeTabId, { url });
    // 等待页面加载完成后重新初始化
    chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
      if (tabId === activeTabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        btnGo.textContent = '前往';
        urlInput.value = '';
        // 延迟让 content script 注入
        setTimeout(() => init(), 500);
      }
    });
  } catch {
    urlError.textContent = '跳转失败，请手动打开链接';
    urlError.classList.remove('hidden');
    btnGo.disabled = false;
    btnGo.textContent = '前往';
  }
}

// ========== 最近抓取记录 ==========

async function loadRecentScrapes() {
  const list = await DATA_STORE.getRecentScrapes();
  const section = document.getElementById('recent-section');
  const container = document.getElementById('recent-list');
  if (!list || list.length === 0) {
    section.classList.add('hidden');
    return;
  }
  section.classList.remove('hidden');
  container.innerHTML = list.slice(0, 5).map(r => {
    const timeStr = formatRelTime(r.scrapedAt);
    const avatarHtml = r.avatar
      ? `<img class="recent-avatar" src="${escapeHtml(r.avatar)}" onerror="this.style.display='none'">`
      : '<div class="recent-avatar"></div>';
    return `<div class="recent-item" data-url="${escapeHtml(r.profileUrl)}" data-userid="${escapeHtml(r.userId)}">
      ${avatarHtml}
      <div class="recent-info">
        <div class="recent-name">${escapeHtml(r.nickname || '未知博主')}</div>
        <div class="recent-meta">${r.noteCount}篇 · ${timeStr}</div>
      </div>
      <button class="btn-recent-analysis" data-userid="${escapeHtml(r.userId)}">分析</button>
    </div>`;
  }).join('');

  // 点击整行 → 跳转到博主主页
  container.querySelectorAll('.recent-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('.btn-recent-analysis')) return;
      const url = item.dataset.url;
      if (url) {
        urlInput.value = url;
        navigateToUrl();
      }
    });
  });

  // 点击「分析」→ 直接打开详情页
  container.querySelectorAll('.btn-recent-analysis').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const userId = btn.dataset.userid;
      chrome.tabs.create({ url: chrome.runtime.getURL(`analysis/analysis.html#detail=${userId}`) });
    });
  });
}

function formatRelTime(ts) {
  if (!ts) return '未知';
  const diff = Date.now() - ts;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
  if (diff < 2592000000) return Math.floor(diff / 86400000) + '天前';
  return new Date(ts).toLocaleDateString('zh-CN');
}

init();
