// 数据分析看板 — 多博主路由架构

(async function () {
  await DATA_STORE.migrateIfNeeded();

  let selectionMode = false;
  let selectedBloggers = new Set();
  const workbenchRail = document.getElementById('workbench-rail');
  const workbenchOverview = document.getElementById('workbench-overview');
  const workbenchDetail = document.getElementById('workbench-detail');
  const chartResizeObservers = new Map();
  const ANALYSIS_UI_PREFS_KEY = 'analysis_ui_prefs_v3';
  let currentDetailWorkspace = null;

  function getAnalysisUiPrefs() {
    try {
      const raw = localStorage.getItem(ANALYSIS_UI_PREFS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return {
        detailMode: parsed.detailMode === 'deep' ? 'deep' : 'core',
        deepDiveExpanded: parsed.deepDiveExpanded === true,
        expandedAdvSections: parsed.expandedAdvSections && typeof parsed.expandedAdvSections === 'object'
          ? parsed.expandedAdvSections
          : {},
      };
    } catch {
      return { detailMode: 'core', deepDiveExpanded: false, expandedAdvSections: {} };
    }
  }

  function saveAnalysisUiPrefs(patch = {}) {
    const next = { ...getAnalysisUiPrefs(), ...patch };
    localStorage.setItem(ANALYSIS_UI_PREFS_KEY, JSON.stringify(next));
    return next;
  }

  async function initHiddenPrefsUnlock() {
    const triggers = document.querySelectorAll('[data-hidden-pref-trigger]');
    if (triggers.length === 0) return;

    let clickCount = 0;
    let resetTimer = null;

    const handleUnlockClick = async () => {
      const data = await chrome.storage.local.get(AI_CATALOG.HIDDEN_PREFS_KEY);
      if (data[AI_CATALOG.HIDDEN_PREFS_KEY] === true) return;

      clickCount += 1;
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => { clickCount = 0; }, 1500);
      if (clickCount < 5) return;

      clickCount = 0;
      await chrome.storage.local.set({ [AI_CATALOG.HIDDEN_PREFS_KEY]: true });
      try {
        alert('已显示隐藏偏好项');
      } catch {}
    };

    triggers.forEach((el) => el.addEventListener('click', handleUnlockClick));
  }

  initHiddenPrefsUnlock().catch(() => {});

  function openLibraryView(params = {}) {
    const url = new URL(chrome.runtime.getURL('library/library.html'));
    if (params.bloggerUserId) url.searchParams.set('blogger', params.bloggerUserId);
    if (params.noteId) url.searchParams.set('note', params.noteId);
    if (params.search) url.searchParams.set('search', params.search);
    window.open(url.toString(), '_blank');
  }

  // 广告位关闭按钮
  document.querySelectorAll('.ad-dismiss').forEach(btn => {
    btn.addEventListener('click', () => {
      const slot = btn.closest('.ad-slot');
      if (slot) slot.style.display = 'none';
    });
  });

  // ========== Hash 路由 ==========

  function getRoute() {
    const hash = window.location.hash;
    if (hash.startsWith('#detail=')) return { view: 'detail', userId: hash.slice(8) };
    if (hash.startsWith('#personal=')) return { view: 'personal', userId: hash.slice(10) };
    if (hash.startsWith('#compare=')) return { view: 'compare', userIds: hash.slice(9).split(',').filter(Boolean) };
    return { view: 'overview' };
  }

  async function router() {
    const route = getRoute();
    if (route.view === 'detail') {
      await showDetailView(route.userId);
    } else if (route.view === 'personal') {
      await showPersonalView(route.userId);
    } else if (route.view === 'compare') {
      await showCompareView(route.userIds);
    } else {
      await showOverviewView();
    }
  }

  window.addEventListener('hashchange', router);
  await router();

  // 初始化云同步面板（v2.8.0）
  initCloudSyncPanel().catch(e => console.error('[CloudSync] init failed:', e));

  // 素材库按钮
  const btnLibrary = document.getElementById('btn-library');
  if (btnLibrary) {
    btnLibrary.addEventListener('click', () => {
      openLibraryView();
    });
  }

  // 绑定全局按钮事件
  replaceWithClone('btn-comparison-toggle').addEventListener('click', async () => {
    selectionMode = !selectionMode;
    if (!selectionMode) {
      selectedBloggers.clear();
    }
    const index = await DATA_STORE.getBloggerIndex();
    renderBloggerGrid(index);
    const bar = document.getElementById('compare-selection-bar');
    if (selectionMode) {
      bar.classList.remove('hidden');
      updateCompareSelectionBar();
    } else {
      bar.classList.add('hidden');
    }
  });

  replaceWithClone('btn-compare-start').addEventListener('click', () => {
    if (selectedBloggers.size >= 2) {
      const userIds = Array.from(selectedBloggers).join(',');
      window.location.hash = '#compare=' + userIds;
    }
  });

  replaceWithClone('btn-compare-cancel').addEventListener('click', async () => {
    selectionMode = false;
    selectedBloggers.clear();
    const index = await DATA_STORE.getBloggerIndex();
    renderBloggerGrid(index);
    document.getElementById('compare-selection-bar').classList.add('hidden');
  });

  // ========== 总览视图 ==========

  function setWorkbenchMode(mode) {
    if (!workbenchRail || !workbenchOverview || !workbenchDetail) return;
    if (mode === 'overview') {
      workbenchRail.classList.remove('hidden');
      workbenchOverview.classList.remove('hidden');
      workbenchDetail.classList.add('hidden');
      workbenchRail.style.display = 'flex';
      workbenchOverview.style.display = 'block';
      workbenchDetail.style.display = 'none';
    } else if (mode === 'detail') {
      workbenchRail.classList.remove('hidden');
      workbenchOverview.classList.add('hidden');
      workbenchDetail.classList.remove('hidden');
      workbenchRail.style.display = 'flex';
      workbenchOverview.style.display = 'none';
      workbenchDetail.style.display = 'block';
    } else {
      workbenchRail.classList.add('hidden');
      workbenchOverview.classList.add('hidden');
      workbenchDetail.classList.add('hidden');
      workbenchRail.style.display = 'none';
      workbenchOverview.style.display = 'none';
      workbenchDetail.style.display = 'none';
    }
  }

  async function getWorkbenchCloudState() {
    if (typeof CLOUD_SYNC === 'undefined') {
      return { loggedIn: false, email: '', verified: false, remoteBloggers: 0, remoteNotes: 0, lastSyncAt: null };
    }

    const session = await CLOUD_SYNC.getSession().catch(() => null);
    const loggedIn = !!session?.access_token;
    const user = session?.user || {};
    const verified = !!(user.email_confirmed_at || user.confirmed_at);
    const remote = loggedIn
      ? await CLOUD_SYNC.getRemoteStats().catch(() => ({ bloggers: 0, notes: 0 }))
      : { bloggers: 0, notes: 0 };
    const lastSyncAt = loggedIn ? await CLOUD_SYNC.getLastSyncAt().catch(() => null) : null;

    return {
      loggedIn,
      email: user.email || '',
      verified,
      remoteBloggers: remote.bloggers || 0,
      remoteNotes: remote.notes || 0,
      lastSyncAt,
    };
  }

  function getPlanLabel() {
    return '公开版';
  }

  function bindWorkbenchAction(container, selector, handler) {
    const el = container?.querySelector(selector);
    if (el) el.addEventListener('click', handler);
  }

  function getNoteOpenUrl(note) {
    if (note?.noteUrl) return note.noteUrl;
    const noteId = note?.noteId || note?.id;
    return noteId ? `https://www.xiaohongshu.com/explore/${noteId}` : '';
  }

  function renderNoteHover(note) {
    const tags = Array.isArray(note.tags) ? note.tags.slice(0, 4) : [];
    const excerpt = (note.content || '').trim();
    const hoverCopy = excerpt
      ? `${excerpt.slice(0, 80)}${excerpt.length > 80 ? '…' : ''}`
      : '这篇笔记缺少正文抓取结果，可以直接跳到原始页面查看。';
    return `
      <div class="wb-note-hover">
        <div class="wb-note-hover-title">${esc(note.title || '无标题')}</div>
        <div class="wb-note-hover-meta">
          ${fmtNum(note.likes || 0)} 赞 · ${fmtNum(note.collects || 0)} 藏 · ${fmtNum(note.commentCount || 0)} 评
          ${note.publishTime ? ` · ${esc(note.publishTime)}` : ''}
        </div>
        <div class="wb-note-hover-copy">${esc(hoverCopy)}</div>
        ${tags.length > 0 ? `
          <div class="wb-note-hover-tags">
            ${tags.map(tag => `<span class="wb-note-hover-tag">#${esc(tag)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  async function renderWorkbenchOverview(bloggers = []) {
    if (!workbenchOverview) return;
    setWorkbenchMode('overview');

    const cloud = await getWorkbenchCloudState();
    const totalNotes = bloggers.reduce((sum, b) => sum + (b.noteCount || 0), 0);
    const latest = bloggers.slice(0, 4);
    const latestBlogger = bloggers[0] || null;
    const compareEnabled = bloggers.length >= 2;
    const pendingSyncNotes = Math.max(totalNotes - cloud.remoteNotes, 0);

    const alerts = [];
    if (!cloud.loggedIn) {
      alerts.push({ title: '云服务未登录', desc: '本地分析可以继续使用；需要同步或跨设备时再登录即可。' });
    } else if (!cloud.verified) {
      alerts.push({ title: '邮箱尚未验证', desc: '建议尽快完成邮箱验证，再执行云写入或清空云端等敏感操作。' });
    }
    if (bloggers.length === 0) {
      alerts.push({ title: '还没有本地数据', desc: '先抓一个博主，再回来做分析、同步和对比。' });
    } else if (pendingSyncNotes > 0 && cloud.loggedIn) {
      alerts.push({ title: '本地仍有未同步数据', desc: `云端比本地少 ${fmtNum(pendingSyncNotes)} 篇笔记，适合现在补一次同步。` });
    }
    if (alerts.length === 0) {
      alerts.push({ title: '状态良好', desc: '本地数据、云连接和当前工作流都处于可继续推进的状态。' });
    }

    workbenchOverview.innerHTML = `
      <div class="workbench-head">
        <div class="workbench-title">Workspace</div>
        <span class="workbench-badge">${esc(getPlanLabel())}</span>
      </div>

      <div class="workbench-block">
        <div class="workbench-label">账号状态</div>
        <div class="wb-account-row">
          <div class="wb-account-email">${esc(cloud.email || '未登录云服务')}</div>
          <div class="wb-account-meta">
            ${cloud.loggedIn ? `云端 ${fmtNum(cloud.remoteBloggers)} 位博主 / ${fmtNum(cloud.remoteNotes)} 篇笔记` : '当前仅使用本地数据分析'}
            ${cloud.lastSyncAt ? ` · 上次同步 ${formatRelTime(cloud.lastSyncAt)}` : ''}
          </div>
          <div class="wb-status-line">
            <span class="wb-chip ${cloud.loggedIn ? 'ok' : 'warn'}">${cloud.loggedIn ? '已连接' : '未登录'}</span>
            <span class="wb-chip ${cloud.verified ? 'ok' : 'warn'}">${cloud.verified ? '邮箱已验证' : '邮箱未验证'}</span>
          </div>
        </div>
      </div>

      <div class="workbench-block">
        <div class="workbench-label">本地规模</div>
        <div class="wb-grid">
          <div class="wb-inline-metrics"><strong>${fmtNum(bloggers.length)}</strong><span>已采集博主</span></div>
          <div class="wb-inline-metrics"><strong>${fmtNum(totalNotes)}</strong><span>本地笔记数</span></div>
        </div>
        ${bloggers.length > 0 ? (() => {
          const tl = bloggers.reduce((s, b) => s + (b.totalLikes || 0), 0);
          const tc = bloggers.reduce((s, b) => s + (b.totalCollects || 0), 0);
          const tm = bloggers.reduce((s, b) => s + (b.totalComments || 0), 0);
          return `
            <div class="wb-grid" style="margin-top:8px">
              <div class="wb-inline-metrics"><strong>${fmtNum(tl)}</strong><span>总点赞</span></div>
              <div class="wb-inline-metrics"><strong>${fmtNum(tc)}</strong><span>总收藏</span></div>
              <div class="wb-inline-metrics"><strong>${fmtNum(tm)}</strong><span>总评论</span></div>
              <div class="wb-inline-metrics"><strong>${totalNotes > 0 ? fmtNum(Math.round(tl / totalNotes)) : '—'}</strong><span>均赞</span></div>
            </div>`;
        })() : ''}
      </div>

      <div class="workbench-block">
        <div class="workbench-label">快捷操作</div>
        <div class="wb-actions">
          <button class="wb-action-btn primary" data-action="sync" ${cloud.loggedIn ? '' : 'disabled'}>同步全部</button>
          <button class="wb-action-btn" data-action="library">打开素材库</button>
          <button class="wb-action-btn" data-action="compare" ${compareEnabled ? '' : 'disabled'}>${compareEnabled ? '对比分析' : '对比需 2+ 博主'}</button>
          <button class="wb-action-btn" data-action="latest" ${latestBlogger ? '' : 'disabled'}>查看最近博主</button>
        </div>
      </div>

      <div class="workbench-block">
        <div class="workbench-label">最近博主</div>
        ${latest.length > 0 ? `
          <div class="wb-list">
            ${latest.map(item => `
              <button class="wb-list-item" data-userid="${esc(item.userId)}" style="text-align:left;cursor:pointer">
                <div class="wb-item-title">${esc(item.nickname || '未知博主')}</div>
                <div class="wb-item-meta">${fmtNum(item.noteCount || 0)} 篇 · ${formatRelTime(item.lastScrapedAt)}</div>
              </button>
            `).join('')}
          </div>
        ` : '<div class="wb-empty">右侧工作台会在你抓到数据后显示快捷入口、同步状态和最近账号。</div>'}
      </div>

      <div class="workbench-block">
        <div class="workbench-label">提醒</div>
        <div class="wb-alerts">
          ${alerts.map(item => `
            <div class="wb-alert">
              <strong>${esc(item.title)}</strong>
              <span>${esc(item.desc)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    bindWorkbenchAction(workbenchOverview, '[data-action="sync"]', () => {
      document.getElementById('csp-sync-now')?.click();
    });
    bindWorkbenchAction(workbenchOverview, '[data-action="library"]', () => {
      document.getElementById('btn-library')?.click();
    });
    bindWorkbenchAction(workbenchOverview, '[data-action="compare"]', () => {
      document.getElementById('btn-comparison-toggle')?.click();
    });
    bindWorkbenchAction(workbenchOverview, '[data-action="latest"]', () => {
      if (latestBlogger?.userId) window.location.hash = '#detail=' + latestBlogger.userId;
    });
    workbenchOverview.querySelectorAll('[data-userid]').forEach(el => {
      el.addEventListener('click', () => {
        window.location.hash = '#detail=' + el.dataset.userid;
      });
    });
  }

  async function renderWorkbenchDetail(userId, bloggerData) {
    if (!workbenchDetail || !bloggerData?.notes?.length) return;
    setWorkbenchMode('detail');

    const notes = bloggerData.notes || [];
    const cloud = await getWorkbenchCloudState();
    const totalLikes = notes.reduce((sum, note) => sum + (note.likes || 0), 0);
    const totalCollects = notes.reduce((sum, note) => sum + (note.collects || 0), 0);
    const avgEngagement = notes.length > 0
      ? Math.round((totalLikes + totalCollects + notes.reduce((s, n) => s + (n.commentCount || 0), 0)) / notes.length)
      : 0;
    const topNotes = [...notes]
      .sort((a, b) => ((b.likes || 0) + (b.collects || 0)) - ((a.likes || 0) + (a.collects || 0)))
      .slice(0, 3);
    const snapshots = Array.isArray(bloggerData.snapshots) ? bloggerData.snapshots.length : 0;

    const alerts = [];
    if (!cloud.loggedIn) {
      alerts.push({ title: '当前仅本地分析', desc: '想跨设备或做长期留存，再把这个博主同步到云端。' });
    } else if (!cloud.verified) {
      alerts.push({ title: '建议先验证邮箱', desc: '这样后续做云写入和敏感操作会更稳。' });
    }
    if (snapshots < 2) {
      alerts.push({ title: '增长趋势样本还少', desc: '多抓几次这个博主后，增长趋势区会更有参考价值。' });
    }
    if (alerts.length === 0) {
      alerts.push({ title: '当前博主状态稳定', desc: '可以继续导出、加入对比，或者多轮抓取观察增长变化。' });
    }

    workbenchDetail.innerHTML = `
      <div class="workbench-head">
        <div class="workbench-title">当前博主</div>
        <span class="workbench-badge">${esc(bloggerData.nickname || '博主')}</span>
      </div>

      <div class="workbench-block">
        <div class="wb-summary-row">
          <div class="wb-summary-copy">
            <strong>最近抓取</strong>
            <span>${formatRelTime(bloggerData.scrapedAt)} · ${fmtNum(notes.length)} 篇笔记</span>
          </div>
          <div class="wb-summary-value">${fmtNum(totalLikes)}</div>
        </div>
      </div>

      <div class="workbench-block">
        <div class="workbench-label">摘要</div>
        <div class="wb-grid">
          <div class="wb-inline-metrics"><strong>${fmtNum(totalCollects)}</strong><span>总收藏</span></div>
          <div class="wb-inline-metrics"><strong>${fmtNum(avgEngagement)}</strong><span>平均互动/篇</span></div>
          <div class="wb-inline-metrics"><strong>${fmtNum(snapshots)}</strong><span>历史快照</span></div>
          <div class="wb-inline-metrics"><strong>${fmtNum(bloggerData.stats?.followerCount || 0)}</strong><span>粉丝数</span></div>
        </div>
      </div>

      <div class="workbench-block">
        <div class="workbench-label">快捷操作</div>
        <div class="wb-actions">
          <button class="wb-action-btn primary" data-action="csv">导出 CSV</button>
          <button class="wb-action-btn" data-action="json">导出 JSON</button>
          <button class="wb-action-btn" data-action="pdf">导出 PDF</button>
          <button class="wb-action-btn soft" data-action="library">素材库查看</button>
        </div>
      </div>

      <div class="workbench-block">
        <div class="workbench-label">高价值笔记</div>
        ${topNotes.length > 0 ? `
          <div class="wb-list">
            ${topNotes.map(note => {
              const noteUrl = getNoteOpenUrl(note);
              return `
              <a class="wb-list-item note-link" href="${esc(noteUrl || '#')}" target="_blank" rel="noopener" ${noteUrl ? '' : 'aria-disabled="true"'}>
                <div class="wb-item-title">${esc(note.title || '无标题')}</div>
                <div class="wb-item-meta">${fmtNum(note.likes || 0)} 赞 · ${fmtNum(note.collects || 0)} 藏 · ${(note.publishTime || '时间未知')}</div>
                ${renderNoteHover(note)}
              </a>
            `;
            }).join('')}
          </div>
        ` : '<div class="wb-empty">还没有可展示的高价值笔记。</div>'}
      </div>

      <div class="workbench-block">
        <div class="workbench-label">提醒</div>
        <div class="wb-alerts">
          ${alerts.map(item => `
            <div class="wb-alert">
              <strong>${esc(item.title)}</strong>
              <span>${esc(item.desc)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    bindWorkbenchAction(workbenchDetail, '[data-action="csv"]', () => document.getElementById('btn-export-csv')?.click());
    bindWorkbenchAction(workbenchDetail, '[data-action="json"]', () => document.getElementById('btn-export-json')?.click());
    bindWorkbenchAction(workbenchDetail, '[data-action="pdf"]', () => document.getElementById('btn-export-pdf')?.click());
    bindWorkbenchAction(workbenchDetail, '[data-action="library"]', () => {
      openLibraryView({ bloggerUserId: userId });
    });
    workbenchDetail.querySelectorAll('.note-link[aria-disabled="true"]').forEach(el => {
      el.addEventListener('click', (event) => event.preventDefault());
    });
  }

  async function showOverviewView() {
    currentDetailWorkspace = null;
    document.getElementById('overview-view').classList.remove('hidden');
    document.getElementById('detail-view').classList.add('hidden');
    document.getElementById('compare-view').classList.add('hidden');
    document.getElementById('personal-view').classList.add('hidden');
    document.getElementById('nav-bar').classList.add('hidden');
    document.getElementById('btn-chat-toggle').style.display = 'none';
    document.getElementById('chat-widget').style.display = 'none';
    document.getElementById('compare-selection-bar').classList.add('hidden');

    selectedBloggers.clear();
    selectionMode = false;

    // v2.9.0: 自动去重 — 检测同一博主的重复条目并合并
    await DATA_STORE.deduplicateIndex();

    const index = await DATA_STORE.getBloggerIndex();

    if (index.length === 0) {
      document.getElementById('overview-subtitle').textContent =
        '暂无数据，请先抓取博主笔记后点击「数据分析」';
      document.getElementById('blogger-grid').innerHTML =
        '<div class="blogger-grid-empty">还没有采集任何博主的数据</div>';
      document.getElementById('btn-comparison-toggle').classList.add('hidden');
      await renderWorkbenchOverview([]);
      return;
    }

    const totalNotes = index.reduce((s, b) => s + (b.noteCount || 0), 0);
    document.getElementById('overview-subtitle').textContent =
      `已收录 ${index.length} 位博主，共 ${totalNotes} 篇笔记`;

    // 只有 2 位以上博主才显示对比按钮
    if (index.length >= 2) {
      document.getElementById('btn-comparison-toggle').classList.remove('hidden');
    } else {
      document.getElementById('btn-comparison-toggle').classList.add('hidden');
    }

    ANALYTICS.track('analysis_view', {
      view_type: 'overview',
      blogger_count: index.length,
      total_notes: totalNotes,
    });

    renderBloggerGrid(index);
    await renderWorkbenchOverview(index);

    // 首次进入总览时启动引导
    setTimeout(() => startOverviewOnboarding(index.length > 0), 300);
  }

  // ========== 新用户引导 ==========

  async function startOverviewOnboarding(hasData) {
    if (typeof ONBOARDING === 'undefined') return;
    if (await ONBOARDING.isDone('analysis_overview')) return;
    const steps = [
      {
        selector: '#overview-view header',
        title: '欢迎来到分析看板',
        content: '这里汇总了你抓取过的 <strong>所有博主</strong> 数据，按博主分别进入详情页可做多维度分析。',
        position: 'bottom',
      },
      {
        selector: '#blogger-grid',
        title: '博主列表',
        content: '点击任意博主卡片进入其 <strong>详情分析页</strong>：笔记列表、互动趋势、标题规律、AI 报告等。' +
          (hasData ? '' : '<br><br>还没有数据？请先在小红书博主主页上用插件批量抓取。'),
        position: 'top',
      },
      {
        selector: '#btn-library',
        title: '素材库',
        content: '所有笔记的 <strong>跨博主搜索 / 筛选 / 导出</strong> 入口。适合做选题研究和竞品对比。',
        position: 'bottom',
      },
      {
        selector: '#btn-comparison-toggle',
        title: '多博主对比',
        content: '勾选 2 位以上博主后可进入 <strong>对比视图</strong>，看谁的互动更强、内容策略差异在哪。',
        position: 'bottom',
      },
    ];
    ONBOARDING.start({ key: 'analysis_overview', steps });
  }

  async function startDetailOnboarding() {
    if (typeof ONBOARDING === 'undefined') return;
    if (await ONBOARDING.isDone('analysis_detail')) return;
    const steps = [
      {
        selector: '#detail-header',
        title: '欢迎来到博主分析页',
        content: '从 POPUP 直接进来时，先看这里就够了：这是 <strong>单个博主</strong> 的完整分析入口，后面会继续拆到爆款笔记、互动分布、AI 总结和导出。',
        position: 'bottom',
      },
      {
        selector: '#top-notes',
        title: '先看爆款笔记',
        content: '这里会把该博主表现最好的笔记排出来。第一次使用时，先看 <strong>标题、封面形式、互动量</strong>，通常就能快速判断账号打法。',
        position: 'bottom',
      },
      {
        selector: '#btn-backend-import',
        title: '导入创作者后台数据',
        content: '从 <strong>小红书创作者中心 → 数据分析 → 导出</strong> 下载 Excel 文件，上传到这里可以补齐曝光 / 封面点击率 / 涨粉 / 分享 等独占指标。',
        position: 'bottom',
      },
      {
        selector: '#btn-personal-view',
        title: '个人分析（需先导入）',
        content: '导入后台数据后解锁：<strong>转化漏斗、封面点击率规律、诊断清单、发布时段表现</strong>，更适合做账号优化和复盘。',
        position: 'bottom',
      },
      {
        selector: '#btn-back',
        title: '回到总览继续切换',
        content: '看完当前博主后，点这里可回到总览继续切换对象；如果已经采集了多位博主，也可以回去做 <strong>多博主对比</strong>。',
        position: 'bottom',
      },
    ];
    ONBOARDING.start({ key: 'analysis_detail', steps });
  }

  async function startPersonalOnboarding() {
    if (typeof ONBOARDING === 'undefined') return;
    if (await ONBOARDING.isDone('analysis_personal')) return;
    const steps = [
      {
        selector: '#personal-view',
        title: '个人分析总览',
        content: '基于你导入的创作者后台数据，这里聚焦 <strong>账号层面</strong> 的增长诊断。',
        position: 'bottom',
      },
      {
        selector: '#personal-funnel-panel',
        title: '转化漏斗',
        content: '曝光 → 观看 → 互动 → 分享 / 涨粉 的逐级转化。每一环会对照 <strong>行业基准</strong> 给出弱 / 中 / 强评级。',
        position: 'top',
      },
      {
        selector: '#personal-ctr-panel',
        title: '封面点击率分析',
        content: '通过 <strong>Pearson 相关系数</strong> 验证「封面点击率越高，曝光和互动越强」的规律，并给出每个 CTR 区间的实际表现。',
        position: 'top',
      },
      {
        selector: '#personal-diagnosis-panel',
        title: '诊断清单',
        content: '把笔记分为三类：<strong>高曝光低点击 / 高点击低互动 / 高互动低曝光</strong>，对应不同的优化动作（换封面 / 改内容 / 提曝光）。',
        position: 'top',
      },
      {
        selector: '#personal-heatmap-panel',
        title: '发布时段表现',
        content: '看看你账号在哪个 <strong>星期几 / 时段</strong> 发布最容易爆，下次发布时参考。',
        position: 'top',
      },
    ];
    ONBOARDING.start({ key: 'analysis_personal', steps });
  }

  function renderBloggerGrid(bloggers) {
    const grid = document.getElementById('blogger-grid');
    grid.innerHTML = bloggers.map(b => {
      const timeStr = formatRelTime(b.lastScrapedAt);
      const avatarSrc = b.avatar ? esc(b.avatar) : '';
      const avatarHtml = avatarSrc
        ? `<img class="blogger-avatar" src="${avatarSrc}" onerror="this.style.background='#f0f0f0';this.onerror=null">`
        : '<div class="blogger-avatar"></div>';
      const checkboxHtml = selectionMode
        ? `<div class="blogger-card-checkbox" data-userid="${esc(b.userId)}">✓</div>`
        : '';
      return `<div class="blogger-card ${selectionMode ? 'selectable' : ''}" data-userid="${esc(b.userId)}">
        ${checkboxHtml}
        <div class="blogger-card-header">
          ${avatarHtml}
          <div class="blogger-name-area">
            <div class="blogger-nickname">${b.profileUrl ? `<a href="${esc(b.profileUrl)}" target="_blank" rel="noopener" class="blogger-profile-link" title="打开小红书主页">${esc(b.nickname || '未知博主')}</a>` : esc(b.nickname || '未知博主')}</div>
            <div class="blogger-time">${timeStr}采集</div>
          </div>
          <button class="blogger-delete" data-userid="${esc(b.userId)}" title="删除数据">&#10005;</button>
        </div>
        <div class="blogger-card-stats">
          <div class="bcs-item"><span class="bcs-value">${b.noteCount}</span><span class="bcs-label">笔记</span></div>
          <div class="bcs-item"><span class="bcs-value">${fmtNum(b.totalLikes || 0)}</span><span class="bcs-label">点赞</span></div>
          <div class="bcs-item"><span class="bcs-value">${fmtNum(b.totalCollects || 0)}</span><span class="bcs-label">收藏</span></div>
          <div class="bcs-item"><span class="bcs-value">${fmtNum(b.totalComments || 0)}</span><span class="bcs-label">评论</span></div>
        </div>
      </div>`;
    }).join('');

    // 选择模式：勾选博主
    if (selectionMode) {
      grid.querySelectorAll('.blogger-card').forEach(card => {
        const userId = card.dataset.userid;
        const checkbox = card.querySelector('.blogger-card-checkbox');
        if (selectedBloggers.has(userId)) {
          card.classList.add('selected');
          checkbox.classList.add('checked');
        }
        card.addEventListener('click', (e) => {
          if (e.target.closest('.blogger-delete')) return;
          e.stopPropagation();
          if (selectedBloggers.has(userId)) {
            selectedBloggers.delete(userId);
            card.classList.remove('selected');
            checkbox.classList.remove('checked');
          } else if (selectedBloggers.size < 5) {
            selectedBloggers.add(userId);
            card.classList.add('selected');
            checkbox.classList.add('checked');
          }
          updateCompareSelectionBar();
        });
      });
      grid.querySelectorAll('.blogger-delete').forEach(btn => {
        btn.style.display = 'none';
      });
    } else {
      // 点击卡片 → 进入详情
      grid.querySelectorAll('.blogger-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.blogger-delete') || e.target.closest('.blogger-profile-link')) return;
          window.location.hash = '#detail=' + card.dataset.userid;
        });
      });

      // 删除按钮
      grid.querySelectorAll('.blogger-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (!confirm('确定删除该博主的所有数据？')) return;
          await DATA_STORE.deleteBlogger(btn.dataset.userid);
          ANALYTICS.track('analysis_interact', { action: 'delete_blogger' });
          await showOverviewView();
        });
      });
    }
  }

  function updateCompareSelectionBar() {
    const bar = document.getElementById('compare-selection-bar');
    const counter = document.getElementById('compare-selection-count');
    const startBtn = document.getElementById('btn-compare-start');
    counter.textContent = `已选 ${selectedBloggers.size} 位博主`;
    startBtn.disabled = selectedBloggers.size < 2;
  }

  // ========== 对比视图 ==========

  function computeCompareMetrics(bloggersData) {
    // 第一遍：计算所有原始指标
    const metrics = bloggersData.map(b => {
      const notes = b.notes || [];
      const totalLikes = notes.reduce((s, n) => s + (n.likes || 0), 0);
      const totalCollects = notes.reduce((s, n) => s + (n.collects || 0), 0);
      const totalComments = notes.reduce((s, n) => s + (n.commentCount || 0), 0);

      const avgLikes = notes.length > 0 ? totalLikes / notes.length : 0;
      const avgCollects = notes.length > 0 ? totalCollects / notes.length : 0;
      const avgComments = notes.length > 0 ? totalComments / notes.length : 0;
      const collectRatio = totalLikes > 0 ? (totalCollects / totalLikes * 100) : 0;

      // 爆款率：likes >= 2 * avgLikes
      const viralNotes = notes.filter(n => (n.likes || 0) >= avgLikes * 2);
      const viralRate = notes.length > 0 ? (viralNotes.length / notes.length * 100) : 0;

      // 稳定性指数：1 - stdDev/mean，range [0,1]
      let consistency = 0.5;
      if (avgLikes > 0 && notes.length >= 2) {
        const variance = notes.reduce((s, n) => s + Math.pow((n.likes || 0) - avgLikes, 2), 0) / notes.length;
        const stdDev = Math.sqrt(variance);
        consistency = Math.max(0, Math.min(1, 1 - (stdDev / Math.max(1, avgLikes))));
      }

      // 内容投入度：平均标题长、正文长、图片数、标签数的加权综合
      const avgTitleLen = notes.length > 0 ? notes.reduce((s, n) => s + (n.title?.length || 0), 0) / notes.length : 0;
      const avgContentLen = notes.length > 0 ? notes.reduce((s, n) => s + (n.content?.length || 0), 0) / notes.length : 0;
      const avgImages = notes.length > 0 ? notes.reduce((s, n) => s + (n.imageCount || 0), 0) / notes.length : 0;
      const avgTags = notes.length > 0 ? notes.reduce((s, n) => s + (n.tags?.length || 0), 0) / notes.length : 0;

      return {
        userId: b.userId,
        nickname: b.nickname,
        avatar: b.avatar,
        noteCount: notes.length,
        raw: {
          totalLikes, totalCollects, totalComments,
          avgLikes, avgCollects, avgComments, collectRatio,
          viralRate, consistency,
          avgTitleLen, avgContentLen, avgImages, avgTags,
          topTags: notes.length > 0
            ? Object.entries(
                notes.reduce((acc, n) => {
                  (n.tags || []).forEach(t => { acc[t] = (acc[t] || 0) + 1; });
                  return acc;
                }, {})
              ).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag]) => tag)
            : [],
        },
      };
    });

    // 第二遍：归一化得分到 0-100
    const dimensions = [
      { name: '规模指数', key: 'scale', calc: m => m.raw.totalLikes + m.raw.totalCollects + m.raw.totalComments },
      { name: '互动效率', key: 'efficiency', calc: m => m.raw.avgLikes + m.raw.avgCollects + (m.raw.avgComments || 0) },
      { name: '收藏价值', key: 'value', calc: m => m.raw.collectRatio },
      { name: '爆款能力', key: 'viral', calc: m => m.raw.viralRate },
      { name: '稳定性指数', key: 'consistency', calc: m => m.raw.consistency * 100 },
      { name: '内容投入度', key: 'effort', calc: m => {
        const titleNorm = Math.min(100, m.raw.avgTitleLen * 3);
        const contentNorm = Math.min(100, m.raw.avgContentLen / 5);
        const imgNorm = Math.min(100, m.raw.avgImages * 15);
        const tagNorm = Math.min(100, m.raw.avgTags * 15);
        return (titleNorm + contentNorm + imgNorm + tagNorm) / 4;
      }},
    ];

    for (const dim of dimensions) {
      const values = metrics.map(m => dim.calc(m));
      const maxVal = Math.max(...values, 1);
      metrics.forEach(m => {
        if (!m.scores) m.scores = {};
        m.scores[dim.key] = Math.round((dim.calc(m) / maxVal) * 100);
      });
    }

    // 计算话题差异化
    const allTags = new Set();
    metrics.forEach(m => m.raw.topTags.forEach(t => allTags.add(t)));

    for (let i = 0; i < metrics.length; i++) {
      let totalJaccard = 0;
      let comparisons = 0;
      for (let j = 0; j < metrics.length; j++) {
        if (i === j) continue;
        const set1 = new Set(metrics[i].raw.topTags);
        const set2 = new Set(metrics[j].raw.topTags);
        const intersection = new Set([...set1].filter(x => set2.has(x))).size;
        const union = new Set([...set1, ...set2]).size;
        const jaccard = union > 0 ? intersection / union : 0;
        totalJaccard += (1 - jaccard);
        comparisons++;
      }
      metrics[i].scores.differentiation = comparisons > 0
        ? Math.round((totalJaccard / comparisons) * 100)
        : 50;
    }

    return metrics;
  }

  async function showCompareView(userIds) {
    currentDetailWorkspace = null;
    document.getElementById('overview-view').classList.add('hidden');
    document.getElementById('detail-view').classList.add('hidden');
    document.getElementById('compare-view').classList.remove('hidden');
    document.getElementById('personal-view').classList.add('hidden');
    document.getElementById('compare-selection-bar').classList.add('hidden');
    document.getElementById('nav-bar').classList.add('hidden');
    document.getElementById('btn-chat-toggle').style.display = 'none';
    document.getElementById('chat-widget').style.display = 'none';
    setWorkbenchMode('compare');
    selectionMode = false;
    selectedBloggers.clear();

    // 加载数据
    const bloggersData = await DATA_STORE.getMultipleBloggerData(userIds);
    if (!bloggersData || bloggersData.length < 2) {
      document.getElementById('compare-subtitle').textContent = '数据加载失败或博主不足';
      return;
    }

    const names = bloggersData.map(b => b.nickname || '未知').join(' vs ');
    const totalNotes = bloggersData.reduce((s, b) => s + (b.notes?.length || 0), 0);
    document.getElementById('compare-subtitle').textContent =
      `对比 ${bloggersData.length} 位博主，共 ${totalNotes} 篇笔记`;
    document.getElementById('compare-bloggers-info').textContent = names;

    // 返回按钮
    replaceWithClone('btn-compare-back').addEventListener('click', () => {
      window.location.hash = '#overview';
    });

    // 计算指标
    const metrics = computeCompareMetrics(bloggersData);

    // 渲染所有对比面板
    renderCompareDimensionBars(metrics);
    renderCompareSummaryCards(metrics);
    renderCompareTable(metrics, bloggersData);
    renderCompareTags(metrics, bloggersData);
    renderCompareDistribution(bloggersData);
    await initCompareAI(metrics, bloggersData, userIds);

    ANALYTICS.track('analysis_view', {
      view_type: 'compare',
      blogger_count: bloggersData.length,
      total_notes: totalNotes,
    });
  }

  function renderCompareDimensionBars(metrics) {
    const container = document.getElementById('compare-dimension-bars');
    const colors = ['#ff2442', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];
    const dimensions = [
      'scale', 'efficiency', 'value', 'viral', 'consistency', 'effort', 'differentiation'
    ];
    const dimensionNames = [
      '规模指数', '互动效率', '收藏价值', '爆款能力', '稳定性指数', '内容投入度', '话题差异化'
    ];

    let html = '';
    for (let d = 0; d < dimensions.length; d++) {
      const dimKey = dimensions[d];
      const dimName = dimensionNames[d];
      html += `<div class="compare-dimension">
        <div class="compare-dim-name">${dimName}</div>
        <div class="compare-dim-bars">`;

      metrics.forEach((m, i) => {
        const score = m.scores[dimKey] || 0;
        const color = colors[i % colors.length];
        html += `<div class="compare-dim-bar-group">
          <span class="compare-bar-label">${esc(m.nickname)}</span>
          <div class="compare-bar-track"><div class="compare-bar" style="width:${score}%; background-color:${color}"></div></div>
          <span class="compare-bar-value">${score}</span>
        </div>`;
      });

      html += `</div></div>`;
    }

    container.innerHTML = html;
  }

  function renderCompareSummaryCards(metrics) {
    const container = document.getElementById('compare-summary-grid');
    const colors = ['#ff2442', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

    let html = '<div class="compare-summary-grid-inner">';
    metrics.forEach((m, i) => {
      const color = colors[i % colors.length];
      html += `<div class="compare-summary-card" style="border-top: 4px solid ${color}">
        <div class="csc-avatar-name">
          ${m.avatar ? `<img src="${esc(m.avatar)}" class="csc-avatar" onerror="this.style.background='#f0f0f0'">` : '<div class="csc-avatar"></div>'}
          <div class="csc-name">${esc(m.nickname)}</div>
        </div>
        <div class="csc-metrics">
          <div class="csc-metric"><span class="csc-value">${m.noteCount}</span><span class="csc-label">笔记</span></div>
          <div class="csc-metric"><span class="csc-value">${m.scores.efficiency || 0}</span><span class="csc-label">互动效率</span></div>
          <div class="csc-metric"><span class="csc-value">${Math.round(m.raw.viralRate)}%</span><span class="csc-label">爆款率</span></div>
          <div class="csc-metric"><span class="csc-value">${Math.round(m.raw.collectRatio)}%</span><span class="csc-label">收藏率</span></div>
        </div>
      </div>`;
    });
    html += '</div>';

    container.innerHTML = html;
  }

  function renderCompareTable(metrics, bloggersData) {
    const container = document.getElementById('compare-table-container');

    // 找到每个指标的最大值（用于高亮）
    const maxVals = {
      noteCount: Math.max(...metrics.map(m => m.noteCount)),
      totalLikes: Math.max(...metrics.map(m => m.raw.totalLikes)),
      totalCollects: Math.max(...metrics.map(m => m.raw.totalCollects)),
      avgLikes: Math.max(...metrics.map(m => m.raw.avgLikes)),
      collectRatio: Math.max(...metrics.map(m => m.raw.collectRatio)),
      viralRate: Math.max(...metrics.map(m => m.raw.viralRate)),
      consistency: Math.max(...metrics.map(m => m.raw.consistency)),
      avgTitleLen: Math.max(...metrics.map(m => m.raw.avgTitleLen)),
      avgContentLen: Math.max(...metrics.map(m => m.raw.avgContentLen)),
      avgImages: Math.max(...metrics.map(m => m.raw.avgImages)),
      avgTags: Math.max(...metrics.map(m => m.raw.avgTags)),
    };

    let html = '<table class="compare-table"><thead><tr><th>指标</th>';
    metrics.forEach(m => html += `<th>${esc(m.nickname)}</th>`);
    html += '</tr></thead><tbody>';

    const rows = [
      { label: '笔记数', key: 'noteCount', fmt: v => v, isMax: 'noteCount' },
      { label: '总点赞', key: 'totalLikes', fmt: v => fmtNum(v), isMax: 'totalLikes' },
      { label: '平均赞/篇', key: 'avgLikes', fmt: v => v.toFixed(0), isMax: 'avgLikes' },
      { label: '总收藏', key: 'totalCollects', fmt: v => fmtNum(v), isMax: 'totalCollects' },
      { label: '收藏/赞比', key: 'collectRatio', fmt: v => v.toFixed(1) + '%', isMax: 'collectRatio' },
      { label: '爆款率', key: 'viralRate', fmt: v => v.toFixed(1) + '%', isMax: 'viralRate' },
      { label: '稳定性', key: 'consistency', fmt: v => (v * 100).toFixed(0), isMax: 'consistency' },
      { label: '标题长度', key: 'avgTitleLen', fmt: v => v.toFixed(0) + '字', isMax: 'avgTitleLen' },
      { label: '正文长度', key: 'avgContentLen', fmt: v => v.toFixed(0) + '字', isMax: 'avgContentLen' },
      { label: '平均图片', key: 'avgImages', fmt: v => v.toFixed(1) + '张', isMax: 'avgImages' },
      { label: '平均标签', key: 'avgTags', fmt: v => v.toFixed(1) + '个', isMax: 'avgTags' },
    ];

    for (const row of rows) {
      html += `<tr><td class="compare-table-label">${row.label}</td>`;
      metrics.forEach(m => {
        const val = row.key in m.raw ? m.raw[row.key] : m[row.key];
        const formatted = row.fmt(val ?? 0);
        let style = '';
        if (row.isMax) {
          const allEqual = metrics.every(x => {
            const v = row.key in x.raw ? x.raw[row.key] : x[row.key];
            return v === val;
          });
          if (!allEqual && val === maxVals[row.isMax]) {
            style = 'background-color:#e6f4ea; color:#0d652d; font-weight:bold';
          }
        }
        html += `<td style="${style}">${formatted}</td>`;
      });
      html += '</tr>';
    }

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function renderCompareTags(metrics, bloggersData) {
    const container = document.getElementById('compare-tags-section');
    const colors = ['#ff2442', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

    // 收集所有标签
    const tagBloggerMap = {}; // tag -> Set of blogger indices
    metrics.forEach((m, i) => {
      m.raw.topTags.forEach(tag => {
        if (!tagBloggerMap[tag]) tagBloggerMap[tag] = new Set();
        tagBloggerMap[tag].add(i);
      });
    });

    // 分为共同标签和独有标签
    const commonTags = Object.entries(tagBloggerMap)
      .filter(([, bloggers]) => bloggers.size > 1)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 15);

    const uniqueTags = metrics.map((m, i) => {
      const unique = m.raw.topTags.filter(t => {
        const bloggers = tagBloggerMap[t];
        return bloggers && bloggers.size === 1 && bloggers.has(i);
      }).slice(0, 8);
      return { nickname: m.nickname, tags: unique, color: colors[i % colors.length] };
    });

    let html = '<div class="compare-tags-content">';

    if (commonTags.length > 0) {
      html += '<div class="compare-tags-group"><h4>共同标签</h4><div class="compare-tags-list">';
      commonTags.forEach(([tag, bloggers]) => {
        html += `<div class="compare-tag-pill">#${esc(tag)} `;
        [...bloggers].forEach(idx => {
          html += `<span class="compare-tag-dot" style="background-color:${colors[idx % colors.length]}"></span>`;
        });
        html += '</div>';
      });
      html += '</div></div>';
    }

    for (const uniqueGroup of uniqueTags) {
      if (uniqueGroup.tags.length > 0) {
        html += `<div class="compare-tags-group"><h4>${esc(uniqueGroup.nickname)}的独有标签</h4><div class="compare-tags-list">`;
        uniqueGroup.tags.forEach(tag => {
          html += `<div class="compare-tag-pill" style="background-color:${uniqueGroup.color}20">#${esc(tag)}</div>`;
        });
        html += '</div></div>';
      }
    }

    html += '</div>';
    container.innerHTML = html;
  }

  function renderCompareDistribution(bloggersData) {
    const container = document.getElementById('compare-dist-grid');
    const colors = ['#ff2442', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6'];

    let html = '<div class="compare-dist-grid-inner">';
    bloggersData.forEach((b, i) => {
      const notes = b.notes || [];
      const likes = notes.map(n => n.likes || 0).sort((a, b) => a - b);
      if (likes.length === 0) return;

      const min = likes[0];
      const max = likes[likes.length - 1] || 1;
      const bucketCount = Math.min(8, likes.length);
      const bucketSize = Math.max(1, Math.ceil((max - min + 1) / bucketCount));
      const buckets = new Array(bucketCount).fill(0);

      for (const v of likes) {
        const idx = Math.min(Math.floor((v - min) / bucketSize), bucketCount - 1);
        buckets[idx]++;
      }

      const maxBucket = Math.max(...buckets) || 1;
      const median = likes[Math.floor(likes.length / 2)] || 0;
      let barHtml = '';
      for (let j = 0; j < buckets.length; j++) {
        const count = buckets[j];
        const h = count > 0 ? Math.max(12, count / maxBucket * 100).toFixed(1) : '0';
        const rangeStart = min + j * bucketSize;
        const rangeEnd = j === bucketCount - 1 ? max : Math.min(max, rangeStart + bucketSize - 1);
        const rangeLabel = rangeStart === rangeEnd
          ? fmtNum(rangeStart)
          : `${fmtNum(rangeStart)}-${fmtNum(rangeEnd)}`;
        const tooltip = `${rangeLabel} · ${count} 篇`;
        barHtml += `<div class="compare-dist-bin">
          <div class="compare-dist-count">${count}</div>
          <div class="compare-dist-bar" data-label="${esc(tooltip)}" style="height:${h}%; background-color:${colors[i % colors.length]}"></div>
          <div class="compare-dist-x">${esc(rangeLabel)}</div>
        </div>`;
      }

      html += `<div class="compare-dist-item">
        <h4>${esc(b.nickname)}</h4>
        <div class="compare-dist-stats">
          <div class="compare-dist-stat">
            <span class="compare-dist-stat-value">${fmtNum(likes.length)}</span>
            <span class="compare-dist-stat-label">样本</span>
          </div>
          <div class="compare-dist-stat">
            <span class="compare-dist-stat-value">${fmtNum(median)}</span>
            <span class="compare-dist-stat-label">中位赞</span>
          </div>
          <div class="compare-dist-stat">
            <span class="compare-dist-stat-value">${fmtNum(maxBucket)}</span>
            <span class="compare-dist-stat-label">峰值桶样本</span>
          </div>
        </div>
        <div class="compare-dist-chart">${barHtml}</div>
      </div>`;
    });
    html += '</div>';

    container.innerHTML = html;
  }

  async function initCompareAI(metrics, bloggersData, userIds) {
    const lockOverlay = document.getElementById('compare-ai-lock-overlay');
    const nokeyOverlay = document.getElementById('compare-ai-nokey-overlay');
    const btnGenerate = document.getElementById('btn-compare-ai-generate');
    const btnClear = document.getElementById('btn-compare-ai-clear');

    // 重置状态
    if (lockOverlay) lockOverlay.style.display = 'none';
    nokeyOverlay.style.display = 'none';
    btnGenerate.disabled = false;
    btnClear.style.display = 'none';
    document.getElementById('compare-ai-report').innerHTML =
      '<p class="ai-placeholder">点击「生成报告」，AI 将为你分析对标机会、策略差异、实操建议</p>';

    // 检查 API Key
    const apiKey = await AI_SERVICE.getApiKey();
    if (!apiKey) {
      nokeyOverlay.style.display = 'flex';
      btnGenerate.disabled = true;
      return;
    }

    // 缓存 key
    const cacheKey = AI_SERVICE.getComparisonCacheKey(userIds);

    // 检查缓存报告
    const cached = await AI_SERVICE.loadComparisonReport(userIds);
    if (cached) {
      renderAIReport(cached, 'compare-ai-report');
      btnClear.style.display = 'inline-block';
      const totalNotes = bloggersData.reduce((s, b) => s + (b.notes?.length || 0), 0);
      ANALYTICS.track('ai_report_generate', {
        mode: 'compare',
        note_count: totalNotes,
        blogger_count: bloggersData.length,
        cached: true,
        duration_ms: 0,
      });
    }

    // 重新绑定事件
    replaceWithClone('btn-compare-ai-generate').addEventListener('click',
      () => generateComparisonReport(bloggersData, userIds)
    );
    replaceWithClone('btn-compare-ai-clear').addEventListener('click', async () => {
      await AI_SERVICE.clearHistory(cacheKey);
      document.getElementById('compare-ai-report').innerHTML =
        '<p class="ai-placeholder">缓存已清除，点击「生成报告」重新生成</p>';
      document.getElementById('btn-compare-ai-clear').style.display = 'none';
    });
  }

  let isGeneratingComparison = false;

  async function generateComparisonReport(bloggersData, userIds) {
    if (isGeneratingComparison) return;
    isGeneratingComparison = true;

    const reportEl = document.getElementById('compare-ai-report');
    const btnGenerate = document.getElementById('btn-compare-ai-generate');
    const btnClear = document.getElementById('btn-compare-ai-clear');

    btnGenerate.disabled = true;
    btnGenerate.textContent = '生成中...';
    reportEl.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';

    const startAt = Date.now();
    let success = false;
    try {
      let fullText = '';
      for await (const chunk of AI_SERVICE.generateComparisonReport(bloggersData)) {
        if (chunk.done) break;
        fullText += chunk.text;
        renderAIReport(fullText, 'compare-ai-report');
      }
      await AI_SERVICE.saveComparisonReport(userIds, fullText);
      btnClear.style.display = 'inline-block';
      success = true;
    } catch (err) {
      reportEl.innerHTML = `<p class="ai-error">${esc(err.message)}</p>`;
    } finally {
      isGeneratingComparison = false;
      btnGenerate.disabled = false;
      btnGenerate.textContent = '生成报告';
      const totalNotes = bloggersData.reduce((s, b) => s + (b.notes?.length || 0), 0);
      ANALYTICS.track('ai_report_generate', {
        mode: 'compare',
        note_count: totalNotes,
        blogger_count: bloggersData.length,
        cached: false,
        duration_ms: Date.now() - startAt,
        success,
      });
    }
  }

  function renderAIReport(markdown, containerId = 'ai-report') {
    const reportEl = document.getElementById(containerId);
    const sections = markdown.split(/^## /m).filter(Boolean);
    reportEl.innerHTML = sections.map(section => {
      const lines = section.split('\n');
      const title = lines[0].trim();
      const body = lines.slice(1).join('\n').trim();
      return `<div class="ai-report-card">
        <h3>${esc(title)}</h3>
        <div class="ai-card-body">${esc(body)}</div>
      </div>`;
    }).join('');
  }

  function buildDetailAnalyticsProps(userId, bloggerData) {
    const props = {};
    if (userId) props.profile_id = userId;
    if (bloggerData?.nickname) props.blogger_name = bloggerData.nickname;
    return props;
  }

  function runDetailSection(sectionName, fn) {
    try {
      return fn();
    } catch (err) {
      console.error(`[Detail] ${sectionName} failed:`, err);
      return null;
    }
  }

  function buildFallbackSectionPayload(sectionKey, notes = []) {
    const totalLikes = notes.reduce((sum, note) => sum + (note.likes || 0), 0);
    const totalCollects = notes.reduce((sum, note) => sum + (note.collects || 0), 0);
    const totalComments = notes.reduce((sum, note) => sum + (note.commentCount || 0), 0);
    const avgEngagement = notes.length > 0
      ? Math.round((totalLikes + totalCollects + totalComments) / notes.length)
      : 0;

    return {
      label: ADV_SECTION_LABELS[sectionKey] || '分项分析',
      available: true,
      reason: '高级指标计算失败，以下分析基于当前博主的基础数据做保守判断',
      digest: [
        `当前模块：${ADV_SECTION_LABELS[sectionKey] || sectionKey}。`,
        `当前共有 ${notes.length} 篇笔记，总赞 ${fmtNum(totalLikes)}，总藏 ${fmtNum(totalCollects)}，总评 ${fmtNum(totalComments)}。`,
        `平均互动约 ${fmtNum(avgEngagement)} / 篇。`,
        '该模块的结构化指标计算失败，请基于现有基础数据、笔记表现分布和常见运营经验，给出保守分析，并明确说明数据局限。',
      ].join('\n'),
    };
  }

  function setDetailMode(mode, options = {}) {
    const nextMode = mode === 'deep' ? 'deep' : 'core';
    document.getElementById('btn-focus-core')?.classList.toggle('active', nextMode === 'core');
    document.getElementById('btn-focus-deep')?.classList.toggle('active', nextMode === 'deep');
    saveAnalysisUiPrefs({ detailMode: nextMode });

    if (nextMode === 'core') {
      toggleDeepDive(false, { persist: true, scrollIntoView: false }).catch(() => {});
      if (options.scroll !== false) {
        document.getElementById('blogger-profile-card')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    toggleDeepDive(true, { scrollIntoView: options.scroll !== false, expandFirst: true }).catch(err => {
      console.error('[DeepDive] open failed:', err);
    });
  }

  function getExpandedSectionState() {
    const state = {};
    document.querySelectorAll('.adv-section[data-adv-section]').forEach(section => {
      state[section.dataset.advSection] = section.classList.contains('expanded');
    });
    return state;
  }

  function setAdvancedSectionExpanded(sectionKey, expanded, options = {}) {
    const section = document.querySelector(`.adv-section[data-adv-section="${sectionKey}"]`);
    if (!section) return;
    section.classList.toggle('expanded', !!expanded);
    const stateEl = section.querySelector('.adv-section-state');
    if (stateEl) stateEl.textContent = expanded ? '收起' : '展开';

    if (options.persist !== false) {
      const prefs = getAnalysisUiPrefs();
      saveAnalysisUiPrefs({
        expandedAdvSections: {
          ...prefs.expandedAdvSections,
          [sectionKey]: !!expanded,
        },
      });
    }
  }

  function setAllAdvancedSectionsExpanded(expanded, options = {}) {
    document.querySelectorAll('.adv-section[data-adv-section]').forEach(section => {
      setAdvancedSectionExpanded(section.dataset.advSection, expanded, { persist: false });
    });
    if (options.persist !== false) {
      const next = {};
      document.querySelectorAll('.adv-section[data-adv-section]').forEach(section => {
        next[section.dataset.advSection] = !!expanded;
      });
      saveAnalysisUiPrefs({ expandedAdvSections: next });
    }
    updateExpandAllButton();
  }

  function updateExpandAllButton() {
    const btn = document.getElementById('btn-deep-expand-all');
    if (!btn || !currentDetailWorkspace?.deepRendered) return;
    const sections = Array.from(document.querySelectorAll('.adv-section[data-adv-section]'));
    const allExpanded = sections.length > 0 && sections.every(section => section.classList.contains('expanded'));
    btn.textContent = allExpanded ? '收起全部' : '展开全部';
  }

  function resizeVisibleDeepDiveCharts() {
    document.querySelectorAll('#deep-dive-content [_echarts_instance_]').forEach(el => {
      const chart = typeof echarts !== 'undefined' ? echarts.getInstanceByDom(el) : null;
      if (chart) chart.resize();
    });
  }

  function buildDeepDiveSummaryLine(payloads = {}) {
    const picks = [
      payloads['tag-roi']?.headline,
      payloads.heatmap?.headline,
      payloads['image-count']?.headline,
      payloads['format-roi']?.headline,
      payloads.growth?.headline,
    ].filter(Boolean);

    if (picks.length === 0) return '';
    return picks.slice(0, 3).join(' · ');
  }

  function hydrateDeepDiveSectionUi(payloads = {}) {
    Object.entries(payloads).forEach(([key, payload]) => {
      const summaryEl = document.getElementById(`adv-summary-${key}`);
      if (summaryEl) {
        summaryEl.textContent = payload?.headline || payload?.reason || '';
      }
      if (key === 'growth') {
        const growthSection = document.getElementById('adv-growth-section');
        if (growthSection) growthSection.style.display = payload?.available || payload?.reason ? '' : 'none';
      }
    });

    const summary = document.getElementById('deep-dive-summary');
    if (summary) summary.textContent = buildDeepDiveSummaryLine(payloads);
  }

  async function ensureDeepDiveRendered() {
    if (!currentDetailWorkspace || currentDetailWorkspace.deepRendered) return;

    const { notes, bloggerData, userId, detailAnalyticsProps } = currentDetailWorkspace;
    const summary = document.getElementById('deep-dive-summary');
    if (summary) summary.textContent = '加载中...';

    document.querySelectorAll('.adv-section[data-adv-section]').forEach(section => {
      setAdvancedSectionExpanded(section.dataset.advSection, true, { persist: false });
    });

    const advancedSectionPayloads = runDetailSection('advanced-metrics', () => renderAdvancedMetrics(notes, bloggerData)) || {};
    currentDetailWorkspace.advancedSectionPayloads = advancedSectionPayloads;
    currentDetailWorkspace.deepRendered = true;
    hydrateDeepDiveSectionUi(advancedSectionPayloads);
    await initAdvancedSectionAI(advancedSectionPayloads, userId, notes, detailAnalyticsProps)
      .catch(err => console.error('[AdvancedAI] init failed:', err));

    const prefs = getAnalysisUiPrefs();
    const expanded = prefs.expandedAdvSections || {};
    document.querySelectorAll('.adv-section[data-adv-section]').forEach(section => {
      const key = section.dataset.advSection;
      setAdvancedSectionExpanded(key, !!expanded[key], { persist: false });
    });
    updateExpandAllButton();
    requestAnimationFrame(() => resizeVisibleDeepDiveCharts());
  }

  async function toggleDeepDive(expanded, options = {}) {
    const panel = document.getElementById('deep-dive-panel');
    const content = document.getElementById('deep-dive-content');
    const toggleBtn = document.getElementById('btn-deep-toggle');
    const expandAllBtn = document.getElementById('btn-deep-expand-all');
    if (!panel || !content) return;

    panel.classList.toggle('is-collapsed', !expanded);
    content.classList.toggle('hidden', !expanded);
    if (toggleBtn) toggleBtn.textContent = expanded ? '收起' : '展开';
    if (expandAllBtn) expandAllBtn.classList.toggle('hidden', !expanded);

    if (options.persist !== false) {
      saveAnalysisUiPrefs({ deepDiveExpanded: !!expanded });
    }

    if (!expanded) return;

    await ensureDeepDiveRendered();
    if (options.expandFirst) {
      const anyExpanded = Array.from(document.querySelectorAll('.adv-section[data-adv-section]'))
        .some(section => section.classList.contains('expanded'));
      if (!anyExpanded) {
        const first = document.querySelector('.adv-section[data-adv-section]');
        if (first?.dataset?.advSection) setAdvancedSectionExpanded(first.dataset.advSection, true);
      }
    }
    requestAnimationFrame(() => resizeVisibleDeepDiveCharts());
    if (options.scrollIntoView) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function initDetailWorkspace(userId, bloggerData, notes, detailAnalyticsProps) {
    currentDetailWorkspace = {
      userId,
      bloggerData,
      notes,
      detailAnalyticsProps,
      advancedSectionPayloads: null,
      deepRendered: false,
    };

    replaceWithClone('btn-focus-core')?.addEventListener('click', () => setDetailMode('core'));
    replaceWithClone('btn-focus-deep')?.addEventListener('click', () => setDetailMode('deep'));
    replaceWithClone('btn-deep-toggle')?.addEventListener('click', async () => {
      const panel = document.getElementById('deep-dive-panel');
      const expanded = panel ? panel.classList.contains('is-collapsed') : false;
      await toggleDeepDive(expanded, { scrollIntoView: expanded });
    });
    replaceWithClone('btn-deep-expand-all')?.addEventListener('click', () => {
      const sections = Array.from(document.querySelectorAll('.adv-section[data-adv-section]'));
      const allExpanded = sections.length > 0 && sections.every(section => section.classList.contains('expanded'));
      setAllAdvancedSectionsExpanded(!allExpanded);
    });

    document.querySelectorAll('.adv-section[data-adv-section]').forEach(section => {
      const key = section.dataset.advSection;
      const toggle = section.querySelector('.adv-section-toggle');
      if (!toggle || !key) return;
      const newToggle = toggle.cloneNode(true);
      toggle.parentNode.replaceChild(newToggle, toggle);
      newToggle.addEventListener('click', () => {
        setAdvancedSectionExpanded(key, !section.classList.contains('expanded'));
        updateExpandAllButton();
        requestAnimationFrame(() => resizeVisibleDeepDiveCharts());
      });
      setAdvancedSectionExpanded(key, false, { persist: false });
    });

    const prefs = getAnalysisUiPrefs();
    setDetailMode(prefs.detailMode, { scroll: false });
    if (prefs.deepDiveExpanded || prefs.detailMode === 'deep') {
      toggleDeepDive(true, { scrollIntoView: false }).catch(err => {
        console.error('[DeepDive] restore failed:', err);
      });
    } else {
      toggleDeepDive(false, { persist: false }).catch(() => {});
    }
  }

  async function withExpandedDeepDiveForExport(task) {
    const hadWorkspace = !!currentDetailWorkspace;
    if (!hadWorkspace) return await task();

    const wasExpanded = !document.getElementById('deep-dive-content')?.classList.contains('hidden');
    const sectionState = getExpandedSectionState();
    await toggleDeepDive(true, { persist: false, scrollIntoView: false });
    setAllAdvancedSectionsExpanded(true, { persist: false });

    try {
      return await task();
    } finally {
      Object.entries(sectionState).forEach(([key, expanded]) => {
        setAdvancedSectionExpanded(key, !!expanded, { persist: false });
      });
      updateExpandAllButton();
      await toggleDeepDive(wasExpanded, { persist: false, scrollIntoView: false });
      requestAnimationFrame(() => resizeVisibleDeepDiveCharts());
    }
  }

  // ========== 详情视图 ==========

  async function showDetailView(userId) {
    document.getElementById('overview-view').classList.add('hidden');
    document.getElementById('detail-view').classList.remove('hidden');
    document.getElementById('compare-view').classList.add('hidden');
    document.getElementById('personal-view').classList.add('hidden');
    document.getElementById('compare-selection-bar').classList.add('hidden');
    document.getElementById('nav-bar').classList.remove('hidden');
    setWorkbenchMode('detail');

    const bloggerData = await DATA_STORE.getBloggerData(userId);
    if (!bloggerData || !bloggerData.notes?.length) {
      currentDetailWorkspace = null;
      document.getElementById('subtitle').textContent = '数据不存在或已被删除';
      document.getElementById('detail-header').textContent = '数据分析';
      setWorkbenchMode('compare');
      return;
    }

    const indexEntry = (await DATA_STORE.getBloggerIndex()).find(item => item.userId === userId) || null;
    if (indexEntry) {
      bloggerData.nickname = indexEntry.nickname || bloggerData.nickname;
      bloggerData.avatar = indexEntry.avatar || bloggerData.avatar;
      bloggerData.profileUrl = indexEntry.profileUrl || bloggerData.profileUrl;
      bloggerData.stats = {
        ...(bloggerData.stats || {}),
        followerCount: indexEntry.followerCount ?? bloggerData.stats?.followerCount ?? null,
        followingCount: indexEntry.followingCount ?? bloggerData.stats?.followingCount ?? null,
        likedAndCollectedCount: indexEntry.likedAndCollectedCount ?? bloggerData.stats?.likedAndCollectedCount ?? null,
        redId: indexEntry.redId ?? bloggerData.stats?.redId ?? null,
        desc: indexEntry.desc ?? bloggerData.stats?.desc ?? null,
        gender: indexEntry.gender ?? bloggerData.stats?.gender ?? null,
        ipLocation: indexEntry.ipLocation ?? bloggerData.stats?.ipLocation ?? null,
      };
    }

    const notes = bloggerData.notes;
    const name = bloggerData.nickname || '博主';
    const time = new Date(bloggerData.scrapedAt).toLocaleString('zh-CN');
    const detailAnalyticsProps = buildDetailAnalyticsProps(userId, bloggerData);

    const navName = document.getElementById('nav-blogger-name');
    navName.textContent = `${name} · ${notes.length}篇 · ${time}`;

    const headerEl = document.getElementById('detail-header');
    if (bloggerData.profileUrl) {
      headerEl.innerHTML = `<a href="${esc(bloggerData.profileUrl)}" target="_blank" rel="noopener" class="detail-header-link">${esc(name)} 的数据分析</a>`;
    } else {
      headerEl.textContent = `${name} 的数据分析`;
    }
    document.getElementById('subtitle').textContent =
      `基于 ${notes.length} 篇笔记的运营数据分析`;

    // 返回按钮
    document.getElementById('btn-back').onclick = () => {
      window.location.hash = '#overview';
    };

    // 先渲染右侧工作台，避免左侧复杂模块报错时整块不出现
    await renderWorkbenchDetail(userId, bloggerData);

    // 左侧各模块独立容错，单块失败不影响其余模块
    runDetailSection('blogger-profile', () => renderBloggerProfileCard(bloggerData));
    runDetailSection('overview-cards', () => renderOverviewCards(notes, bloggerData.stats));
    runDetailSection('top-notes', () => {
      renderTopNotes(notes, 'likes', { bloggerUserId: userId });
      bindTabListeners(notes, detailAnalyticsProps, { bloggerUserId: userId });
    });
    runDetailSection('tag-chart', () => renderTagChart(notes));
    runDetailSection('likes-dist', () => renderDistribution(notes, 'likes', 'likes-dist', 'likes-dist-labels'));
    runDetailSection('collects-dist', () => renderDistribution(notes, 'collects', 'collects-dist', 'collects-dist-labels'));
    runDetailSection('insights', () => renderInsights(notes));
    runDetailSection('recommendations', () => renderRecommendations(notes));
    initDetailWorkspace(userId, bloggerData, notes, detailAnalyticsProps);

    initAI(notes, userId, detailAnalyticsProps).catch(err => console.error('[AI] init failed:', err));
    initPdfExport(bloggerData, detailAnalyticsProps).catch(err => console.error('[PDF] init failed:', err));
    runDetailSection('data-export', () => initDataExport(bloggerData));
    initBackendImport(bloggerData, userId).catch(err => console.error('[BackendImport] init failed:', err));

    ANALYTICS.track('analysis_view', {
      view_type: 'detail',
      blogger_count: 1,
      total_notes: notes.length,
      ...detailAnalyticsProps,
    });

    setTimeout(() => startDetailOnboarding(), 300);
  }

  // ========== 博主 Profile 卡片 ==========

  function renderBloggerProfileCard(bloggerData) {
    const section = document.getElementById('blogger-profile-card');
    if (!section) return;
    const stats = bloggerData.stats || {};
    const name = bloggerData.nickname || '未知博主';
    const avatar = bloggerData.avatar || '';
    const profileUrl = bloggerData.profileUrl || '';
    const redId = stats.redId || null;
    const ipLocation = stats.ipLocation || null;
    const desc = stats.desc || null;
    const gender = stats.gender; // 0=未知 1=男 2=女
    const genderIcon = gender === 1 ? '♂' : gender === 2 ? '♀' : '';
    const genderClass = gender === 1 ? 'male' : gender === 2 ? 'female' : '';

    const followingCount = stats.followingCount;
    const followerCount = stats.followerCount;
    const likedAndCollectedCount = stats.likedAndCollectedCount;

    const avatarHtml = avatar
      ? `<img class="bpc-avatar" src="${esc(avatar)}" alt="${esc(name)}" referrerpolicy="no-referrer" onerror="this.style.background='#f0f0f0';this.onerror=null">`
      : '<div class="bpc-avatar bpc-avatar-placeholder"></div>';

    const nameHtml = profileUrl
      ? `<a href="${esc(profileUrl)}" target="_blank" rel="noopener" class="bpc-name-link">${esc(name)}</a>`
      : esc(name);

    const metaItems = [];
    if (redId) metaItems.push(`小红书号：${esc(redId)}`);
    if (ipLocation) metaItems.push(`IP属地：${esc(ipLocation)}`);
    const metaHtml = metaItems.length > 0
      ? `<div class="bpc-meta">${metaItems.join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>` : '';

    const descHtml = desc
      ? `<div class="bpc-desc">${esc(desc).replace(/\n/g, '<br>')}</div>` : '';

    const statsItems = [];
    if (followingCount != null) statsItems.push(`<div class="bpc-stat"><span class="bpc-stat-num">${fmtNum(followingCount)}</span> 关注</div>`);
    if (followerCount != null) statsItems.push(`<div class="bpc-stat"><span class="bpc-stat-num">${fmtNum(followerCount)}</span> 粉丝</div>`);
    if (likedAndCollectedCount != null) statsItems.push(`<div class="bpc-stat"><span class="bpc-stat-num">${fmtNum(likedAndCollectedCount)}</span> 获赞与收藏</div>`);
    const statsHtml = statsItems.length > 0
      ? `<div class="bpc-stats">${statsItems.join('')}</div>` : '';

    section.innerHTML = `
      <div class="bpc-card">
        ${avatarHtml}
        <div class="bpc-body">
          <div class="bpc-name-row">
            <h2 class="bpc-name">${nameHtml}</h2>
            ${genderIcon ? `<span class="bpc-gender ${genderClass}">${genderIcon}</span>` : ''}
          </div>
          ${metaHtml}
          ${descHtml}
          ${statsHtml}
        </div>
      </div>
    `;
    section.classList.remove('hidden');
  }

  // ========== 概览卡片 ==========

  function renderOverviewCards(notes, stats) {
    const totalLikes = notes.reduce((s, n) => s + (n.likes || 0), 0);
    const totalCollects = notes.reduce((s, n) => s + (n.collects || 0), 0);
    const totalComments = notes.reduce((s, n) => s + (n.commentCount || 0), 0);
    const totalImages = notes.reduce((s, n) => s + (n.imageCount || 0), 0);
    const avgEngagement = notes.length > 0
      ? ((totalLikes + totalCollects + totalComments) / notes.length).toFixed(1) : 0;

    const cards = [
      { value: notes.length, label: '笔记总数' },
      { value: fmtNum(totalLikes), label: '总点赞' },
      { value: fmtNum(totalCollects), label: '总收藏' },
      { value: fmtNum(totalComments), label: '总评论' },
    ];
    // v2.7.0: 若已抓到粉丝数，优先展示粉丝指标
    if (stats?.followerCount != null) {
      cards.push({ value: fmtNum(stats.followerCount), label: '粉丝数' });
      // 互动率 = 平均互动 / 粉丝数 × 100%
      if (stats.followerCount > 0) {
        const engagementRate = ((totalLikes + totalCollects + totalComments) / notes.length / stats.followerCount * 100).toFixed(2);
        cards.push({ value: engagementRate + '%', label: '互动率(平均/粉丝)' });
      } else {
        cards.push({ value: avgEngagement, label: '平均互动/篇' });
      }
    } else {
      cards.push({ value: totalImages, label: '总图片' });
      cards.push({ value: avgEngagement, label: '平均互动/篇' });
    }

    document.getElementById('overview-cards').innerHTML = cards.map(c =>
      `<div class="card"><div class="value">${c.value}</div><div class="label">${c.label}</div></div>`
    ).join('');
  }

  // ========== Top N 排行 ==========

  function renderTopNotes(notes, sortKey, options = {}) {
    const sorted = [...notes].sort((a, b) => (b[sortKey] || 0) - (a[sortKey] || 0));
    const top = sorted.slice(0, 10);
    const max = top[0]?.[sortKey] || 1;

    document.getElementById('top-notes').innerHTML = top.map(n => {
      const val = n[sortKey] || 0;
      const pct = (val / max * 100).toFixed(1);
      const title = (n.title || '无标题').substring(0, 25);
      const noteId = n.noteId || n.id || '';
      const clickable = !!(options.bloggerUserId && noteId);
      return `<div class="bar-row ${clickable ? 'clickable' : ''}" ${clickable ? `data-library-note="${esc(noteId)}"` : ''} title="${clickable ? '点击在素材库查看详情' : esc(n.title || '')}">
        <span class="bar-label" title="${esc(n.title)}">${esc(title)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <span class="bar-value">${fmtNum(val)}</span>
      </div>`;
    }).join('');

    if (options.bloggerUserId) {
      document.querySelectorAll('#top-notes [data-library-note]').forEach(row => {
        row.addEventListener('click', () => {
          openLibraryView({
            bloggerUserId: options.bloggerUserId,
            noteId: row.dataset.libraryNote,
          });
        });
      });
    }
  }

  function bindTabListeners(notes, detailAnalyticsProps = {}, options = {}) {
    const tabBar = document.getElementById('tab-bar');
    tabBar.querySelectorAll('.tab').forEach(tab => {
      // 克隆替换以清除旧监听器
      const newTab = tab.cloneNode(true);
      tab.parentNode.replaceChild(newTab, tab);
    });
    tabBar.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        tabBar.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderTopNotes(notes, tab.dataset.sort, options);
        ANALYTICS.track('analysis_interact', {
          action: 'tab_switch',
          detail: tab.dataset.sort || 'unknown',
          ...detailAnalyticsProps,
        });
      });
    });
  }

  // ========== 标签词频 ==========

  function renderTagChart(notes) {
    const tagCount = {};
    for (const n of notes) {
      if (!n.tags) continue;
      for (const t of n.tags) tagCount[t] = (tagCount[t] || 0) + 1;
    }

    const sorted = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 15);
    if (sorted.length === 0) {
      document.getElementById('tag-chart').innerHTML = '<p style="color:#999;font-size:13px">未提取到标签数据</p>';
      return;
    }

    const max = sorted[0][1];
    document.getElementById('tag-chart').innerHTML = sorted.map(([tag, count]) => {
      const pct = (count / max * 100).toFixed(1);
      return `<div class="bar-row">
        <span class="bar-label">#${esc(tag)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
        <span class="bar-value">${count} 篇</span>
      </div>`;
    }).join('');
  }

  // ========== 分布图 ==========

  function renderDistribution(notes, key, containerId, labelsId) {
    const values = notes.map(n => n[key] || 0).sort((a, b) => a - b);
    const container = document.getElementById(containerId);
    const labelsEl = document.getElementById(labelsId);

    container.innerHTML = '';
    labelsEl.innerHTML = '';

    if (values.length === 0) return;

    const min = values[0];
    const max = values[values.length - 1] || 1;
    const bucketCount = Math.min(10, values.length);
    const bucketSize = Math.max(1, Math.ceil((max - min + 1) / bucketCount));
    const buckets = new Array(bucketCount).fill(0);
    const bucketLabels = [];

    for (let i = 0; i < bucketCount; i++) {
      const lo = min + i * bucketSize;
      const hi = lo + bucketSize - 1;
      bucketLabels.push(lo === hi ? `${lo}` : `${lo}-${hi}`);
    }

    for (const v of values) {
      const idx = Math.min(Math.floor((v - min) / bucketSize), bucketCount - 1);
      buckets[idx]++;
    }

    const maxBucket = Math.max(...buckets) || 1;
    container.innerHTML = buckets.map((count, i) => {
      const h = (count / maxBucket * 100).toFixed(1);
      return `<div class="dist-bar" style="height:${h}%" data-label="${bucketLabels[i]}: ${count}篇"></div>`;
    }).join('');

    labelsEl.innerHTML = `<span>${bucketLabels[0]}</span><span>${bucketLabels[bucketLabels.length - 1]}</span>`;
  }

  // ========== 内容洞察 ==========

  function renderInsights(notes) {
    const avgTitleLen = (notes.reduce((s, n) => s + (n.title?.length || 0), 0) / notes.length).toFixed(0);
    const avgContentLen = (notes.reduce((s, n) => s + (n.content?.length || 0), 0) / notes.length).toFixed(0);
    const avgImages = (notes.reduce((s, n) => s + (n.imageCount || 0), 0) / notes.length).toFixed(1);
    const avgTags = (notes.reduce((s, n) => s + (n.tags?.length || 0), 0) / notes.length).toFixed(1);

    const titleBuckets = {};
    for (const n of notes) {
      const len = n.title?.length || 0;
      const bucket = len <= 10 ? '1-10字' : len <= 20 ? '11-20字' : len <= 30 ? '21-30字' : '30+字';
      if (!titleBuckets[bucket]) titleBuckets[bucket] = { count: 0, likes: 0 };
      titleBuckets[bucket].count++;
      titleBuckets[bucket].likes += (n.likes || 0);
    }
    let bestTitleBucket = '', bestTitleAvg = 0;
    for (const [bucket, data] of Object.entries(titleBuckets)) {
      const avg = data.likes / data.count;
      if (avg > bestTitleAvg) { bestTitleAvg = avg; bestTitleBucket = bucket; }
    }

    const imgBuckets = {};
    for (const n of notes) {
      const count = n.imageCount || 0;
      if (!imgBuckets[count]) imgBuckets[count] = { count: 0, likes: 0 };
      imgBuckets[count].count++;
      imgBuckets[count].likes += (n.likes || 0);
    }
    let bestImgCount = 0, bestImgAvg = 0;
    for (const [imgCount, data] of Object.entries(imgBuckets)) {
      if (data.count < 2) continue;
      const avg = data.likes / data.count;
      if (avg > bestImgAvg) { bestImgAvg = avg; bestImgCount = imgCount; }
    }

    const items = [
      { value: avgTitleLen + '字', label: '平均标题长度', detail: `最佳区间: ${bestTitleBucket}（平均 ${fmtNum(Math.round(bestTitleAvg))} 赞）` },
      { value: avgContentLen + '字', label: '平均正文长度', detail: '' },
      { value: avgImages, label: '平均图片数/篇', detail: bestImgCount ? `${bestImgCount} 张图效果最好（平均 ${fmtNum(Math.round(bestImgAvg))} 赞）` : '' },
      { value: avgTags, label: '平均标签数/篇', detail: '' },
    ];

    document.getElementById('content-insights').innerHTML = items.map(i =>
      `<div class="insight-item">
        <div class="insight-value">${i.value}</div>
        <div class="insight-label">${i.label}</div>
        ${i.detail ? `<div class="insight-detail">${i.detail}</div>` : ''}
      </div>`
    ).join('');
  }

  // ========== 运营建议 ==========

  function renderRecommendations(notes) {
    const recs = [];

    const sorted = [...notes].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    const top20pct = sorted.slice(0, Math.max(1, Math.ceil(notes.length * 0.2)));
    const bottom80pct = sorted.slice(Math.ceil(notes.length * 0.2));

    if (top20pct.length > 0 && bottom80pct.length > 0) {
      const topAvgTitle = top20pct.reduce((s, n) => s + (n.title?.length || 0), 0) / top20pct.length;
      const bottomAvgTitle = bottom80pct.reduce((s, n) => s + (n.title?.length || 0), 0) / bottom80pct.length;
      const topAvgContent = top20pct.reduce((s, n) => s + (n.content?.length || 0), 0) / top20pct.length;
      const bottomAvgContent = bottom80pct.reduce((s, n) => s + (n.content?.length || 0), 0) / bottom80pct.length;

      let titleInsight = '';
      if (topAvgTitle > bottomAvgTitle * 1.2) titleInsight = `爆款标题更长（${Math.round(topAvgTitle)} vs ${Math.round(bottomAvgTitle)} 字）`;
      else if (topAvgTitle < bottomAvgTitle * 0.8) titleInsight = `爆款标题更精简（${Math.round(topAvgTitle)} vs ${Math.round(bottomAvgTitle)} 字）`;

      let contentInsight = '';
      if (topAvgContent > bottomAvgContent * 1.3) contentInsight = '，且正文篇幅更长';
      else if (topAvgContent < bottomAvgContent * 0.7) contentInsight = '，且正文更简短精练';

      if (titleInsight) {
        recs.push({ title: '爆款笔记特征', body: `前 20% 的高互动笔记：${titleInsight}${contentInsight}。` });
      }
    }

    const tagLikes = {};
    for (const n of notes) {
      if (!n.tags) continue;
      for (const t of n.tags) {
        if (!tagLikes[t]) tagLikes[t] = { count: 0, totalLikes: 0 };
        tagLikes[t].count++;
        tagLikes[t].totalLikes += (n.likes || 0);
      }
    }
    const tagsByAvgLikes = Object.entries(tagLikes)
      .filter(([, d]) => d.count >= 2)
      .map(([tag, d]) => ({ tag, avg: d.totalLikes / d.count, count: d.count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 5);

    if (tagsByAvgLikes.length > 0) {
      recs.push({
        title: '高效标签推荐',
        body: '以下标签关联的笔记平均互动最高：',
        tags: tagsByAvgLikes.map(t => `${t.tag} (均 ${fmtNum(Math.round(t.avg))} 赞)`),
      });
    }

    const hasImages = notes.filter(n => (n.imageCount || 0) > 0);
    const noImages = notes.filter(n => (n.imageCount || 0) === 0);
    if (hasImages.length > 0 && noImages.length > 0) {
      const avgWithImg = hasImages.reduce((s, n) => s + (n.likes || 0), 0) / hasImages.length;
      const avgNoImg = noImages.reduce((s, n) => s + (n.likes || 0), 0) / noImages.length;
      if (avgWithImg > avgNoImg * 1.5) {
        recs.push({
          title: '图片提升互动',
          body: `有图笔记平均 ${fmtNum(Math.round(avgWithImg))} 赞，无图仅 ${fmtNum(Math.round(avgNoImg))} 赞。建议每篇都配图。`,
        });
      }
    }

    if (notes.length >= 10) {
      recs.push({
        title: '内容量级',
        body: `当前共 ${notes.length} 篇笔记，总互动 ${fmtNum(notes.reduce((s, n) => s + (n.likes || 0) + (n.collects || 0), 0))}。持续产出是涨粉的基础，建议保持稳定的发布节奏。`,
      });
    }

    if (recs.length === 0) {
      recs.push({ title: '数据量不足', body: '建议抓取更多笔记（至少 10 篇）以获得有意义的分析结果。' });
    }

    document.getElementById('recommendations').innerHTML = recs.map(r =>
      `<div class="rec-item">
        <div class="rec-title">${r.title}</div>
        <div class="rec-body">${r.body}</div>
        ${r.tags ? `<div style="margin-top:6px">${r.tags.map(t => `<span class="rec-tag">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>`
    ).join('');
  }

  // ========== 深度洞察（v2.7.0）==========

  function computeAdvancedMetrics(notes) {
    if (!notes || notes.length === 0) return null;

    const likesArr = notes.map(n => n.likes || 0);
    const totalLikes = likesArr.reduce((s, v) => s + v, 0);
    const totalCollects = notes.reduce((s, n) => s + (n.collects || 0), 0);
    const totalComments = notes.reduce((s, n) => s + (n.commentCount || 0), 0);
    const overallAvgLikes = totalLikes / notes.length;

    const sortedLikes = [...likesArr].sort((a, b) => a - b);
    const mid = Math.floor(sortedLikes.length / 2);
    const median = sortedLikes.length % 2 === 0
      ? (sortedLikes[mid - 1] + sortedLikes[mid]) / 2
      : sortedLikes[mid];

    // 1. 收藏价值率 = 总收藏 / 总点赞
    const collectValueRatio = totalLikes > 0 ? totalCollects / totalLikes : 0;
    // 2. 讨论价值率 = 总评论 / 总点赞
    const discussValueRatio = totalLikes > 0 ? totalComments / totalLikes : 0;

    // 3. 标签 ROI（要求每个 tag 至少 2 篇）
    const tagStats = {};
    for (const n of notes) {
      const lk = n.likes || 0;
      for (const tag of (n.tags || [])) {
        if (!tagStats[tag]) tagStats[tag] = { count: 0, totalLikes: 0 };
        tagStats[tag].count++;
        tagStats[tag].totalLikes += lk;
      }
    }
    const tagROI = Object.entries(tagStats)
      .filter(([, s]) => s.count >= 2)
      .map(([tag, s]) => ({
        tag,
        count: s.count,
        avgLikes: s.totalLikes / s.count,
        roi: overallAvgLikes > 0 ? (s.totalLikes / s.count) / overallAvgLikes : 1,
      }))
      .sort((a, b) => b.roi - a.roi);

    const topTags = tagROI.slice(0, 8);
    const bottomTags = tagROI.length > 10 ? tagROI.slice(-5).reverse() : [];

    // 4. 爆款率：likes ≥ 2×median
    const viralThreshold = Math.max(1, median * 2);
    const viralCount = notes.filter(n => (n.likes || 0) >= viralThreshold).length;
    const viralRate = (viralCount / notes.length) * 100;

    // 5. 标题模式识别
    const patternDefs = [
      {
        key: 'number',
        name: '数字型',
        desc: '"5个 / 3招" 数字开头或穿插',
        test: t => /\d/.test(t),
      },
      {
        key: 'question',
        name: '疑问型',
        desc: '提问 / 反问引发好奇',
        test: t => /[?？]|怎么|为什么|是不是|有没有|要不要|该不该|是否/.test(t),
      },
      {
        key: 'exclaim',
        name: '惊叹型',
        desc: '感叹符 / 强情绪词',
        test: t => /[!！]|绝了|太|真的|爱了|惊艳|无语|崩溃|救命/.test(t),
      },
      {
        key: 'list',
        name: '清单型',
        desc: '"N 个 / N 招 / N 件" 列表结构',
        test: t => /\d+\s*(个|招|件|条|步|种|款|位|点|句|招式|种|大)/.test(t),
      },
    ];

    const titlePatterns = patternDefs.map(p => {
      const matched = notes.filter(n => p.test(n.title || ''));
      const matchedAvg = matched.length > 0
        ? matched.reduce((s, n) => s + (n.likes || 0), 0) / matched.length
        : 0;
      return {
        key: p.key,
        name: p.name,
        desc: p.desc,
        count: matched.length,
        avgLikes: matchedAvg,
        lift: overallAvgLikes > 0 ? (matchedAvg / overallAvgLikes - 1) * 100 : 0,
      };
    });

    return {
      collectValueRatio,
      discussValueRatio,
      tagROI: { top: topTags, bottom: bottomTags, total: tagROI.length },
      viral: {
        median,
        threshold: viralThreshold,
        count: viralCount,
        total: notes.length,
        rate: viralRate,
      },
      titlePatterns,
      overallAvgLikes,
    };
  }

  const ADV_SECTION_LABELS = {
    'tag-roi': '标签 ROI 排行',
    'title-pattern': '标题模式效果',
    heatmap: '发布时段热力图',
    'image-count': '图片数量 vs 互动',
    'format-roi': '视频 vs 图文 ROI',
    'content-len': '正文长度 vs 互动',
    growth: '数据增长趋势',
  };

  function disposeChartInstance(el) {
    if (!el || typeof echarts === 'undefined') return;
    const chart = echarts.getInstanceByDom(el);
    if (chart) chart.dispose();
    const observer = chartResizeObservers.get(el.id);
    if (observer) {
      observer.disconnect();
      chartResizeObservers.delete(el.id);
    }
  }

  function bindChartResize(el, chart) {
    if (!el || !chart) return;
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => chart.resize());
      observer.observe(el);
      chartResizeObservers.set(el.id, observer);
    }
    requestAnimationFrame(() => chart.resize());
    setTimeout(() => chart.resize(), 80);
  }

  function initManagedChart(el, option) {
    if (!el || typeof echarts === 'undefined') return null;
    disposeChartInstance(el);
    el.innerHTML = '';
    const chart = echarts.init(el, null, { renderer: 'canvas' });
    chart.setOption(option);
    bindChartResize(el, chart);
    return chart;
  }

  function computeHeatmapData(notes) {
    const timed = notes.filter(n => n.publishTimestamp);
    if (timed.length < 3) {
      return { available: false, reason: '需要至少 3 篇有精确发布时间的笔记（重新抓取以获取）' };
    }

    const grid = {};
    for (const n of timed) {
      const d = new Date(n.publishTimestamp);
      const day = d.getDay();
      const hour = d.getHours();
      const key = `${day}-${hour}`;
      if (!grid[key]) grid[key] = { sum: 0, count: 0 };
      grid[key].sum += (n.likes || 0) + (n.collects || 0);
      grid[key].count++;
    }

    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const hours = Array.from({ length: 24 }, (_, i) => `${i}时`);
    const data = [];
    const rankedSlots = [];
    let maxVal = 0;

    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const g = grid[`${day}-${hour}`];
        const val = g ? Math.round(g.sum / g.count) : 0;
        data.push([hour, day, val]);
        if (g) {
          rankedSlots.push({
            day,
            hour,
            avgEngagement: val,
            count: g.count,
          });
        }
        if (val > maxVal) maxVal = val;
      }
    }

    rankedSlots.sort((a, b) => b.avgEngagement - a.avgEngagement);
    return {
      available: true,
      days,
      hours,
      data,
      maxVal,
      sampleCount: timed.length,
      topSlots: rankedSlots.slice(0, 3),
      bottomSlots: rankedSlots.slice(-2),
    };
  }

  function computeImageCountData(notes) {
    const buckets = [
      { label: '1 张', min: 0, max: 1 },
      { label: '2-3 张', min: 2, max: 3 },
      { label: '4-6 张', min: 4, max: 6 },
      { label: '7-9 张', min: 7, max: 9 },
      { label: '10+', min: 10, max: 999 },
    ];
    const result = buckets.map(b => {
      const matched = notes.filter(n => {
        const c = n.imageCount || n.images?.length || 0;
        return c >= b.min && c <= b.max;
      });
      return {
        label: b.label,
        count: matched.length,
        avgLikes: matched.length > 0 ? matched.reduce((s, n) => s + (n.likes || 0), 0) / matched.length : 0,
      };
    }).filter(r => r.count > 0);

    if (result.length < 2) {
      return { available: false, reason: '图片数量分布不足' };
    }

    const sorted = [...result].sort((a, b) => b.avgLikes - a.avgLikes);
    return {
      available: true,
      result,
      maxAvg: Math.max(...result.map(r => r.avgLikes)),
      best: sorted[0],
      weakest: sorted[sorted.length - 1],
    };
  }

  function computeFormatRoiData(notes) {
    const videos = notes.filter(n => n.video || n.isVideo);
    const images = notes.filter(n => !n.video && !n.isVideo);
    if (videos.length === 0 || images.length === 0) {
      return { available: false, reason: '需要同时有视频和图文笔记才能对比' };
    }

    const avgFn = arr => arr.reduce((s, n) => s + (n.likes || 0), 0) / arr.length;
    const avgCollFn = arr => arr.reduce((s, n) => s + (n.collects || 0), 0) / arr.length;
    const data = [
      { name: '图文', count: images.length, likes: avgFn(images), collects: avgCollFn(images) },
      { name: '视频', count: videos.length, likes: avgFn(videos), collects: avgCollFn(videos) },
    ];

    return {
      available: true,
      data,
      winnerByLikes: data.slice().sort((a, b) => b.likes - a.likes)[0],
      winnerByCollects: data.slice().sort((a, b) => b.collects - a.collects)[0],
    };
  }

  function computeContentLenData(notes) {
    const withContent = notes.filter(n => n.content);
    if (withContent.length < 3) {
      return { available: false, reason: '正文内容不足' };
    }

    const lengths = withContent.map(n => n.content.length).sort((a, b) => a - b);
    const p33 = lengths[Math.floor(lengths.length / 3)];
    const p66 = lengths[Math.floor(lengths.length * 2 / 3)];

    const buckets = [
      { label: `短文 (≤${p33}字)`, notes: withContent.filter(n => n.content.length <= p33) },
      { label: `中篇 (${p33 + 1}-${p66}字)`, notes: withContent.filter(n => n.content.length > p33 && n.content.length <= p66) },
      { label: `长文 (>${p66}字)`, notes: withContent.filter(n => n.content.length > p66) },
    ].filter(b => b.notes.length > 0);

    const result = buckets.map(b => ({
      label: b.label,
      count: b.notes.length,
      avgLikes: b.notes.reduce((s, n) => s + (n.likes || 0), 0) / b.notes.length,
    }));
    const sorted = [...result].sort((a, b) => b.avgLikes - a.avgLikes);

    return {
      available: true,
      result,
      maxAvg: Math.max(...result.map(r => r.avgLikes)),
      best: sorted[0],
      weakest: sorted[sorted.length - 1],
    };
  }

  function computeGrowthData(bloggerData) {
    const snapshots = bloggerData?.snapshots;
    if (!Array.isArray(snapshots) || snapshots.length < 2) {
      return { available: false, reason: '至少需要两次抓取快照才能生成趋势分析' };
    }

    const dates = snapshots.map(s => {
      const d = new Date(s.ts);
      return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    });
    const series = [
      { name: '总赞', data: snapshots.map(s => s.totalLikes || 0), color: '#ff2442' },
      { name: '总藏', data: snapshots.map(s => s.totalCollects || 0), color: '#ff9500' },
      { name: '笔记数', data: snapshots.map(s => s.noteCount || 0), color: '#36d', yAxisIndex: 1 },
    ];
    if (snapshots.some(s => s.followerCount != null)) {
      series.push({
        name: '粉丝',
        data: snapshots.map(s => s.followerCount ?? null),
        color: '#52c41a',
        yAxisIndex: 1,
      });
    }

    const first = snapshots[0];
    const last = snapshots[snapshots.length - 1];
    return {
      available: true,
      snapshots,
      dates,
      series,
      deltaLikes: (last.totalLikes || 0) - (first.totalLikes || 0),
      deltaCollects: (last.totalCollects || 0) - (first.totalCollects || 0),
      deltaNotes: (last.noteCount || 0) - (first.noteCount || 0),
      deltaFollowers: (last.followerCount ?? 0) - (first.followerCount ?? 0),
    };
  }

  function buildAdvancedSectionPayloads(metrics, notes, bloggerData) {
    const heatmap = computeHeatmapData(notes);
    const imageCount = computeImageCountData(notes);
    const formatRoi = computeFormatRoiData(notes);
    const contentLen = computeContentLenData(notes);
    const growth = computeGrowthData(bloggerData);
    const bestTag = metrics.tagROI.top[0] || null;
    const weakestTag = metrics.tagROI.bottom[0] || null;
    const bestPattern = metrics.titlePatterns.slice().sort((a, b) => b.lift - a.lift)[0] || null;
    const weakestPattern = metrics.titlePatterns.slice().sort((a, b) => a.lift - b.lift)[0] || null;

    return {
      'tag-roi': {
        label: ADV_SECTION_LABELS['tag-roi'],
        available: true,
        headline: metrics.tagROI.top.length > 0
          ? `#${bestTag.tag} ROI ${bestTag.roi.toFixed(2)}×，样本 ${bestTag.count} 篇`
          : '标签样本不足，先别急着按标签下结论',
        reason: metrics.tagROI.top.length > 0 ? '' : '当前标签样本偏少（每个标签至少需要 2 篇笔记才更稳）',
        digest: metrics.tagROI.top.length > 0 ? [
          `整体平均点赞 ${fmtNum(Math.round(metrics.overallAvgLikes))}。`,
          bestTag ? `ROI 最高标签是 #${bestTag.tag}，平均 ${fmtNum(Math.round(bestTag.avgLikes))} 赞，ROI ${bestTag.roi.toFixed(2)}×，样本 ${bestTag.count} 篇。` : '',
          weakestTag ? `当前弱势标签是 #${weakestTag.tag}，ROI ${weakestTag.roi.toFixed(2)}×。` : '',
          `共识别到 ${metrics.tagROI.total} 个满足样本条件的标签。`,
        ].filter(Boolean).join('\n') : [
          `整体平均点赞 ${fmtNum(Math.round(metrics.overallAvgLikes))}。`,
          '当前标签样本偏少，暂时没有足够多的标签达到稳定比较条件。',
          `当前共有 ${notes.length} 篇笔记，可结合整体内容结构给出保守建议。`,
        ].join('\n'),
      },
      'title-pattern': {
        label: ADV_SECTION_LABELS['title-pattern'],
        available: true,
        headline: bestPattern
          ? `${bestPattern.name}标题较整体 ${bestPattern.lift >= 0 ? '+' : ''}${bestPattern.lift.toFixed(0)}%`
          : '标题模式样本偏少，先看整体标题风格',
        reason: metrics.titlePatterns.length > 0 ? '' : '标题模式样本偏少',
        digest: metrics.titlePatterns.length > 0 ? [
          `整体平均点赞 ${fmtNum(Math.round(metrics.overallAvgLikes))}。`,
          bestPattern ? `效果最好的标题模式是 ${bestPattern.name}，平均 ${fmtNum(Math.round(bestPattern.avgLikes))} 赞，较整体 ${bestPattern.lift >= 0 ? '+' : ''}${bestPattern.lift.toFixed(0)}%。` : '',
          weakestPattern ? `效果最弱的标题模式是 ${weakestPattern.name}，较整体 ${weakestPattern.lift >= 0 ? '+' : ''}${weakestPattern.lift.toFixed(0)}%。` : '',
          ...metrics.titlePatterns.map(item => `${item.name}: ${item.count} 篇，均赞 ${fmtNum(Math.round(item.avgLikes))}`),
        ].filter(Boolean).join('\n') : [
          `整体平均点赞 ${fmtNum(Math.round(metrics.overallAvgLikes))}。`,
          `当前共有 ${notes.length} 篇笔记，但标题模式对比样本仍偏少。`,
          '请基于现有笔记的标题风格给出保守分析，不要过度下结论。',
        ].join('\n'),
      },
      heatmap: {
        label: ADV_SECTION_LABELS.heatmap,
        available: true,
        headline: heatmap.available && heatmap.topSlots.length > 0
          ? `${heatmap.days[heatmap.topSlots[0].day]} ${heatmap.topSlots[0].hour}:00 互动最高`
          : (heatmap.reason || '发布时间样本不足'),
        reason: heatmap.reason || '',
        digest: heatmap.available ? [
          `共 ${heatmap.sampleCount} 篇笔记带精确发布时间。`,
          ...heatmap.topSlots.map((slot, idx) => `高表现时段 ${idx + 1}: ${heatmap.days[slot.day]} ${slot.hour}:00，平均互动 ${fmtNum(slot.avgEngagement)}，样本 ${slot.count} 篇。`),
        ].join('\n') : [
          heatmap.reason || '发布时间样本不足。',
          `当前共有 ${notes.length} 篇笔记，但精确发布时间样本不足。`,
          '请基于已有抓取情况说明目前不能稳定判断发文时段，并给出后续抓取建议。',
        ].join('\n'),
      },
      'image-count': {
        label: ADV_SECTION_LABELS['image-count'],
        available: true,
        headline: imageCount.available
          ? `${imageCount.best.label} 表现最好，均赞 ${fmtNum(Math.round(imageCount.best.avgLikes))}`
          : (imageCount.reason || '图片数量分组不足'),
        reason: imageCount.reason || '',
        digest: imageCount.available ? [
          `图片数分组共 ${imageCount.result.length} 桶。`,
          `最佳分组 ${imageCount.best.label}，平均 ${fmtNum(Math.round(imageCount.best.avgLikes))} 赞，样本 ${imageCount.best.count} 篇。`,
          `较弱分组 ${imageCount.weakest.label}，平均 ${fmtNum(Math.round(imageCount.weakest.avgLikes))} 赞。`,
        ].join('\n') : [
          imageCount.reason || '图片数量分组不足。',
          `当前共有 ${notes.length} 篇笔记。`,
          '请基于现有样本说明暂时无法稳定判断最优图片数，并给出保守建议。',
        ].join('\n'),
      },
      'format-roi': {
        label: ADV_SECTION_LABELS['format-roi'],
        available: true,
        headline: formatRoi.available
          ? `${formatRoi.winnerByLikes.name} 互动更强`
          : (formatRoi.reason || '图文/视频样本不足'),
        reason: formatRoi.reason || '',
        digest: formatRoi.available ? [
          ...formatRoi.data.map(item => `${item.name}: ${item.count} 篇，平均 ${fmtNum(Math.round(item.likes))} 赞 / ${fmtNum(Math.round(item.collects))} 藏。`),
          `点赞表现更强的是 ${formatRoi.winnerByLikes.name}，收藏表现更强的是 ${formatRoi.winnerByCollects.name}。`,
        ].join('\n') : [
          formatRoi.reason || '图文/视频对比样本不足。',
          `当前共有 ${notes.length} 篇笔记。`,
          '请说明目前为何无法稳定比较内容形式，并给出后续采样建议。',
        ].join('\n'),
      },
      'content-len': {
        label: ADV_SECTION_LABELS['content-len'],
        available: true,
        headline: contentLen.available
          ? `${contentLen.best.label} 当前更稳`
          : (contentLen.reason || '正文长度样本不足'),
        reason: contentLen.reason || '',
        digest: contentLen.available ? [
          ...contentLen.result.map(item => `${item.label}: ${item.count} 篇，平均 ${fmtNum(Math.round(item.avgLikes))} 赞。`),
          `当前最优正文长度分组是 ${contentLen.best.label}。`,
        ].join('\n') : [
          contentLen.reason || '正文长度样本不足。',
          `当前共有 ${notes.length} 篇笔记。`,
          '请基于现有正文样本说明局限，并给出保守的长度建议。',
        ].join('\n'),
      },
      growth: {
        label: ADV_SECTION_LABELS.growth,
        available: true,
        headline: growth.available
          ? `总赞 ${growth.deltaLikes >= 0 ? '+' : ''}${fmtNum(growth.deltaLikes)}，笔记 ${growth.deltaNotes >= 0 ? '+' : ''}${fmtNum(growth.deltaNotes)}`
          : (growth.reason || '增长趋势样本不足'),
        reason: growth.reason || '',
        digest: growth.available ? [
          `共 ${growth.snapshots.length} 次快照。`,
          `总赞变化 ${growth.deltaLikes >= 0 ? '+' : ''}${fmtNum(growth.deltaLikes)}，总藏变化 ${growth.deltaCollects >= 0 ? '+' : ''}${fmtNum(growth.deltaCollects)}。`,
          `笔记数变化 ${growth.deltaNotes >= 0 ? '+' : ''}${fmtNum(growth.deltaNotes)}${growth.series.some(s => s.name === '粉丝') ? `，粉丝变化 ${growth.deltaFollowers >= 0 ? '+' : ''}${fmtNum(growth.deltaFollowers)}` : ''}。`,
        ].join('\n') : [
          growth.reason || '增长趋势样本不足。',
          '当前抓取快照不足以形成稳定趋势线。',
          '请说明还需要补哪些抓取频次，才能做更可靠的增长判断。',
        ].join('\n'),
      },
    };
  }

  function renderAdvancedMetrics(notes, bloggerData) {
    const metrics = computeAdvancedMetrics(notes);
    if (!metrics) return {};

    // ----- KPI 卡片 -----
    const kpiEl = document.getElementById('adv-kpi-grid');
    if (kpiEl) {
      kpiEl.innerHTML = `
        <div class="adv-kpi">
          <div class="adv-kpi-value">${(metrics.collectValueRatio * 100).toFixed(1)}<span class="adv-kpi-unit">%</span></div>
          <div class="adv-kpi-label">收藏价值率</div>
          <div class="adv-kpi-hint">每 100 次点赞带来 ${(metrics.collectValueRatio * 100).toFixed(1)} 次收藏</div>
        </div>
        <div class="adv-kpi">
          <div class="adv-kpi-value">${(metrics.discussValueRatio * 100).toFixed(2)}<span class="adv-kpi-unit">%</span></div>
          <div class="adv-kpi-label">讨论价值率</div>
          <div class="adv-kpi-hint">每 100 次点赞带来 ${(metrics.discussValueRatio * 100).toFixed(2)} 条评论</div>
        </div>
        <div class="adv-kpi">
          <div class="adv-kpi-value">${metrics.viral.rate.toFixed(1)}<span class="adv-kpi-unit">%</span></div>
          <div class="adv-kpi-label">爆款率</div>
          <div class="adv-kpi-hint">${metrics.viral.count}/${metrics.viral.total} 篇 ≥ ${fmtNum(Math.round(metrics.viral.threshold))} 赞</div>
        </div>
        <div class="adv-kpi">
          <div class="adv-kpi-value">${fmtNum(Math.round(metrics.viral.median))}</div>
          <div class="adv-kpi-label">点赞中位数</div>
          <div class="adv-kpi-hint">爆款门槛 = 2× 中位数</div>
        </div>
      `;
    }

    // ----- 标签 ROI 图 -----
    renderTagRoiChart(metrics);

    // ----- 标题模式图 + 卡片 -----
    renderTitlePatternChart(metrics);

    // ----- v2.7.1 新增 4 张图 -----
    renderHeatmapChart(notes);
    renderImageCountChart(notes);
    renderFormatRoiChart(notes);
    renderContentLenChart(notes);
    renderGrowthChart(bloggerData);

    return buildAdvancedSectionPayloads(metrics, notes, bloggerData);
  }

  function renderTagRoiChart(metrics) {
    const el = document.getElementById('adv-tag-roi-chart');
    if (!el) return;
    disposeChartInstance(el);
    if (metrics.tagROI.top.length === 0) {
      el.innerHTML = '<p class="adv-empty">数据量不足（每个标签至少需要 2 篇笔记）</p>';
      return;
    }
    if (typeof echarts === 'undefined') {
      // 降级为 HTML 横条图
      const max = metrics.tagROI.top[0].roi || 1;
      el.innerHTML = metrics.tagROI.top.map(t => {
        const pct = Math.min(100, (t.roi / max) * 100).toFixed(1);
        const color = t.roi >= 1.5 ? '#ff2442' : t.roi >= 1 ? '#ff7a90' : '#cbd5e0';
        return `<div class="bar-row">
          <span class="bar-label" title="${esc(t.tag)}">#${esc(t.tag.length > 10 ? t.tag.slice(0, 9) + '…' : t.tag)}</span>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
          <span class="bar-value">${t.roi.toFixed(2)}×</span>
        </div>`;
      }).join('');
      return;
    }

    const top = metrics.tagROI.top.slice().reverse(); // 反转后底部是 #1
    initManagedChart(el, {
      grid: { left: 96, right: 70, top: 16, bottom: 24 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: params => {
          const item = top[params[0].dataIndex];
          return `#${esc(item.tag)}<br/>平均 <b>${fmtNum(Math.round(item.avgLikes))}</b> 赞<br/>ROI <b>${item.roi.toFixed(2)}×</b>（${item.count} 篇）`;
        },
      },
      xAxis: {
        type: 'value',
        axisLabel: { formatter: '{value}×', color: '#999', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      yAxis: {
        type: 'category',
        data: top.map(t => '#' + (t.tag.length > 9 ? t.tag.slice(0, 8) + '…' : t.tag)),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: '#666', fontSize: 11 },
      },
      series: [{
        type: 'bar',
        data: top.map(t => ({
          value: Number(t.roi.toFixed(2)),
          itemStyle: {
            color: t.roi >= 1.5 ? '#ff2442' : t.roi >= 1 ? '#ff7a90' : '#cbd5e0',
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barMaxWidth: 22,
        label: {
          show: true,
          position: 'right',
          formatter: ({ value }) => value.toFixed(2) + '×',
          color: '#666',
          fontSize: 11,
        },
        markLine: {
          symbol: 'none',
          lineStyle: { color: '#999', type: 'dashed', width: 1 },
          data: [{ xAxis: 1, label: { formatter: '基线 1×', color: '#999', fontSize: 10 } }],
        },
      }],
    });
  }

  function renderTitlePatternChart(metrics) {
    const el = document.getElementById('adv-title-pattern-chart');
    const cards = document.getElementById('adv-title-pattern-cards');

    if (cards) {
      cards.innerHTML = metrics.titlePatterns.map(p => {
        const liftClass = p.lift >= 20 ? 'pos' : p.lift >= -10 ? 'neutral' : 'neg';
        const liftSign = p.lift >= 0 ? '+' : '';
        return `<div class="adv-pattern-card">
          <div class="adv-pattern-name">${esc(p.name)}</div>
          <div class="adv-pattern-count">${p.count} 篇 · 均 ${fmtNum(Math.round(p.avgLikes))} 赞</div>
          <div class="adv-pattern-lift ${liftClass}">${liftSign}${p.lift.toFixed(0)}% vs 整体</div>
          <div class="adv-pattern-desc">${esc(p.desc)}</div>
        </div>`;
      }).join('');
    }

    if (!el) return;
    disposeChartInstance(el);
    if (typeof echarts === 'undefined') {
      el.innerHTML = ''; // 降级时只显示卡片
      return;
    }
    initManagedChart(el, {
      grid: { left: 56, right: 30, top: 30, bottom: 36 },
      tooltip: {
        trigger: 'axis',
        formatter: params => {
          const p = metrics.titlePatterns[params[0].dataIndex];
          const liftSign = p.lift >= 0 ? '+' : '';
          return `${esc(p.name)}<br/>${p.count} 篇<br/>平均 <b>${fmtNum(Math.round(p.avgLikes))}</b> 赞<br/>${liftSign}${p.lift.toFixed(0)}% vs 整体`;
        },
      },
      xAxis: {
        type: 'category',
        data: metrics.titlePatterns.map(p => p.name),
        axisLine: { lineStyle: { color: '#ccc' } },
        axisLabel: { color: '#666', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        name: '平均点赞',
        nameTextStyle: { color: '#999', fontSize: 11 },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
        axisLabel: { color: '#999', fontSize: 10 },
      },
      series: [{
        type: 'bar',
        data: metrics.titlePatterns.map(p => ({
          value: Math.round(p.avgLikes),
          itemStyle: {
            color: p.lift >= 20 ? '#ff2442' : p.lift >= -10 ? '#ff7a90' : '#cbd5e0',
            borderRadius: [4, 4, 0, 0],
          },
        })),
        barMaxWidth: 56,
        label: {
          show: true, position: 'top', color: '#666', fontSize: 11,
          formatter: ({ value }) => fmtNum(value),
        },
        markLine: {
          symbol: 'none',
          lineStyle: { color: '#999', type: 'dashed', width: 1 },
          data: [{ yAxis: Math.round(metrics.overallAvgLikes), label: { formatter: '整体均值', color: '#999', fontSize: 10 } }],
        },
      }],
    });
  }

  // ========== v2.7.1 深度洞察图表 ==========

  function renderHeatmapChart(notes) {
    const el = document.getElementById('adv-heatmap-chart');
    if (!el) return;
    disposeChartInstance(el);
    if (typeof echarts === 'undefined') return;

    const heatmap = computeHeatmapData(notes);
    if (!heatmap.available) {
      el.innerHTML = `<p class="adv-empty">${esc(heatmap.reason)}</p>`;
      return;
    }

    initManagedChart(el, {
      tooltip: {
        formatter: p => `${heatmap.days[p.data[1]]} ${p.data[0]}:00<br/>平均互动 <b>${fmtNum(p.data[2])}</b>`,
      },
      grid: { left: 48, right: 24, top: 12, bottom: 36 },
      xAxis: {
        type: 'category',
        data: heatmap.hours,
        splitArea: { show: true },
        axisLabel: { color: '#999', fontSize: 10, interval: 1 },
      },
      yAxis: {
        type: 'category',
        data: heatmap.days,
        axisLabel: { color: '#666', fontSize: 11 },
      },
      visualMap: {
        min: 0,
        max: heatmap.maxVal || 1,
        calculable: false,
        orient: 'horizontal',
        left: 'center',
        bottom: 0,
        itemWidth: 10,
        itemHeight: 80,
        textStyle: { color: '#999', fontSize: 10 },
        inRange: { color: ['#fff5f5', '#ffb3be', '#ff2442'] },
      },
      series: [{
        type: 'heatmap',
        data: heatmap.data,
        label: { show: false },
        emphasis: {
          itemStyle: { shadowBlur: 6, shadowColor: 'rgba(0,0,0,0.2)' },
        },
      }],
    });
  }

  function renderImageCountChart(notes) {
    const el = document.getElementById('adv-image-count-chart');
    if (!el) return;
    disposeChartInstance(el);
    if (typeof echarts === 'undefined') return;

    const imageCount = computeImageCountData(notes);
    if (!imageCount.available) {
      el.innerHTML = `<p class="adv-empty">${esc(imageCount.reason)}</p>`;
      return;
    }

    initManagedChart(el, {
      grid: { left: 56, right: 30, top: 20, bottom: 36 },
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/>${imageCount.result[p[0].dataIndex].count} 篇 · 平均 <b>${fmtNum(Math.round(p[0].value))}</b> 赞` },
      xAxis: { type: 'category', data: imageCount.result.map(r => r.label), axisLabel: { color: '#666', fontSize: 11 } },
      yAxis: { type: 'value', name: '平均赞', nameTextStyle: { color: '#999', fontSize: 10 }, splitLine: { lineStyle: { color: '#f0f0f0' } }, axisLabel: { color: '#999', fontSize: 10 } },
      series: [{
        type: 'bar',
        data: imageCount.result.map(r => ({
          value: Math.round(r.avgLikes),
          itemStyle: { color: r.avgLikes >= imageCount.maxAvg * 0.8 ? '#ff2442' : '#ff9db0', borderRadius: [4, 4, 0, 0] },
        })),
        barMaxWidth: 48,
        label: { show: true, position: 'top', color: '#666', fontSize: 11, formatter: ({ value }) => fmtNum(value) },
      }],
    });
  }

  function renderFormatRoiChart(notes) {
    const el = document.getElementById('adv-format-roi-chart');
    if (!el) return;
    disposeChartInstance(el);
    if (typeof echarts === 'undefined') return;

    const formatRoi = computeFormatRoiData(notes);
    if (!formatRoi.available) {
      el.innerHTML = `<p class="adv-empty">${esc(formatRoi.reason)}</p>`;
      return;
    }

    initManagedChart(el, {
      grid: { left: 56, right: 30, top: 30, bottom: 36 },
      tooltip: { trigger: 'axis' },
      legend: { data: ['平均赞', '平均藏'], top: 0, textStyle: { fontSize: 11, color: '#666' } },
      xAxis: { type: 'category', data: formatRoi.data.map(d => `${d.name} (${d.count}篇)`), axisLabel: { color: '#666', fontSize: 12 } },
      yAxis: { type: 'value', splitLine: { lineStyle: { color: '#f0f0f0' } }, axisLabel: { color: '#999', fontSize: 10 } },
      series: [
        {
          name: '平均赞', type: 'bar', data: formatRoi.data.map(d => Math.round(d.likes)),
          itemStyle: { color: '#ff2442', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 40,
          label: { show: true, position: 'top', color: '#666', fontSize: 11, formatter: ({ value }) => fmtNum(value) },
        },
        {
          name: '平均藏', type: 'bar', data: formatRoi.data.map(d => Math.round(d.collects)),
          itemStyle: { color: '#ffa0b0', borderRadius: [4, 4, 0, 0] }, barMaxWidth: 40,
          label: { show: true, position: 'top', color: '#999', fontSize: 11, formatter: ({ value }) => fmtNum(value) },
        },
      ],
    });
  }

  function renderContentLenChart(notes) {
    const el = document.getElementById('adv-content-len-chart');
    if (!el) return;
    disposeChartInstance(el);
    if (typeof echarts === 'undefined') return;

    const contentLen = computeContentLenData(notes);
    if (!contentLen.available) {
      el.innerHTML = `<p class="adv-empty">${esc(contentLen.reason)}</p>`;
      return;
    }

    initManagedChart(el, {
      grid: { left: 56, right: 30, top: 20, bottom: 36 },
      tooltip: { trigger: 'axis', formatter: p => `${p[0].name}<br/>${contentLen.result[p[0].dataIndex].count} 篇 · 平均 <b>${fmtNum(Math.round(p[0].value))}</b> 赞` },
      xAxis: { type: 'category', data: contentLen.result.map(r => r.label), axisLabel: { color: '#666', fontSize: 11 } },
      yAxis: { type: 'value', name: '平均赞', nameTextStyle: { color: '#999', fontSize: 10 }, splitLine: { lineStyle: { color: '#f0f0f0' } }, axisLabel: { color: '#999', fontSize: 10 } },
      series: [{
        type: 'bar',
        data: contentLen.result.map(r => ({
          value: Math.round(r.avgLikes),
          itemStyle: { color: r.avgLikes >= contentLen.maxAvg * 0.8 ? '#ff2442' : '#ff9db0', borderRadius: [4, 4, 0, 0] },
        })),
        barMaxWidth: 56,
        label: { show: true, position: 'top', color: '#666', fontSize: 11, formatter: ({ value }) => fmtNum(value) },
      }],
    });
  }

  // ========== 增长趋势图（v2.7.2）==========

  function renderGrowthChart(bloggerData) {
    const section = document.getElementById('adv-growth-section');
    const el = document.getElementById('adv-growth-chart');
    if (!section || !el) return;
    disposeChartInstance(el);
    if (typeof echarts === 'undefined') return;

    const growth = computeGrowthData(bloggerData);
    if (!growth.available) {
      section.style.display = '';
      el.innerHTML = `<p class="adv-empty">${esc(growth.reason)}</p>`;
      return;
    }

    section.style.display = '';
    initManagedChart(el, {
      grid: { left: 60, right: 60, top: 40, bottom: 36 },
      legend: { data: growth.series.map(s => s.name), top: 4, textStyle: { fontSize: 11 } },
      tooltip: {
        trigger: 'axis',
        formatter: params => {
          let html = `<b>${params[0].axisValue}</b>`;
          for (const p of params) {
            if (p.value != null) html += `<br/>${p.marker}${p.seriesName}: ${fmtNum(p.value)}`;
          }
          return html;
        },
      },
      xAxis: { type: 'category', data: growth.dates, axisLabel: { color: '#666', fontSize: 10, rotate: growth.snapshots.length > 8 ? 30 : 0 } },
      yAxis: [
        { type: 'value', name: '互动', nameTextStyle: { color: '#999', fontSize: 10 }, splitLine: { lineStyle: { color: '#f0f0f0' } }, axisLabel: { color: '#999', fontSize: 10 } },
        { type: 'value', name: '数量', nameTextStyle: { color: '#999', fontSize: 10 }, splitLine: { show: false }, axisLabel: { color: '#999', fontSize: 10 } },
      ],
      series: growth.series.map(s => ({
        name: s.name,
        type: 'line',
        data: s.data,
        yAxisIndex: s.yAxisIndex || 0,
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: { color: s.color, width: 2 },
        itemStyle: { color: s.color },
        connectNulls: true,
      })),
    });
  }

  // ========== 创作者后台数据导入 ==========

  let _importParsedNotes = null;
  let _importParsedAccount = null;
  let _importCurrentBlogger = null;
  let _importCurrentUserId = null;

  async function initBackendImport(bloggerData, userId) {
    _importCurrentBlogger = bloggerData;
    _importCurrentUserId = userId;

    // 绑定导入按钮（最先执行，避免后续图表渲染异常导致按钮失效）
    const btnImport = document.getElementById('btn-backend-import');
    if (btnImport) {
      const newBtn = replaceWithClone('btn-backend-import');
      newBtn.addEventListener('click', () => openImportModal());
    }

    const notes = bloggerData?.notes || [];
    const backendCount = notes.filter(n => n.backend).length;

    // 显示/隐藏"个人分析"入口按钮
    const btnPersonal = document.getElementById('btn-personal-view');
    if (btnPersonal) {
      if (backendCount > 0) {
        btnPersonal.classList.remove('hidden');
        const newPBtn = replaceWithClone('btn-personal-view');
        newPBtn.classList.remove('hidden');
        newPBtn.addEventListener('click', () => {
          window.location.hash = '#personal=' + userId;
        });
      } else {
        btnPersonal.classList.add('hidden');
      }
    }

    // 显示后台数据状态 badge
    const badge = document.getElementById('backend-data-badge');
    if (badge) {
      badge.classList.remove('hidden');
      if (backendCount > 0) {
        badge.className = 'backend-badge imported';
        badge.textContent = `创作者数据：已导入（${backendCount} 条笔记）`;
      } else {
        badge.className = 'backend-badge not-imported';
        badge.textContent = '创作者数据：未导入';
      }
    }

  }

  function openImportModal() {
    const modal = document.getElementById('import-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    _importParsedNotes = null;
    _importParsedAccount = null;

    // 重置 UI
    document.getElementById('import-preview').classList.add('hidden');
    document.getElementById('import-error').classList.add('hidden');
    document.getElementById('import-btn-merge').disabled = true;
    document.querySelectorAll('.import-zone').forEach(z => z.classList.remove('has-file'));
    document.querySelectorAll('.import-zone-filename').forEach(el => el.textContent = '');

    // 文件选择事件
    const notesZone = document.getElementById('import-zone-notes');
    const accountZone = document.getElementById('import-zone-account');
    const notesInput = document.getElementById('import-file-notes');
    const accountInput = document.getElementById('import-file-account');

    notesZone.onclick = () => notesInput.click();
    accountZone.onclick = () => accountInput.click();

    notesInput.value = '';
    accountInput.value = '';
    notesInput.onchange = (e) => handleImportFile(e, 'notes');
    accountInput.onchange = (e) => handleImportFile(e, 'account');

    // 关闭事件
    document.getElementById('import-modal-close').onclick = closeImportModal;
    document.getElementById('import-btn-cancel').onclick = closeImportModal;
    document.querySelector('.import-modal-backdrop').onclick = closeImportModal;

    // 合并按钮
    document.getElementById('import-btn-merge').onclick = () => doMergeImport();
  }

  function closeImportModal() {
    document.getElementById('import-modal')?.classList.add('hidden');
  }

  async function handleImportFile(event, type) {
    const file = event.target.files?.[0];
    if (!file) return;
    const errorEl = document.getElementById('import-error');
    errorEl.classList.add('hidden');

    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });

      if (type === 'notes') {
        _importParsedNotes = BACKEND_IMPORT.parseNoteDetail(wb);
        document.getElementById('import-file-notes-name').textContent = file.name;
        document.getElementById('import-zone-notes').classList.add('has-file');
        showImportPreview();
      } else {
        _importParsedAccount = BACKEND_IMPORT.parseAccountTimeSeries(wb);
        document.getElementById('import-file-account-name').textContent = file.name;
        document.getElementById('import-zone-account').classList.add('has-file');
      }
    } catch (err) {
      errorEl.textContent = `解析失败：${err.message}`;
      errorEl.classList.remove('hidden');
    }
  }

  function showImportPreview() {
    if (!_importParsedNotes || !_importCurrentBlogger) return;
    const notes = _importCurrentBlogger.notes || [];
    const result = BACKEND_IMPORT.mergeBackendData(notes, _importParsedNotes);
    const previewEl = document.getElementById('import-preview');
    const pct = result.totalImported > 0 ? Math.round(result.matchedCount / result.totalImported * 100) : 0;
    const matchClass = pct >= 70 ? 'match-good' : 'match-warn';

    const unmatchedNote = result.unmatchedCount > 0
      ? `<div style="margin-top:6px;color:#666;font-size:12px">未匹配的 <strong>${result.unmatchedCount}</strong> 条将作为"仅后台数据"笔记导入（<span style="color:#16a34a">全量入库，不丢弃</span>），用于个人看板分析</div>`
      : '';
    const lowMatchHint = pct < 50 && notes.length > 0
      ? '<div class="match-warn" style="margin-top:4px">匹配率较低：常见原因是本地抓取不完整或 Excel 是其他账号的导出。请确认无误后再导入。</div>'
      : '';
    previewEl.innerHTML = `
      <strong>解析结果</strong><br>
      Excel 中共 <strong>${result.totalImported}</strong> 条笔记<br>
      本地已有 <strong>${notes.length}</strong> 条笔记<br>
      成功匹配 <span class="${matchClass}">${result.matchedCount} 条</span>（${pct}%），
      未匹配 ${result.unmatchedCount} 条
      ${unmatchedNote}
      ${lowMatchHint}
    `;
    previewEl.classList.remove('hidden');
    // 全量导入：只要 Excel 解析到任何行就允许合并
    document.getElementById('import-btn-merge').disabled = result.totalImported === 0;
  }

  async function doMergeImport() {
    if (!_importParsedNotes || !_importCurrentBlogger) return;
    const mergeBtn = document.getElementById('import-btn-merge');
    mergeBtn.disabled = true;
    mergeBtn.textContent = '合并中...';

    try {
      const notes = _importCurrentBlogger.notes || [];
      const result = BACKEND_IMPORT.mergeBackendData(notes, _importParsedNotes);

      // 保存更新后的笔记
      await DATA_STORE.saveBlogger(
        _importCurrentBlogger.userId,
        _importCurrentBlogger.nickname,
        _importCurrentBlogger.avatar,
        _importCurrentBlogger.profileUrl,
        result.notes,
        _importCurrentBlogger.stats,
      );

      // 保存账号级时序数据
      if (_importParsedAccount) {
        await BACKEND_IMPORT.saveAccountTimeSeries(_importCurrentUserId, _importParsedAccount);
      }

      ANALYTICS.track('backend_data_import', {
        total: result.totalImported,
        matched: result.matchedCount,
        unmatched: result.unmatchedCount,
        has_account_data: !!_importParsedAccount,
      });

      closeImportModal();
      // 重新加载详情页
      window.location.hash = '#detail=' + _importCurrentUserId;
      window.location.reload();
    } catch (err) {
      const errorEl = document.getElementById('import-error');
      errorEl.textContent = `合并失败：${err.message}`;
      errorEl.classList.remove('hidden');
      mergeBtn.disabled = false;
      mergeBtn.textContent = '合并数据';
    }
  }

  // ========== 个人分析视图 ==========

  async function showPersonalView(userId) {
    // 隐藏其他视图
    document.getElementById('overview-view').classList.add('hidden');
    document.getElementById('detail-view').classList.add('hidden');
    document.getElementById('compare-view').classList.add('hidden');
    document.getElementById('personal-view').classList.remove('hidden');
    document.getElementById('nav-bar').classList.add('hidden');
    document.getElementById('compare-selection-bar').classList.add('hidden');
    document.getElementById('btn-chat-toggle').style.display = 'none';
    document.getElementById('chat-widget').style.display = 'none';
    setWorkbenchMode('compare'); // hide workbench

    const bloggerData = await DATA_STORE.getBloggerData(userId);
    if (!bloggerData?.notes?.length) {
      document.getElementById('personal-subtitle').textContent = '数据不存在';
      return;
    }

    const notes = bloggerData.notes;
    const name = bloggerData.nickname || '博主';
    const backendNotes = notes.filter(n => n.backend);

    // Header
    document.getElementById('personal-header').textContent = `${name} — 个人数据分析`;
    document.getElementById('personal-subtitle').textContent =
      `基于创作者后台 ${backendNotes.length} 条笔记数据`;
    document.getElementById('personal-nav-name').textContent = name;

    // Back button
    document.getElementById('btn-personal-back').onclick = () => {
      window.location.hash = '#detail=' + userId;
    };

    // Import button in personal view
    const importBtn = document.getElementById('btn-personal-import');
    if (importBtn) {
      const newBtn = replaceWithClone('btn-personal-import');
      newBtn.addEventListener('click', () => {
        _importCurrentBlogger = bloggerData;
        _importCurrentUserId = userId;
        openImportModal();
      });
    }

    if (backendNotes.length === 0) {
      document.getElementById('personal-kpi-cards').innerHTML =
        '<div style="padding:24px;text-align:center;color:#888">请先导入创作者后台数据</div>';
      return;
    }

    // Render all sections
    renderPersonalKPIs(backendNotes);
    renderPersonalFunnel(backendNotes);
    renderPersonalCTR(backendNotes);
    renderPersonalMatrix(backendNotes);
    renderPersonalAttribution(backendNotes);
    renderPersonalDiagnosis(backendNotes);
    renderPersonalHeatmap(backendNotes);

    // Time series (if available)
    const timeSeries = await BACKEND_IMPORT.getAccountTimeSeries(userId);
    if (timeSeries?.daily && Object.keys(timeSeries.daily).length > 0) {
      renderPersonalTrends(timeSeries);
    }

    // AI section
    initPersonalAI(notes, userId);

    ANALYTICS.track('analysis_view', {
      view_type: 'personal',
      backend_notes: backendNotes.length,
    });

    setTimeout(() => startPersonalOnboarding(), 300);
  }

  function renderPersonalKPIs(backendNotes) {
    const container = document.getElementById('personal-kpi-cards');
    if (!container) return;

    const totalImpressions = backendNotes.reduce((s, n) => s + (n.backend.impressions || 0), 0);
    const totalViews = backendNotes.reduce((s, n) => s + (n.backend.views || 0), 0);
    const totalFollowerGain = backendNotes.reduce((s, n) => s + (n.backend.followerGain || 0), 0);
    const totalShares = backendNotes.reduce((s, n) => s + (n.backend.shares || 0), 0);
    const totalLikes = backendNotes.reduce((s, n) => s + (n.likes || 0), 0);
    const totalCollects = backendNotes.reduce((s, n) => s + (n.collects || 0), 0);
    const ctrs = backendNotes.map(n => n.backend.coverCTR).filter(v => v != null);
    const avgCTR = ctrs.length > 0 ? ctrs.reduce((a, b) => a + b, 0) / ctrs.length : null;
    const watchTimes = backendNotes.map(n => n.backend.avgWatchTime).filter(v => v != null);
    const avgWatch = watchTimes.length > 0 ? watchTimes.reduce((a, b) => a + b, 0) / watchTimes.length : null;
    const viewRate = totalImpressions > 0 ? totalViews / totalImpressions : 0;

    const ctrColor = avgCTR == null ? '#999' : avgCTR > 0.05 ? '#16a34a' : avgCTR > 0.03 ? '#d97706' : '#dc2626';

    container.innerHTML = `
      <div class="card"><div class="card-value">${fmtNum(totalImpressions)}</div><div class="card-label">总曝光</div></div>
      <div class="card"><div class="card-value">${fmtNum(totalViews)}</div><div class="card-label">总观看</div></div>
      <div class="card"><div class="card-value" style="color:${ctrColor}">${avgCTR != null ? (avgCTR * 100).toFixed(1) + '%' : '—'}</div><div class="card-label">平均封面点击率</div></div>
      <div class="card"><div class="card-value">${(viewRate * 100).toFixed(1)}%</div><div class="card-label">曝光→观看转化</div></div>
      <div class="card"><div class="card-value">${avgWatch != null ? avgWatch.toFixed(1) + 's' : '—'}</div><div class="card-label">平均观看时长</div></div>
      <div class="card"><div class="card-value">${fmtNum(totalFollowerGain)}</div><div class="card-label">总涨粉</div></div>
      <div class="card"><div class="card-value">${fmtNum(totalShares)}</div><div class="card-label">总分享</div></div>
      <div class="card"><div class="card-value">${fmtNum(totalLikes)}</div><div class="card-label">总点赞</div></div>
      <div class="card"><div class="card-value">${fmtNum(totalCollects)}</div><div class="card-label">总收藏</div></div>
    `;
  }

  function renderPersonalFunnel(backendNotes) {
    const el = document.getElementById('personal-funnel-chart');
    if (!el) return;

    const totalImpressions = backendNotes.reduce((s, n) => s + (n.backend.impressions || 0), 0);
    const totalViews = backendNotes.reduce((s, n) => s + (n.backend.views || 0), 0);
    const totalEngagement = backendNotes.reduce((s, n) =>
      s + (n.likes || 0) + (n.collects || 0) + (n.commentCount || 0), 0);
    const totalShares = backendNotes.reduce((s, n) => s + (n.backend.shares || 0), 0);
    const totalFollower = backendNotes.reduce((s, n) => s + (n.backend.followerGain || 0), 0);

    // 4 个转化率（从上游到下游）+ 参考基准
    // 基准参考：小红书行业观察的经验值（非精确）
    const stages = [
      {
        name: '曝光 → 观看',
        subLabel: '封面点击率（CTR）',
        from: totalImpressions,
        to: totalViews,
        benchmarks: [0.03, 0.05, 0.08],
        tip: { weak: '封面没吸引力，建议 A/B 测试首图与标题', ok: 'CTR 合格，仍有提升空间', good: '封面表现优秀' },
        fmt: 'pct',
      },
      {
        name: '观看 → 互动',
        subLabel: '互动率（赞+藏+评 / 观看）',
        from: totalViews,
        to: totalEngagement,
        benchmarks: [0.02, 0.04, 0.08],
        tip: { weak: '点进来却没互动，开头 3 秒与内容价值需优化', ok: '互动率尚可，可加钩子引导评论', good: '互动表现优秀' },
        fmt: 'pct',
      },
      {
        name: '观看 → 分享',
        subLabel: '分享率（分享 / 观看）',
        from: totalViews,
        to: totalShares,
        benchmarks: [0.003, 0.008, 0.02],
        tip: { weak: '分享少，内容不够"值得转发"', ok: '分享率一般', good: '分享表现优秀，内容有传播力' },
        fmt: 'pct',
      },
      {
        name: '观看 → 涨粉',
        subLabel: '涨粉率（涨粉 / 观看）',
        from: totalViews,
        to: totalFollower,
        benchmarks: [0.001, 0.003, 0.01],
        tip: { weak: '看完不关注，账号人设/系列感不足', ok: '转化为粉丝效率尚可', good: '涨粉效率优秀' },
        fmt: 'pct',
      },
    ];

    const fmtRate = (rate, type) => {
      if (type === 'pct') {
        if (rate >= 0.01) return (rate * 100).toFixed(1) + '%';
        return (rate * 100).toFixed(2) + '%';
      }
      return rate.toFixed(2);
    };

    const grade = (rate, benchmarks) => {
      if (rate < benchmarks[0]) return { level: 'weak',  color: '#dc2626', label: '偏弱' };
      if (rate < benchmarks[1]) return { level: 'ok',    color: '#d97706', label: '一般' };
      if (rate < benchmarks[2]) return { level: 'good',  color: '#16a34a', label: '良好' };
      return                         { level: 'good',    color: '#16a34a', label: '优秀' };
    };

    const nodes = [
      { name: '曝光', value: totalImpressions, color: '#ff2442' },
      { name: '观看', value: totalViews, color: '#ff6b6b' },
      { name: '互动', value: totalEngagement, color: '#f59e0b' },
      { name: '分享', value: totalShares, color: '#16a34a' },
      { name: '涨粉', value: totalFollower, color: '#2563eb' },
    ];

    el.classList.add('funnel-chain');

    // 左侧 ECharts 漏斗视图（直观的体积递减）
    const visualEl = document.getElementById('personal-funnel-visual');
    if (visualEl && totalImpressions > 0) {
      const funnelChart = echarts.init(visualEl);
      funnelChart.setOption({
        tooltip: {
          trigger: 'item',
          formatter: (p) => {
            const pct = totalImpressions > 0 ? (p.value / totalImpressions * 100).toFixed(2) : 0;
            return `${p.name}<br/><b>${fmtNum(p.value)}</b>（占曝光 ${pct}%）`;
          },
        },
        color: nodes.map(n => n.color),
        series: [{
          type: 'funnel',
          left: '5%', right: '5%', top: 10, bottom: 10,
          min: 0,
          max: totalImpressions,
          minSize: '12%',
          maxSize: '100%',
          sort: 'descending',
          gap: 3,
          label: {
            show: true, position: 'inside', fontSize: 12, fontWeight: 600, color: '#fff',
            formatter: (p) => `${p.name}\n${fmtNum(p.value)}`,
          },
          labelLine: { show: false },
          itemStyle: { borderWidth: 0 },
          data: nodes.filter(n => n.value > 0).map(n => ({ name: n.name, value: n.value })),
        }],
      });
      new ResizeObserver(() => funnelChart.resize()).observe(visualEl);
    }

    const stageHtml = (node) => `
      <div class="funnel-stage-wrap">
        <div class="funnel-stage">
          <div class="funnel-stage-dot" style="background:${node.color}"></div>
          <div class="funnel-stage-label">${node.name}</div>
          <div class="funnel-stage-value" style="color:${node.color}">${fmtNum(node.value)}</div>
        </div>
      </div>`;

    const arrowHtml = (stage) => {
      if (!stage.from || stage.from === 0) {
        return '<div class="funnel-arrow"><div class="funnel-arrow-empty">—</div></div>';
      }
      const rate = stage.to / stage.from;
      const g = grade(rate, stage.benchmarks);
      const tipText = stage.tip[g.level];
      return `
        <div class="funnel-arrow">
          <div class="funnel-arrow-rate">
            <div class="funnel-arrow-pct" style="color:${g.color}">${fmtRate(rate, stage.fmt)}</div>
            <div class="funnel-arrow-sublabel">${stage.subLabel}</div>
            <div class="funnel-arrow-tag" style="background:${g.color}22;color:${g.color}">${g.label}</div>
          </div>
          <div class="funnel-arrow-tip">${tipText}</div>
        </div>`;
    };

    el.innerHTML = `
      <div class="funnel-chain-list">
        ${stageHtml(nodes[0])}
        ${stages.map((s, i) => arrowHtml(s) + stageHtml(nodes[i + 1])).join('')}
      </div>`;
  }

  function renderPersonalCTR(backendNotes) {
    const panel = document.getElementById('personal-ctr-panel');
    const el = document.getElementById('personal-ctr-chart');
    if (!panel || !el) return;

    // 仅使用同时具备 CTR 和曝光的笔记，保证样本可比
    const items = backendNotes
      .filter(n => n.backend.coverCTR != null && n.backend.impressions > 0)
      .map(n => ({
        ctr: n.backend.coverCTR,
        imp: n.backend.impressions || 0,
        engagement: (n.likes || 0) + (n.collects || 0) + (n.commentCount || 0),
      }));
    if (items.length < 3) { panel.style.display = 'none'; return; }

    // ========== Pearson 相关系数 ==========
    const pearson = (xs, ys) => {
      const n = xs.length;
      if (n < 3) return null;
      const mx = xs.reduce((a, b) => a + b, 0) / n;
      const my = ys.reduce((a, b) => a + b, 0) / n;
      let cov = 0, vx = 0, vy = 0;
      for (let i = 0; i < n; i++) {
        const dx = xs[i] - mx, dy = ys[i] - my;
        cov += dx * dy; vx += dx * dx; vy += dy * dy;
      }
      if (vx === 0 || vy === 0) return null;
      return cov / Math.sqrt(vx * vy);
    };

    const ctrArr = items.map(i => i.ctr);
    const impArr = items.map(i => i.imp);
    const engArr = items.map(i => i.engagement);
    const rImp = pearson(ctrArr, impArr);
    const rEng = pearson(ctrArr, engArr);

    // 把相关系数量化成分级文本
    const describe = (r) => {
      if (r == null) return { tag: '—', cls: 'corr-weak', desc: '样本不足' };
      const abs = Math.abs(r);
      const dir = r > 0 ? '正' : '负';
      if (abs >= 0.5) return { tag: `显著${dir}相关`, cls: r > 0 ? 'corr-strong' : 'corr-neg',
                                desc: `r = ${r.toFixed(2)}` };
      if (abs >= 0.3) return { tag: `中度${dir}相关`, cls: r > 0 ? 'corr-strong' : 'corr-neg',
                                desc: `r = ${r.toFixed(2)}` };
      if (abs >= 0.1) return { tag: `弱${dir}相关`,   cls: 'corr-medium',
                                desc: `r = ${r.toFixed(2)}` };
      return                    { tag: '无明显相关',   cls: 'corr-weak',
                                desc: `r = ${r.toFixed(2)}` };
    };

    const dImp = describe(rImp);
    const dEng = describe(rEng);

    // ========== 分桶统计：验证 "CTR 越高 → 曝光/互动越高" ==========
    const bucketDefs = [
      { label: '0-3%',   max: 0.03 },
      { label: '3-5%',   max: 0.05 },
      { label: '5-8%',   max: 0.08 },
      { label: '8-12%',  max: 0.12 },
      { label: '12-18%', max: 0.18 },
      { label: '18%+',   max: Infinity },
    ];
    const buckets = bucketDefs.map(b => ({ label: b.label, items: [] }));
    for (const it of items) {
      for (let i = 0; i < bucketDefs.length; i++) {
        if (it.ctr < bucketDefs[i].max) { buckets[i].items.push(it); break; }
      }
    }

    const bucketStats = buckets.map(b => ({
      label: b.label,
      count: b.items.length,
      avgImp: b.items.length ? b.items.reduce((s, i) => s + i.imp, 0) / b.items.length : 0,
      avgEng: b.items.length ? b.items.reduce((s, i) => s + i.engagement, 0) / b.items.length : 0,
    }));

    // ========== 判断递增单调性（两两相邻桶比较，非空桶） ==========
    const monotonicIncrease = (key) => {
      const nonEmpty = bucketStats.filter(b => b.count > 0);
      if (nonEmpty.length < 2) return false;
      let increases = 0, total = 0;
      for (let i = 1; i < nonEmpty.length; i++) {
        total++;
        if (nonEmpty[i][key] > nonEmpty[i - 1][key]) increases++;
      }
      return total > 0 ? increases / total : 0;
    };
    const impMono = monotonicIncrease('avgImp');
    const engMono = monotonicIncrease('avgEng');

    // ========== 洞察文案 ==========
    const insight = document.getElementById('personal-ctr-insight');
    if (insight) {
      const n = items.length;
      // 结论性语言：当 |r| 大且 mono > 0.6 时给出"显著成立"结论
      const verdict = (d, mono, entity) => {
        if (d.tag === '无明显相关' || d.tag === '—') {
          return `CTR 与${entity}${d.tag}（${d.desc}），样本中未观察到稳定规律。`;
        }
        if (d.cls === 'corr-neg' || d.cls === 'corr-weak') {
          return `CTR 与${entity}呈${d.tag}（${d.desc}），暂不构成强预测关系。`;
        }
        const monoText = mono >= 0.6 ? '且分桶均值呈单调上升' : '但分桶均值存在波动';
        return `CTR 与${entity}呈${d.tag}（${d.desc}）${monoText}。`;
      };

      insight.innerHTML = `
        <div style="margin-bottom:6px"><strong>统计发现（样本 ${n} 篇）</strong></div>
        <div>
          <span class="corr-tag ${dImp.cls}">${dImp.tag}</span>
          ${verdict(dImp, impMono, '曝光量')}
        </div>
        <div style="margin-top:4px">
          <span class="corr-tag ${dEng.cls}">${dEng.tag}</span>
          ${verdict(dEng, engMono, '互动总量')}
        </div>
        <div style="margin-top:6px;font-size:12px;color:#4b5563">
          <strong>解读：</strong>封面点击率在小红书分发模型中影响后续推荐量。CTR 高意味着首图与标题能吸引目标受众，触发平台扩量，形成"高 CTR → 高曝光 → 高互动"的正向循环。建议把高 CTR 笔记的封面/标题要素沉淀为模板。
        </div>`;
    }

    // ========== 双轴图表：桶内笔记数（柱）+ 平均曝光/平均互动（折线）==========
    const chart = echarts.init(el);
    chart.setOption({
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params) => {
          const idx = params[0].dataIndex;
          const s = bucketStats[idx];
          if (s.count === 0) return `${s.label}<br/>无笔记`;
          return `${s.label}<br/>
            笔记数：${s.count} 篇<br/>
            平均曝光：<b>${fmtNum(Math.round(s.avgImp))}</b><br/>
            平均互动：<b>${fmtNum(Math.round(s.avgEng))}</b>`;
        },
      },
      legend: {
        data: ['笔记数', '平均曝光', '平均互动'],
        bottom: 0, textStyle: { fontSize: 11 },
      },
      grid: { left: 55, right: 55, top: 30, bottom: 40 },
      xAxis: { type: 'category', data: bucketStats.map(b => b.label), axisLabel: { fontSize: 11 } },
      yAxis: [
        { type: 'value', name: '笔记数', position: 'left', axisLabel: { fontSize: 10 } },
        { type: 'value', name: '均值', position: 'right', axisLabel: { fontSize: 10, formatter: fmtNum } },
      ],
      series: [
        {
          name: '笔记数', type: 'bar', yAxisIndex: 0,
          data: bucketStats.map((b, i) => ({
            value: b.count,
            itemStyle: {
              color: i <= 1 ? '#fca5a5' : i <= 2 ? '#fcd34d' : '#86efac',
              borderRadius: [4, 4, 0, 0],
            },
          })),
          label: { show: true, position: 'top', fontSize: 10, formatter: p => p.value || '' },
          barWidth: '50%',
        },
        {
          name: '平均曝光', type: 'line', yAxisIndex: 1,
          data: bucketStats.map(b => b.count > 0 ? Math.round(b.avgImp) : null),
          smooth: true, symbol: 'circle', symbolSize: 8,
          lineStyle: { color: '#ff2442', width: 2 },
          itemStyle: { color: '#ff2442' },
          connectNulls: true,
        },
        {
          name: '平均互动', type: 'line', yAxisIndex: 1,
          data: bucketStats.map(b => b.count > 0 ? Math.round(b.avgEng) : null),
          smooth: true, symbol: 'circle', symbolSize: 8,
          lineStyle: { color: '#f59e0b', width: 2 },
          itemStyle: { color: '#f59e0b' },
          connectNulls: true,
        },
      ],
    });
    new ResizeObserver(() => chart.resize()).observe(el);
  }

  function renderPersonalMatrix(backendNotes) {
    const panel = document.getElementById('personal-matrix-panel');
    const el = document.getElementById('personal-matrix-chart');
    if (!panel || !el) return;

    const data = backendNotes
      .filter(n => n.backend.impressions > 0)
      .map(n => {
        const imp = n.backend.impressions || 1;
        const engagement = (n.likes || 0) + (n.collects || 0) + (n.commentCount || 0);
        const engRate = engagement / imp * 100;
        const follower = n.backend.followerGain || 0;
        return [imp, engRate, Math.max(follower, 1), truncate(n.title || '无标题', 20)];
      });

    if (data.length < 3) { panel.style.display = 'none'; return; }

    const avgImp = data.reduce((s, d) => s + d[0], 0) / data.length;
    const avgEng = data.reduce((s, d) => s + d[1], 0) / data.length;

    const chart = echarts.init(el);
    chart.setOption({
      tooltip: {
        formatter: (p) => {
          const [imp, eng, fol, title] = p.data;
          return `<strong>${title}</strong><br>曝光: ${fmtNum(imp)}<br>互动率: ${eng.toFixed(2)}%<br>涨粉: ${fol}`;
        },
      },
      xAxis: {
        name: '曝光量', type: 'log', min: 'dataMin',
        axisLabel: { formatter: v => fmtNum(v) },
      },
      yAxis: { name: '互动率 %', type: 'value' },
      series: [{
        type: 'scatter',
        data,
        symbolSize: (d) => Math.min(Math.max(Math.sqrt(d[2]) * 4, 8), 40),
        itemStyle: {
          color: (p) => {
            const imp = p.data[0], eng = p.data[1];
            if (imp >= avgImp && eng >= avgEng) return '#16a34a'; // star
            if (imp >= avgImp && eng < avgEng) return '#d97706'; // wasted reach
            if (imp < avgImp && eng >= avgEng) return '#2563eb'; // underexposed
            return '#999'; // needs work
          },
          opacity: 0.7,
        },
      }],
      grid: { left: 60, right: 30, top: 40, bottom: 50 },
      graphic: [
        { type: 'line', shape: { x1: '50%', y1: 0, x2: '50%', y2: '100%' }, style: { stroke: '#e5e7eb', lineDash: [4, 4] }, silent: true },
      ],
    });
    new ResizeObserver(() => chart.resize()).observe(el);
  }

  function renderPersonalAttribution(backendNotes) {
    const panel = document.getElementById('personal-attribution-panel');
    if (!panel) return;

    const hasFollower = backendNotes.some(n => (n.backend.followerGain || 0) > 0);
    const hasShares = backendNotes.some(n => (n.backend.shares || 0) > 0);
    if (!hasFollower && !hasShares) { panel.style.display = 'none'; return; }

    function renderBarChart(elId, items, label) {
      const el = document.getElementById(elId);
      if (!el || items.length === 0) return;
      const chart = echarts.init(el);
      chart.setOption({
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        xAxis: { type: 'value' },
        yAxis: {
          type: 'category',
          data: items.map(i => truncate(i.title, 16)),
          inverse: true,
          axisLabel: { fontSize: 11, width: 100, overflow: 'truncate' },
        },
        series: [{
          type: 'bar', data: items.map(i => i.value),
          itemStyle: { borderRadius: [0, 4, 4, 0], color: label === '涨粉' ? '#16a34a' : '#2563eb' },
          label: { show: true, position: 'right', fontSize: 11, formatter: p => fmtNum(p.value) },
        }],
        grid: { left: 120, right: 60, top: 10, bottom: 10 },
      });
      new ResizeObserver(() => chart.resize()).observe(el);
    }

    if (hasFollower) {
      const top = [...backendNotes]
        .sort((a, b) => (b.backend.followerGain || 0) - (a.backend.followerGain || 0))
        .slice(0, 10)
        .map(n => ({ title: n.title || '无标题', value: n.backend.followerGain || 0 }));
      renderBarChart('personal-follower-chart', top, '涨粉');
    }

    if (hasShares) {
      const top = [...backendNotes]
        .sort((a, b) => (b.backend.shares || 0) - (a.backend.shares || 0))
        .slice(0, 10)
        .map(n => ({ title: n.title || '无标题', value: n.backend.shares || 0 }));
      renderBarChart('personal-share-chart', top, '分享');
    }
  }

  function renderPersonalTrends(timeSeries) {
    const panel = document.getElementById('personal-trends-panel');
    const grid = document.getElementById('personal-trends-grid');
    if (!panel || !grid) return;

    const daily = timeSeries.daily || {};
    // 所有数值已标准化：百分比字段存为小数（0.28 = 28%），时长字段为秒
    // aggType: sum = 期间合计（累积量）; mean = 期间均值（比率量）
    const metrics = [
      { key: 'impressions',   name: '曝光',     color: '#ff2442', aggType: 'sum',
        fmt: (v) => fmtNum(v) },
      { key: 'views',         name: '观看',     color: '#ff6b6b', aggType: 'sum',
        fmt: (v) => fmtNum(v) },
      { key: 'coverCTR',      name: '封面点击率', color: '#d97706', aggType: 'mean',
        fmt: (v) => (v * 100).toFixed(2) + '%' },
      { key: 'avgWatchTime',  name: '均观看时长', color: '#2563eb', aggType: 'mean',
        fmt: (v) => v.toFixed(1) + 's' },
      { key: 'totalWatchTime',name: '总观看时长', color: '#7c3aed', aggType: 'sum',
        fmt: (v) => fmtNum(v) + 's' },
      { key: 'completionRate',name: '完播率',   color: '#16a34a', aggType: 'mean',
        fmt: (v) => (v * 100).toFixed(1) + '%' },
    ];

    const available = metrics.filter(m => daily[m.key]?.length > 0);
    if (available.length === 0) return;

    panel.classList.remove('hidden');
    const periodDays = timeSeries.periodDays || daily[available[0].key].length;
    document.getElementById('personal-trends-title').textContent = `账号趋势（近 ${periodDays} 日）`;

    // 渲染每个 mini chart
    grid.innerHTML = available.map(m => {
      const values = daily[m.key].map(d => d.value);
      const agg = (arr) => {
        if (arr.length === 0) return 0;
        if (m.aggType === 'sum') return arr.reduce((a, b) => a + b, 0);
        return arr.reduce((a, b) => a + b, 0) / arr.length;
      };

      const total = agg(values);

      // 近期 vs 早期对比：后半段 vs 前半段
      const half = Math.floor(values.length / 2);
      let deltaText = '';
      if (half >= 2 && values.length - half >= 2) {
        const prior = agg(values.slice(0, half));
        const recent = agg(values.slice(half));
        if (prior > 0) {
          const delta = ((recent - prior) / prior) * 100;
          if (Math.abs(delta) >= 1) {
            const cls = delta > 0 ? 'up' : 'down';
            const arrow = delta > 0 ? '↑' : '↓';
            deltaText = `<span class="trend-mini-delta ${cls}" title="后半段 vs 前半段">${arrow} ${Math.abs(delta).toFixed(1)}%</span>`;
          }
        }
      }

      return `
        <div class="trend-mini">
          <div class="trend-mini-title">
            <span>${m.name} <span class="trend-mini-agg">· ${m.aggType === 'sum' ? '合计' : '均值'}</span></span>
            ${deltaText}
          </div>
          <div class="trend-mini-value" style="color:${m.color}">${m.fmt(total)}</div>
          <div class="trend-mini-chart" data-key="${m.key}"></div>
        </div>
      `;
    }).join('');

    // 渲染每个迷你折线（直接用原始 daily 值绘图，不做缩放）
    available.forEach(m => {
      const el = grid.querySelector(`[data-key="${m.key}"]`);
      if (!el) return;
      const dates = daily[m.key].map(d => d.date);
      const values = daily[m.key].map(d => d.value);
      const chart = echarts.init(el);
      chart.setOption({
        tooltip: {
          trigger: 'axis',
          formatter: (params) => {
            const p = params[0];
            return `${p.axisValue}<br/>${m.name}：${m.fmt(p.value)}`;
          },
        },
        xAxis: { type: 'category', data: dates, show: false, boundaryGap: false },
        yAxis: { type: 'value', show: false, scale: true },
        series: [{
          type: 'line',
          data: values,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: m.color, width: 2 },
          areaStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: m.color + '33' },
                { offset: 1, color: m.color + '00' },
              ],
            },
          },
        }],
        grid: { left: 0, right: 0, top: 4, bottom: 0 },
      });
      new ResizeObserver(() => chart.resize()).observe(el);
    });
  }

  // ========== 诊断清单：三象限 ==========

  function renderPersonalDiagnosis(backendNotes) {
    const container = document.getElementById('personal-diagnosis');
    if (!container) return;

    // 过滤有完整数据的笔记
    const data = backendNotes
      .map(n => {
        const imp = n.backend.impressions || 0;
        const views = n.backend.views || 0;
        const ctr = n.backend.coverCTR != null ? n.backend.coverCTR : (imp > 0 ? views / imp : null);
        const interactions = (n.likes || 0) + (n.collects || 0) + (n.commentCount || 0);
        const interactionRate = views > 0 ? interactions / views : (imp > 0 ? interactions / imp : 0);
        return { note: n, imp, views, ctr, interactions, interactionRate };
      })
      .filter(d => d.imp > 0);

    if (data.length < 5) {
      container.innerHTML = '<div class="diagnosis-empty" style="grid-column:1/-1">笔记数量不足，无法生成诊断（至少需要 5 条）</div>';
      return;
    }

    // 计算分位数
    const pct = (arr, p) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * p));
      return sorted[idx];
    };
    const imps = data.map(d => d.imp);
    const ctrs = data.filter(d => d.ctr != null).map(d => d.ctr);
    const irates = data.map(d => d.interactionRate);

    const impP25 = pct(imps, 0.25);
    const impP75 = pct(imps, 0.75);
    const ctrP25 = ctrs.length > 0 ? pct(ctrs, 0.25) : 0;
    const ctrP75 = ctrs.length > 0 ? pct(ctrs, 0.75) : Infinity;
    const irP25 = pct(irates, 0.25);
    const irP75 = pct(irates, 0.75);

    // 三类诊断
    const highImpLowCtr = data
      .filter(d => d.imp >= impP75 && d.ctr != null && d.ctr <= ctrP25)
      .sort((a, b) => b.imp - a.imp).slice(0, 5);
    const highCtrLowInter = data
      .filter(d => d.ctr != null && d.ctr >= ctrP75 && d.interactionRate <= irP25)
      .sort((a, b) => b.ctr - a.ctr).slice(0, 5);
    const highInterLowImp = data
      .filter(d => d.interactionRate >= irP75 && d.imp <= impP25)
      .sort((a, b) => b.interactionRate - a.interactionRate).slice(0, 5);

    const renderCard = (cls, title, desc, items, metricLabel, metricFmt) => {
      const body = items.length === 0
        ? '<div class="diagnosis-empty">暂无此类笔记</div>'
        : items.map(d => `
            <div class="diagnosis-note">
              <span class="diagnosis-note-title" title="${esc(d.note.title || '')}">${esc(d.note.title || '(无标题)')}</span>
              <span class="diagnosis-note-metric">${metricFmt(d)}</span>
            </div>`).join('');
      return `
        <div class="diagnosis-card ${cls}">
          <div class="diagnosis-card-title">${title} <span style="color:#888;font-weight:400">· ${items.length}</span></div>
          <div class="diagnosis-card-desc">${desc}</div>
          ${body}
        </div>`;
    };

    container.innerHTML =
      renderCard('red',    '高曝光 / 低点击',
                 '封面或标题没抓住，建议重做首图 + 标题 A/B 测',
                 highImpLowCtr,    '曝光',
                 (d) => `${fmtNum(d.imp)} 曝光 · CTR ${(d.ctr * 100).toFixed(1)}%`) +
      renderCard('orange', '高点击 / 低互动',
                 '点开了但内容没留住，封面是"标题党"；优化开头 3 秒 / 正文价值密度',
                 highCtrLowInter, 'CTR',
                 (d) => `CTR ${(d.ctr * 100).toFixed(1)}% · 互动率 ${(d.interactionRate * 100).toFixed(2)}%`) +
      renderCard('blue',   '高互动 / 低曝光',
                 '好内容被埋了，值得换标题/话题重发 或投薯条',
                 highInterLowImp, '互动率',
                 (d) => `互动率 ${(d.interactionRate * 100).toFixed(2)}% · ${fmtNum(d.imp)} 曝光`);
  }

  // ========== 发布时段热力图 ==========

  function renderPersonalHeatmap(backendNotes) {
    const panel = document.getElementById('personal-heatmap-panel');
    if (!panel) return;

    const withTime = backendNotes.filter(n => n.publishTimestamp);
    if (withTime.length < 5) {
      panel.innerHTML = `
        <div class="panel-header"><h2>发布时段表现</h2></div>
        <div style="padding:40px;text-align:center;color:#aaa">需至少 5 条有发布时间的笔记</div>`;
      return;
    }

    // 重新组织 DOM：左右双柱图
    const chartEl = document.getElementById('personal-heatmap-chart');
    if (chartEl) {
      chartEl.innerHTML = '<div id="heatmap-weekday" style="height:260px"></div><div id="heatmap-hour" style="height:260px"></div>';
      chartEl.style.display = 'grid';
      chartEl.style.gridTemplateColumns = '1fr 1fr';
      chartEl.style.gap = '16px';
    }

    const days = ['日', '一', '二', '三', '四', '五', '六'];

    // 收集每篇笔记的度量
    const notes = withTime.map(n => {
      const d = new Date(n.publishTimestamp);
      return {
        day: d.getDay(),
        hour: d.getHours(),
        imp: n.backend.impressions || 0,
        views: n.backend.views || 0,
        interactions: (n.likes || 0) + (n.collects || 0) + (n.commentCount || 0),
        followerGain: n.backend.followerGain || 0,
      };
    });

    const metricLabel = {
      impressions: '平均曝光', views: '平均观看',
      interactions: '平均互动', followerGain: '平均涨粉',
    };
    const getMetric = (n, m) => n[m === 'impressions' ? 'imp' : m];

    let currentMetric = 'impressions';
    const weekdayEl = document.getElementById('heatmap-weekday');
    const hourEl = document.getElementById('heatmap-hour');
    const summaryEl = document.getElementById('personal-heatmap-summary');
    const weekdayChart = echarts.init(weekdayEl);
    const hourChart = echarts.init(hourEl);

    const aggregate = (groupKey, groupValues, metric) => {
      const buckets = new Map();
      for (const gv of groupValues) buckets.set(gv, []);
      for (const n of notes) {
        const g = n[groupKey];
        if (buckets.has(g)) buckets.get(g).push(getMetric(n, metric));
      }
      const result = [];
      for (const gv of groupValues) {
        const list = buckets.get(gv) || [];
        result.push({
          group: gv,
          count: list.length,
          avg: list.length > 0 ? list.reduce((a, b) => a + b, 0) / list.length : 0,
        });
      }
      return result;
    };

    const barOption = (title, xLabels, rows, color) => ({
      title: { text: title, textStyle: { fontSize: 13, fontWeight: 600, color: '#555' }, left: 8, top: 4 },
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          const idx = params[0].dataIndex;
          const r = rows[idx];
          if (r.count === 0) return `${xLabels[idx]}<br/>未发布`;
          return `${xLabels[idx]}<br/>${metricLabel[currentMetric]}：<b>${fmtNum(Math.round(r.avg))}</b><br/>笔记数：${r.count}`;
        },
      },
      grid: { left: 40, right: 16, top: 32, bottom: 24 },
      xAxis: { type: 'category', data: xLabels, axisLabel: { fontSize: 10 } },
      yAxis: { type: 'value', axisLabel: { fontSize: 10, formatter: fmtNum } },
      series: [{
        type: 'bar',
        data: rows.map(r => ({
          value: Math.round(r.avg),
          itemStyle: {
            color: r.count === 0 ? '#eee' : color,
            opacity: r.count === 0 ? 1 : (0.4 + Math.min(1, r.count / 3) * 0.6),
          },
        })),
        barCategoryGap: '30%',
        label: {
          show: true, position: 'top', fontSize: 10, color: '#888',
          formatter: (p) => rows[p.dataIndex].count > 0 ? `${rows[p.dataIndex].count}篇` : '',
        },
      }],
    });

    const draw = () => {
      const color = {
        impressions: '#ff2442', views: '#ff6b6b',
        interactions: '#f59e0b', followerGain: '#2563eb',
      }[currentMetric];

      const byDay = aggregate('day', [0, 1, 2, 3, 4, 5, 6], currentMetric);
      const byHour = aggregate('hour', Array.from({ length: 24 }, (_, i) => i), currentMetric);

      weekdayChart.setOption(barOption(
        `${metricLabel[currentMetric]} — 按星期`,
        days.map(d => `周${d}`),
        byDay, color,
      ));
      hourChart.setOption(barOption(
        `${metricLabel[currentMetric]} — 按小时`,
        Array.from({ length: 24 }, (_, i) => `${i}`),
        byHour, color,
      ));

      // 汇总：最佳时段（要求至少 2 篇样本）
      const bestDay = [...byDay].filter(r => r.count >= 2).sort((a, b) => b.avg - a.avg)[0];
      const bestHour = [...byHour].filter(r => r.count >= 2).sort((a, b) => b.avg - a.avg)[0];

      if (bestDay || bestHour) {
        const parts = [];
        if (bestDay) parts.push(`最佳星期：<b>周${days[bestDay.group]}</b>（${fmtNum(Math.round(bestDay.avg))}，${bestDay.count} 篇）`);
        if (bestHour) parts.push(`最佳时段：<b>${bestHour.group}:00</b>（${fmtNum(Math.round(bestHour.avg))}，${bestHour.count} 篇）`);
        summaryEl.innerHTML = parts.join(' · ');
      } else {
        summaryEl.innerHTML = '<span style="color:#aaa">样本过少，无法识别显著最佳时段（每个分组至少 2 篇才列入）</span>';
      }
    };

    draw();
    new ResizeObserver(() => { weekdayChart.resize(); hourChart.resize(); }).observe(panel);

    // 切换指标
    panel.querySelectorAll('.heatmap-metric-btn').forEach(btn => {
      btn.onclick = () => {
        panel.querySelectorAll('.heatmap-metric-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentMetric = btn.dataset.metric;
        draw();
      };
    });
  }

  async function initPersonalAI(notes, userId) {
    const btnAI = document.getElementById('btn-personal-ai');
    const reportEl = document.getElementById('personal-ai-report');
    const nokeyEl = document.getElementById('personal-ai-nokey');
    if (!btnAI || !reportEl) return;

    // 加载缓存
    try {
      const cached = await chrome.storage.local.get(`aiPersonalReport_${userId}`);
      const entry = cached[`aiPersonalReport_${userId}`];
      if (entry?.content) renderAIReport(entry.content, 'personal-ai-report');
    } catch {}

    const newBtn = replaceWithClone('btn-personal-ai');
    newBtn.addEventListener('click', async () => {
      const apiKey = await AI_SERVICE.getApiKey();
      if (!apiKey) {
        nokeyEl.style.display = '';
        return;
      }
      nokeyEl.style.display = 'none';
      newBtn.disabled = true;
      newBtn.textContent = '生成中...';
      reportEl.innerHTML = '<p style="color:#888">正在生成改进建议...</p>';

      try {
        const backendNotes = notes.filter(n => n.backend);
        const digest = AI_SERVICE.buildDataDigest(notes);
        let result = '';
        for await (const chunk of AI_SERVICE.streamChat([
          {
            role: 'system',
            content: `你是小红书个人账号运营顾问。用户是这个账号的博主本人，想要改进自己的运营。

基于以下数据（包含创作者后台独占指标），给出具体可执行的改进建议。

要求：
1. 用 ## 标题分 4 段：封面与点击率优化、内容策略调整、涨粉提效、发布节奏建议
2. 每段给 2-3 条具体建议，引用数据支撑
3. 指出明确的问题和对应的解决方案
4. 语气像一个资深运营朋友在帮你复盘，不要泛泛而谈

数据摘要：
${digest}`,
          },
          { role: 'user', content: '请分析我的账号数据，给出改进建议。' },
        ])) {
          if (chunk.text) {
            result += chunk.text;
            renderAIReport(result, 'personal-ai-report');
          }
        }
        // 保存结果到缓存
        await chrome.storage.local.set({ [`aiPersonalReport_${userId}`]: { content: result, ts: Date.now() } });
      } catch (err) {
        reportEl.innerHTML = `<p style="color:#dc2626">生成失败：${esc(err.message)}</p>`;
      } finally {
        newBtn.disabled = false;
        newBtn.textContent = '生成建议';
      }
    });
  }

  // ========== PDF 导出 ==========

  async function initPdfExport(bloggerData, detailAnalyticsProps = {}) {
    const btn = document.getElementById('btn-export-pdf');
    if (!btn) return;

    const newBtn = replaceWithClone('btn-export-pdf');
    newBtn.addEventListener('click', async () => {
      if (typeof PDF_EXPORT === 'undefined') {
        alert('PDF 模块未加载，请刷新页面后重试');
        return;
      }
      ANALYTICS.track('pdf_export_click', detailAnalyticsProps);
      await withExpandedDeepDiveForExport(() => PDF_EXPORT.exportDetailView(bloggerData));
    });
  }

  // ========== 数据导出（CSV / JSON）==========

  function initDataExport(bloggerData) {
    const notes = bloggerData?.notes || [];
    const name = bloggerData?.nickname || 'blogger';

    function csvEsc(val) {
      if (val == null) return '';
      const s = String(val);
      return (s.includes(',') || s.includes('"') || s.includes('\n'))
        ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function buildCsv() {
      const headers = ['笔记ID', '标题', '正文', '标签', '点赞', '收藏', '评论数', '图片数', '图片链接', '评论内容', '作者', '发布时间', '笔记链接', '抓取时间'];
      const rows = notes.map(n => {
        const comments = Array.isArray(n.comments) ? n.comments : [];
        return [
          csvEsc(n.noteId), csvEsc(n.title), csvEsc(n.content),
          csvEsc(n.tags ? n.tags.join(', ') : ''),
          n.likes || 0, n.collects || 0, n.commentCount || comments.length || 0,
          n.imageCount || n.images?.length || 0,
          csvEsc(n.images ? n.images.join(' | ') : ''),
          csvEsc(comments.map(c => `${c.author || c.nickname || ''}${c.isAuthor ? '(作者)' : ''}: ${c.content || c.text || ''}`).join(' || ')),
          csvEsc(n.author?.nickname || name),
          csvEsc(n.publishTime || ''),
          csvEsc(n.noteUrl || ''),
          csvEsc(n.crawlTime || ''),
        ];
      });
      return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    function download(content, filename, mime) {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }

    const safeName = name.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40);
    const ts = new Date().toISOString().slice(0, 10);

    const btnCsv = document.getElementById('btn-export-csv');
    const btnJson = document.getElementById('btn-export-json');

    if (btnCsv) {
      const newBtn = replaceWithClone('btn-export-csv');
      newBtn.addEventListener('click', () => {
        download(buildCsv(), `${safeName}_${notes.length}篇_${ts}.csv`, 'text/csv;charset=utf-8');
      });
    }
    if (btnJson) {
      const newBtn = replaceWithClone('btn-export-json');
      newBtn.addEventListener('click', () => {
        download(JSON.stringify(notes, null, 2), `${safeName}_${notes.length}篇_${ts}.json`, 'application/json');
      });
    }
  }

  // ========== AI 深度分析 ==========

  let isGenerating = false;
  let isChatting = false;
  const sectionAiRunning = new Set();

  function renderAdvancedAiReport(sectionKey, content) {
    const reportEl = document.getElementById(`adv-ai-${sectionKey}`);
    if (!reportEl) return;
    if (!content) {
      reportEl.classList.add('hidden');
      reportEl.classList.remove('is-loading');
      reportEl.innerHTML = '';
      return;
    }
    reportEl.classList.remove('hidden');
    reportEl.classList.remove('is-loading');
    reportEl.innerHTML = `<strong>AI 结论</strong><p>${esc(content)}</p>`;
  }

  async function initAdvancedSectionAI(sectionPayloads, userId, notes, detailAnalyticsProps = {}) {
    const apiKey = await AI_SERVICE.getApiKey();

    const buttons = document.querySelectorAll('[data-adv-ai]');
    for (const rawBtn of buttons) {
      const sectionKey = rawBtn.dataset.advAi;
      const payload = sectionPayloads?.[sectionKey] || buildFallbackSectionPayload(sectionKey, notes);
      const btn = rawBtn.id ? replaceWithClone(rawBtn.id) : rawBtn.cloneNode(true);
      if (!rawBtn.id) {
        rawBtn.parentNode.replaceChild(btn, rawBtn);
      }
      const metaEl = document.getElementById(`adv-ai-meta-${sectionKey}`);
      const reportEl = document.getElementById(`adv-ai-${sectionKey}`);

      btn.disabled = false;
      btn.textContent = 'AI 分析';
      if (reportEl) {
        reportEl.classList.add('hidden');
        reportEl.classList.remove('is-loading');
        reportEl.innerHTML = '';
      }

      if (!payload?.available) {
        if (metaEl) metaEl.textContent = payload?.reason || '当前数据不足以生成这一项分析';
        btn.addEventListener('click', () => alert(payload?.reason || '当前数据不足以生成这一项分析'));
        continue;
      }
      if (payload.reason && metaEl) {
        metaEl.textContent = payload.reason;
      }
      if (!apiKey) {
        if (metaEl) metaEl.textContent = '请先在扩展弹窗的 AI 设置中配置 API Key';
        btn.addEventListener('click', () => alert('请先在扩展弹窗的 AI 设置中配置 API Key'));
        continue;
      }

      const cached = await AI_SERVICE.loadSectionReport(userId, sectionKey);
      if (cached) {
        renderAdvancedAiReport(sectionKey, cached);
        if (metaEl) metaEl.textContent = '已缓存，可点击重新生成';
      } else if (metaEl && !payload.reason) {
        metaEl.textContent = '按需调用 LLM，总结这部分数据含义与可执行建议';
      }

      btn.addEventListener('click', async () => {
        if (sectionAiRunning.has(sectionKey)) return;
        sectionAiRunning.add(sectionKey);
        btn.disabled = true;
        btn.textContent = '分析中...';
        if (metaEl) metaEl.textContent = 'LLM 正在总结这一块数据';
        if (reportEl) {
          reportEl.classList.remove('hidden');
          reportEl.classList.add('is-loading');
          reportEl.innerHTML = '<div class="skeleton"></div>';
        }

        const startAt = Date.now();
        let success = false;
        try {
          let fullText = '';
          for await (const chunk of AI_SERVICE.generateSectionInsight(payload.label, payload.digest, notes.length)) {
            if (chunk.done) break;
            fullText += chunk.text;
            renderAdvancedAiReport(sectionKey, fullText);
          }
          await AI_SERVICE.saveSectionReport(userId, sectionKey, fullText);
          if (metaEl) metaEl.textContent = '已缓存到本地；登录云同步后会一并上传';
          success = true;
        } catch (err) {
          renderAdvancedAiReport(sectionKey, `生成失败：${err.message}`);
          if (metaEl) metaEl.textContent = '这次调用失败了，可稍后重试';
        } finally {
          sectionAiRunning.delete(sectionKey);
          btn.disabled = false;
          btn.textContent = 'AI 分析';
          ANALYTICS.track('ai_report_generate', {
            mode: 'advanced_section',
            section: sectionKey,
            note_count: notes.length,
            duration_ms: Date.now() - startAt,
            success,
            ...detailAnalyticsProps,
          });
        }
      });
    }
  }

  async function initAI(notes, userId, detailAnalyticsProps = {}) {
    const nokeyOverlay = document.getElementById('ai-nokey-overlay');
    let btnGenerate = document.getElementById('btn-ai-generate');
    let btnClear = document.getElementById('btn-ai-clear');
    let chatToggle = document.getElementById('btn-chat-toggle');

    // 重置状态
    nokeyOverlay.style.display = 'none';
    btnGenerate.disabled = false;
    btnClear.style.display = 'none';
    document.getElementById('ai-report').innerHTML =
      '<p class="ai-placeholder">点击「生成报告」，AI 将为你分析内容策略、爆款密码、对标建议</p>';
    document.getElementById('chat-messages').innerHTML = '';
    chatToggle.style.display = 'none';
    document.getElementById('chat-widget').style.display = 'none';

    // 检查 API Key
    const apiKey = await AI_SERVICE.getApiKey();
    if (!apiKey) {
      nokeyOverlay.style.display = 'flex';
      btnGenerate = replaceWithClone('btn-ai-generate');
      btnGenerate.disabled = false;
      btnGenerate.addEventListener('click', () => {
        alert('请先在扩展弹窗的 AI 设置中配置 API Key');
      });
      chatToggle = replaceWithClone('btn-chat-toggle');
      chatToggle.style.display = 'block';
      chatToggle.title = '请先配置 AI API Key';
      chatToggle.addEventListener('click', () => {
        alert('请先在扩展弹窗的 AI 设置中配置 API Key');
      });
      return;
    }

    // 用 userId 作为缓存 key
    const hash = userId;

    // 显示聊天按钮
    chatToggle.style.display = 'block';

    // 检查缓存报告
    const cached = await AI_SERVICE.loadReport(hash);
    if (cached) {
      renderAIReport(cached);
      btnClear.style.display = 'inline-block';
      ANALYTICS.track('ai_report_generate', {
        mode: 'detail',
        note_count: notes.length,
        cached: true,
        duration_ms: 0,
        ...detailAnalyticsProps,
      });
    }

    // 加载聊天历史
    const savedChat = await AI_SERVICE.loadChatHistory(hash);
    if (savedChat.length > 0) renderChatHistory(savedChat);

    // 用 cloneNode 重新绑定事件（避免切换博主时事件叠加）
    replaceWithClone('btn-ai-generate').addEventListener('click', () => generateReport(notes, hash, detailAnalyticsProps));
    replaceWithClone('btn-ai-clear').addEventListener('click', async () => {
      await AI_SERVICE.clearHistory(hash);
      document.getElementById('ai-report').innerHTML =
        '<p class="ai-placeholder">缓存已清除，点击「生成报告」重新生成</p>';
      document.getElementById('btn-ai-clear').style.display = 'none';
      document.getElementById('chat-messages').innerHTML = '';
    });

    replaceWithClone('btn-chat-toggle').addEventListener('click', () => {
      const widget = document.getElementById('chat-widget');
      widget.style.display = widget.style.display === 'none' ? 'flex' : 'none';
    });
    replaceWithClone('btn-chat-close').addEventListener('click', () => {
      document.getElementById('chat-widget').style.display = 'none';
    });
    replaceWithClone('btn-chat-clear').addEventListener('click', async () => {
      await AI_SERVICE.saveChatHistory(hash, []);
      document.getElementById('chat-messages').innerHTML = '';
    });

    const newSend = replaceWithClone('btn-chat-send');
    newSend.addEventListener('click', () => sendChat(notes, hash, detailAnalyticsProps));
    const chatInput = document.getElementById('chat-input');
    const newInput = chatInput.cloneNode(true);
    chatInput.parentNode.replaceChild(newInput, chatInput);
    newInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(notes, hash, detailAnalyticsProps); }
    });
  }

  function replaceWithClone(id) {
    const el = document.getElementById(id);
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    return clone;
  }

  async function generateReport(notes, hash, detailAnalyticsProps = {}) {
    if (isGenerating) return;
    isGenerating = true;

    const reportEl = document.getElementById('ai-report');
    const btnGenerate = document.getElementById('btn-ai-generate');
    const btnClear = document.getElementById('btn-ai-clear');

    btnGenerate.disabled = true;
    btnGenerate.textContent = '生成中...';
    reportEl.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';

    const startAt = Date.now();
    let success = false;
    try {
      let fullText = '';
      for await (const chunk of AI_SERVICE.generateReport(notes)) {
        if (chunk.done) break;
        fullText += chunk.text;
        renderAIReport(fullText);
      }
      await AI_SERVICE.saveReport(hash, fullText);
      btnClear.style.display = 'inline-block';
      success = true;
    } catch (err) {
      reportEl.innerHTML = `<p class="ai-error">${esc(err.message)}</p>`;
    } finally {
      isGenerating = false;
      btnGenerate.disabled = false;
      btnGenerate.textContent = '生成报告';
      ANALYTICS.track('ai_report_generate', {
        mode: 'detail',
        note_count: notes.length,
        cached: false,
        duration_ms: Date.now() - startAt,
        success,
        ...detailAnalyticsProps,
      });
    }
  }

  async function sendChat(notes, hash, detailAnalyticsProps = {}) {
    if (isChatting) return;

    const input = document.getElementById('chat-input');
    const msg = input.value.trim();
    if (!msg) return;

    isChatting = true;
    input.value = '';
    const btnSend = document.getElementById('btn-chat-send');
    btnSend.disabled = true;

    const history = await AI_SERVICE.loadChatHistory(hash);
    const useTools = !!document.getElementById('chk-chat-tools')?.checked;

    ANALYTICS.track('ai_chat_send', {
      mode: 'detail',
      msg_length: msg.length,
      history_length: history.length,
      note_count: notes.length,
      use_tools: useTools,
      ...detailAnalyticsProps,
    });

    appendChatBubble('user', msg);
    const aiEl = appendChatBubble('ai', '');
    aiEl.classList.add('streaming');
    // 深度查询时在气泡上方挂一条工具调用链路
    let toolTrail = null;
    if (useTools) {
      toolTrail = document.createElement('div');
      toolTrail.className = 'chat-tool-trail';
      aiEl.parentElement.insertBefore(toolTrail, aiEl);
    }
    scrollChatToBottom();

    try {
      let fullReply = '';
      let toolRounds = 0;
      const startAt = Date.now();

      if (useTools && typeof AI_TOOLS !== 'undefined') {
        // 构造 messages（按 chat() 同样的结构：system + 数据摘要 + 历史 + 用户消息）
        const digest = AI_SERVICE.buildDataDigest(notes);
        const messages = [
          {
            role: 'system',
            content: `你是小红书运营分析助手。你可以调用下面注册的工具来查博主真实数据；先想清楚要查什么再调工具，拿到结果再综合回答。能用数据说话时必须用数据。
回答简洁专业；如果问题明显和数据无关，直接基于运营知识答即可，不必调工具。

数据概览（作为背景，必要时用工具取更细的切片）：
${digest}`,
          },
          ...history.slice(-20),
          { role: 'user', content: msg },
        ];

        const handlers = AI_TOOLS.createHandlers(notes, { hash });
        for await (const chunk of AI_SERVICE.chatWithTools(
          messages,
          AI_TOOLS.SCHEMAS,
          handlers,
          5,
        )) {
          if (chunk.toolCall) {
            toolRounds = chunk.toolCall.round;
            if (toolTrail) {
              const names = chunk.toolCall.names
                .map((n) => AI_TOOLS.DISPLAY_NAME[n] || n)
                .join(' · ');
              const chip = document.createElement('span');
              chip.className = 'chat-tool-chip';
              chip.textContent = `R${chunk.toolCall.round}: ${names}`;
              toolTrail.appendChild(chip);
              scrollChatToBottom();
            }
          } else if (chunk.done) {
            break;
          } else if (chunk.text) {
            fullReply += chunk.text;
            aiEl.textContent = fullReply;
            scrollChatToBottom();
          }
        }
      } else {
        for await (const chunk of AI_SERVICE.chat(notes, msg, history)) {
          if (chunk.done) break;
          fullReply += chunk.text;
          aiEl.textContent = fullReply;
          scrollChatToBottom();
        }
      }

      aiEl.classList.remove('streaming');

      history.push(
        { role: 'user', content: msg },
        { role: 'assistant', content: fullReply }
      );
      await AI_SERVICE.saveChatHistory(hash, history.slice(-20));

      ANALYTICS.track('ai_chat_reply', {
        mode: 'detail',
        use_tools: useTools,
        tool_rounds: toolRounds,
        duration_ms: Date.now() - startAt,
        ...detailAnalyticsProps,
      });
    } catch (err) {
      aiEl.textContent = `[错误] ${err.message}`;
      aiEl.classList.remove('streaming');
      aiEl.style.color = '#ff4d4f';
    } finally {
      isChatting = false;
      btnSend.disabled = false;
      input.focus();
    }
  }

  function appendChatBubble(role, text) {
    const container = document.getElementById('chat-messages');
    const el = document.createElement('div');
    el.className = `chat-bubble ${role}`;
    el.textContent = text;
    container.appendChild(el);
    return el;
  }

  function scrollChatToBottom() {
    const container = document.getElementById('chat-messages');
    container.scrollTop = container.scrollHeight;
  }

  function renderChatHistory(messages) {
    const container = document.getElementById('chat-messages');
    container.innerHTML = '';
    for (const msg of messages) {
      appendChatBubble(msg.role === 'user' ? 'user' : 'ai', msg.content);
    }
    scrollChatToBottom();
  }

  // ========== 云同步面板（v2.8.0）==========

  async function initCloudSyncPanel() {
    if (typeof CLOUD_SYNC === 'undefined') return;

    const panel = document.getElementById('cloud-sync-panel');
    if (!panel) return;

    const statusEl = document.getElementById('csp-status');
    const authBox = document.getElementById('csp-auth');
    const loggedInBox = document.getElementById('csp-loggedin');
    const submitBtn = document.getElementById('csp-submit');
    const emailEl = document.getElementById('csp-user-email');
    const metaEl = document.getElementById('csp-user-meta');
    const signoutBtn = document.getElementById('csp-signout');
    const clearCloudBtn = document.getElementById('csp-clear-cloud');

    let currentTab = 'signin';

    function updateAuthCopy(session) {
      const isAnonymous = !!(session && CLOUD_SYNC.isAnonymousSession(session));
      panel.querySelectorAll('.csp-tab').forEach((tab) => {
        if (tab.dataset.tab === 'signin') {
          tab.textContent = isAnonymous ? '绑定已有账号' : '登录';
        } else {
          tab.textContent = isAnonymous ? '注册并绑定邮箱' : '注册';
        }
      });
      submitBtn.textContent =
        currentTab === 'signin'
          ? (isAnonymous ? '绑定已有账号' : '登录')
          : (isAnonymous ? '注册并绑定邮箱' : '注册');
    }

    async function refreshWorkbenchForCurrentRoute() {
      const route = getRoute();
      if (route.view === 'overview') {
        await renderWorkbenchOverview(await DATA_STORE.getBloggerIndex());
      } else if (route.view === 'detail') {
        const bloggerData = await DATA_STORE.getBloggerData(route.userId);
        if (bloggerData?.notes?.length) {
          await renderWorkbenchDetail(route.userId, bloggerData);
        }
      }
    }

    async function refresh() {
      const session = await CLOUD_SYNC.getSession();
      const hasIdentity = !!session?.access_token;
      const isAnonymous = hasIdentity && CLOUD_SYNC.isAnonymousSession(session);
      const hasBoundEmail = hasIdentity && CLOUD_SYNC.hasBoundEmail(session);
      updateAuthCopy(session);

      if (hasBoundEmail) {
        statusEl.textContent = '已绑定邮箱';
        statusEl.className = 'csp-status ok';
        authBox.classList.add('hidden');
        loggedInBox.classList.remove('hidden');
        emailEl.textContent = session.user?.email || '已登录';
        signoutBtn.classList.remove('hidden');
        clearCloudBtn.disabled = false;
        await refreshStats();
      } else if (isAnonymous) {
        statusEl.textContent = '匿名已连接';
        statusEl.className = 'csp-status ok';
        authBox.classList.remove('hidden');
        loggedInBox.classList.remove('hidden');
        emailEl.textContent = '匿名云身份（可继续绑定邮箱）';
        signoutBtn.classList.remove('hidden');
        clearCloudBtn.disabled = false;
        await refreshStats();
      } else {
        const localIndex = await DATA_STORE.getBloggerIndex();
        const localBloggers = localIndex.length;
        const localNotes = localIndex.reduce((sum, blogger) => sum + (blogger.noteCount || 0), 0);
        statusEl.textContent = '待创建匿名身份';
        statusEl.className = 'csp-status warn';
        authBox.classList.remove('hidden');
        loggedInBox.classList.remove('hidden');
        emailEl.textContent = '首次同步时自动创建匿名云身份';
        metaEl.textContent = `本地 ${localBloggers} 博主 / ${localNotes} 笔记 · 首次同步时自动创建云端身份`;
        signoutBtn.classList.add('hidden');
        clearCloudBtn.disabled = true;
      }
      await refreshWorkbenchForCurrentRoute();
    }

    async function refreshStats() {
      try {
        const localIndex = await DATA_STORE.getBloggerIndex();
        const localBloggers = localIndex.length;
        const localNotes = localIndex.reduce((s, b) => s + (b.noteCount || 0), 0);

        const remote = await CLOUD_SYNC.getRemoteStats().catch(() => ({ bloggers: 0, notes: 0 }));
        const lastAt = await CLOUD_SYNC.getLastSyncAt();
        const lastStr = lastAt ? `· 上次同步 ${formatRelTime(lastAt)}` : '';
        metaEl.textContent =
          `本地 ${localBloggers} 博主 / ${localNotes} 笔记 · 云端 ${remote.bloggers} / ${remote.notes} ${lastStr}`;
      } catch (e) {
        metaEl.textContent = '统计加载失败';
      }
      await refreshWorkbenchForCurrentRoute();
    }

    // Tab 切换
    panel.querySelectorAll('.csp-tab').forEach(tab => {
      tab.addEventListener('click', async () => {
        currentTab = tab.dataset.tab;
        panel.querySelectorAll('.csp-tab').forEach(t => t.classList.toggle('active', t === tab));
        updateAuthCopy(await CLOUD_SYNC.getSession());
        document.getElementById('csp-auth-msg').textContent = '';
        document.getElementById('csp-auth-msg').className = 'csp-msg';
      });
    });

    // 提交登录/注册
    document.getElementById('csp-submit').addEventListener('click', async () => {
      const email = document.getElementById('csp-email').value.trim();
      const password = document.getElementById('csp-password').value;
      const msgEl = document.getElementById('csp-auth-msg');
      msgEl.className = 'csp-msg';

      if (!email || !password) {
        msgEl.textContent = '请输入邮箱和密码';
        msgEl.className = 'csp-msg err';
        return;
      }

      submitBtn.disabled = true;
      const originalText = submitBtn.textContent;
      submitBtn.textContent = '处理中...';

      try {
        let result;
        if (currentTab === 'signin') {
          result = await CLOUD_SYNC.signIn(email, password);
          const migrated = (result?.migration?.bloggers || 0) + (result?.migration?.notes || 0) + (result?.migration?.aiReports || 0);
          msgEl.textContent = migrated > 0
            ? `绑定成功，已迁移 ${result.migration.bloggers} 位博主 / ${result.migration.notes} 篇笔记`
            : '登录成功';
          msgEl.className = 'csp-msg ok';
        } else {
          result = await CLOUD_SYNC.signUp(email, password);
          if (result.requiresConfirm) {
            msgEl.textContent = result.keptAnonymousIdentity
              ? '注册成功，请先验证邮箱；当前匿名云身份和已同步数据会保留，验证后再回来绑定'
              : '注册成功，请查收验证邮件后再登录';
            msgEl.className = 'csp-msg warn';
            return;
          }
          const migrated = (result?.migration?.bloggers || 0) + (result?.migration?.notes || 0) + (result?.migration?.aiReports || 0);
          msgEl.textContent = migrated > 0
            ? `注册并绑定成功，已迁移 ${result.migration.bloggers} 位博主 / ${result.migration.notes} 篇笔记`
            : '注册成功并已登录';
          msgEl.className = 'csp-msg ok';
        }
        await refresh();
        ANALYTICS.track('cloud_sync_auth', { action: currentTab });
      } catch (e) {
        msgEl.textContent = e.message;
        msgEl.className = 'csp-msg err';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });

    // 退出
    document.getElementById('csp-signout').addEventListener('click', async () => {
      const currentSession = await CLOUD_SYNC.getSession();
      if (!confirm(CLOUD_SYNC.isAnonymousSession(currentSession) ? '确定清除当前匿名云身份？本地数据不会被删除。' : '确定退出云同步？本地数据不会被删除。')) return;
      await CLOUD_SYNC.signOut();
      await refresh();
    });

    // 立即同步全部
    document.getElementById('csp-sync-now').addEventListener('click', async () => {
      const btn = document.getElementById('csp-sync-now');
      const progressBox = document.getElementById('csp-progress');
      const progressFill = document.getElementById('csp-progress-fill');
      const progressText = document.getElementById('csp-progress-text');
      const resultEl = document.getElementById('csp-result');

      btn.disabled = true;
      btn.textContent = '同步中...';
      progressBox.classList.remove('hidden');
      progressFill.style.width = '0%';
      progressText.textContent = '准备中...';
      resultEl.textContent = '';
      resultEl.className = 'csp-msg';

      const startAt = Date.now();
      try {
        const result = await CLOUD_SYNC.syncAll(({ phase, current, total, bloggerName }) => {
          const pct = total > 0 ? Math.round((current / total) * 100) : 0;
          progressFill.style.width = pct + '%';
          const label = phase === 'pull' ? '拉取云端' : '上传本地';
          progressText.textContent = `${label} ${current}/${total} · ${bloggerName || ''}`;
        });
        progressFill.style.width = '100%';
        const errMsg = result.errors.length > 0
          ? `（${result.errors.length} 位失败：${result.errors[0].nickname || result.errors[0].userId}${result.errors.length > 1 ? ' 等' : ''}）`
          : '';
        const aiMsg = result.aiReportCount > 0 ? ` / ${result.aiReportCount} 份 AI 报告` : '';
        const pull = result.pull || {};
        const pulledBloggerTotal = (pull.newBloggers || 0) + (pull.updatedBloggers || 0);
        const pullParts = [];
        if (pulledBloggerTotal > 0) pullParts.push(`${pulledBloggerTotal} 位博主`);
        if (pull.newNotes > 0) pullParts.push(`${pull.newNotes} 篇新笔记`);
        if (pull.newAiReports > 0) pullParts.push(`${pull.newAiReports} 份 AI 报告`);
        const pullMsg = pullParts.length > 0 ? `已从云端拉回 ${pullParts.join(' / ')}；` : '';
        resultEl.textContent = `${pullMsg}同步完成：${result.bloggerCount} 位博主 / ${result.totalNotes} 篇笔记${aiMsg} ${errMsg}`;
        resultEl.className = result.errors.length > 0 ? 'csp-msg warn' : 'csp-msg ok';
        if (result.errors.length > 0) {
          console.warn('[CloudSync] errors:', result.errors);
        }
        ANALYTICS.track('cloud_sync_run', {
          blogger_count: result.bloggerCount,
          note_count: result.totalNotes,
          pulled_bloggers: pulledBloggerTotal,
          pulled_notes: pull.newNotes || 0,
          error_count: result.errors.length,
          duration_ms: Date.now() - startAt,
        });
        await refreshStats();
      } catch (e) {
        resultEl.textContent = '同步失败：' + e.message;
        resultEl.className = 'csp-msg err';
        console.error('[CloudSync] syncAll failed:', e);
      } finally {
        btn.disabled = false;
        btn.textContent = '立即同步全部';
        setTimeout(() => progressBox.classList.add('hidden'), 2000);
      }
    });

    // 清空云端
    document.getElementById('csp-clear-cloud').addEventListener('click', async () => {
      if (!confirm('确定清空云端的所有博主和笔记？此操作不可恢复，本地数据不受影响。')) return;
      const resultEl = document.getElementById('csp-result');
      try {
        await CLOUD_SYNC.clearCloudData();
        resultEl.textContent = '云端数据已清空';
        resultEl.className = 'csp-msg ok';
        await refreshStats();
      } catch (e) {
        resultEl.textContent = '清空失败：' + e.message;
        resultEl.className = 'csp-msg err';
      }
    });

    await refresh();
  }

  // ========== 工具函数 ==========

  function fmtNum(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return (n || 0).toLocaleString();
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function formatRelTime(ts) {
    if (!ts) return '未知时间';
    const diff = Date.now() - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff / 60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff / 3600000) + '小时前';
    if (diff < 2592000000) return Math.floor(diff / 86400000) + '天前';
    return new Date(ts).toLocaleDateString('zh-CN');
  }
})();
