// 素材库 v2（v2.8.2）
// 搜索 / 标签 / 博主筛选 / 互动区间 / 统计面板 / 一键复制 / 批量导出 / 详情侧边栏

(async function () {
  'use strict';

  const PAGE_SIZE = 40;

  // ===== 数据 =====
  let allNotes = [];
  let filteredNotes = [];
  let displayedCount = 0;

  // 筛选状态
  let searchQuery = '';
  let selectedBloggers = new Set();
  let selectedTags = new Set();
  let selectedTypes = new Set(['image', 'video']);
  let sortKey = 'likes-desc';
  let likesMin = null, likesMax = null;
  let collectsMin = null, collectsMax = null;
  const entryParams = new URLSearchParams(window.location.search);
  const entryBlogger = entryParams.get('blogger') || '';
  const entryNoteId = entryParams.get('note') || '';
  const entrySearch = entryParams.get('search') || '';

  // ===== 数据加载 =====

  async function loadAllNotes() {
    const index = await DATA_STORE.getBloggerIndex();
    const notes = [];

    for (const entry of index) {
      const data = await DATA_STORE.getBloggerData(entry.userId);
      if (!data?.notes?.length) continue;
      for (const note of data.notes) {
        notes.push({
          ...note,
          _blogger: {
            userId: entry.userId,
            nickname: data.nickname || entry.nickname || '未知',
            avatar: data.avatar || entry.avatar || '',
          },
        });
      }
    }

    allNotes = notes;
    document.getElementById('total-count').textContent = `${allNotes.length} 篇笔记`;
    return index;
  }

  // ===== 搜索 =====

  function matchesSearch(note, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const fields = [
      note.title || '',
      note.content || '',
      (note.tags || []).join(' '),
      note._blogger?.nickname || '',
    ].join(' ').toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    return terms.every(term => fields.includes(term));
  }

  // ===== 筛选 + 排序 =====

  function applyFilters() {
    filteredNotes = allNotes.filter(note => {
      if (!matchesSearch(note, searchQuery)) return false;
      if (selectedBloggers.size > 0 && !selectedBloggers.has(note._blogger.userId)) return false;

      const isVideo = !!(note.video);
      const type = isVideo ? 'video' : 'image';
      if (!selectedTypes.has(type)) return false;

      if (selectedTags.size > 0) {
        const noteTags = (note.tags || []).map(t => t.replace(/^#/, ''));
        if (!noteTags.some(t => selectedTags.has(t))) return false;
      }

      // 互动区间
      const likes = note.likes || 0;
      const collects = note.collects || 0;
      if (likesMin != null && likes < likesMin) return false;
      if (likesMax != null && likes > likesMax) return false;
      if (collectsMin != null && collects < collectsMin) return false;
      if (collectsMax != null && collects > collectsMax) return false;

      return true;
    });

    const [key, dir] = sortKey.split('-');
    const mult = dir === 'asc' ? 1 : -1;
    filteredNotes.sort((a, b) => {
      switch (key) {
        case 'likes': return mult * ((a.likes || 0) - (b.likes || 0));
        case 'collects': return mult * ((a.collects || 0) - (b.collects || 0));
        case 'comments': return mult * ((a.commentCount || 0) - (b.commentCount || 0));
        case 'time': {
          const ta = a.publishTimestamp || new Date(a.crawlTime || 0).getTime() || 0;
          const tb = b.publishTimestamp || new Date(b.crawlTime || 0).getTime() || 0;
          return mult * (ta - tb);
        }
        default: return 0;
      }
    });

    displayedCount = 0;
    renderNotes();
    renderStatsPanel();
    updateFilterSummary();
  }

  // ===== 工具函数 =====

  function fmtNum(n) {
    if (n == null) return '0';
    if (n >= 10000) return (n / 10000).toFixed(1) + 'w';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1800);
  }

  async function startLibraryOnboarding() {
    if (typeof ONBOARDING === 'undefined') return;
    if (await ONBOARDING.isDone('library')) return;
    ONBOARDING.start({
      key: 'library',
      steps: [
        {
          selector: '.sidebar-header',
          title: '欢迎来到素材库',
          content: '这里会把所有已采集的笔记放到一个库里，适合做 <strong>选题研究、竞品拆解、找高表现样本</strong>。',
          position: 'right',
        },
        {
          selector: '#search-input',
          title: '先从搜索开始',
          content: '支持搜 <strong>标题、正文、标签、博主名</strong>。第一次进来时，先试一个主题词，最快能感受到素材库的价值。',
          position: 'right',
        },
        {
          selector: '#blogger-filter',
          title: '按博主缩小范围',
          content: '当你采集了多位博主后，可以先只保留 1 到 2 位账号，再观察他们的内容差异。',
          position: 'right',
        },
        {
          selector: '#stats-panel',
          title: '先看筛选后的统计',
          content: '这里会实时显示 <strong>笔记数、平均赞、爆款率、藏赞比</strong>，方便你快速判断当前样本值不值得继续看。',
          position: 'bottom',
        },
        {
          selector: '#note-grid',
          title: '素材卡片可直接展开',
          content: '点任意卡片可看完整正文、评论、历史互动和原文链接；图片加载失败时，也不会影响你继续查看标题和数据。',
          position: 'top',
        },
        {
          selector: '#btn-export-csv',
          title: '筛完就能导出',
          content: '把当前筛选结果直接导出成 CSV，适合发给分析工具或自己继续整理。',
          position: 'bottom',
        },
      ],
    });
  }

  async function copyText(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`${label} 已复制`);
    } catch {
      showToast('复制失败');
    }
  }

  // ===== 统计面板 =====

  function renderStatsPanel() {
    const panel = document.getElementById('stats-panel');
    if (filteredNotes.length === 0) {
      panel.innerHTML = '';
      return;
    }

    const n = filteredNotes.length;
    const totalLikes = filteredNotes.reduce((s, x) => s + (x.likes || 0), 0);
    const totalCollects = filteredNotes.reduce((s, x) => s + (x.collects || 0), 0);
    const totalComments = filteredNotes.reduce((s, x) => s + (x.commentCount || 0), 0);
    const avgLikes = Math.round(totalLikes / n);
    const avgCollects = Math.round(totalCollects / n);
    const avgComments = Math.round(totalComments / n);

    // 爆款率
    const sortedLikes = filteredNotes.map(x => x.likes || 0).sort((a, b) => a - b);
    const median = sortedLikes[Math.floor(n / 2)];
    const viralCount = filteredNotes.filter(x => (x.likes || 0) >= median * 2).length;
    const viralRate = n > 0 ? Math.round(viralCount / n * 100) : 0;

    // 收藏价值率
    const cvr = avgLikes > 0 ? (avgCollects / avgLikes).toFixed(2) : '0';

    panel.innerHTML = `
      <div class="stat-item"><span class="stat-value">${n}</span><span class="stat-label">笔记数</span></div>
      <div class="stat-item"><span class="stat-value highlight">${fmtNum(avgLikes)}</span><span class="stat-label">平均赞</span></div>
      <div class="stat-item"><span class="stat-value">${fmtNum(avgCollects)}</span><span class="stat-label">平均藏</span></div>
      <div class="stat-item"><span class="stat-value">${fmtNum(avgComments)}</span><span class="stat-label">平均评</span></div>
      <div class="stat-item"><span class="stat-value highlight">${viralRate}%</span><span class="stat-label">爆款率</span></div>
      <div class="stat-item"><span class="stat-value">${cvr}</span><span class="stat-label">藏赞比</span></div>
    `;
  }

  // ===== 渲染笔记 =====

  function renderNotes() {
    const grid = document.getElementById('note-grid');
    const empty = document.getElementById('empty-state');
    const loadMore = document.getElementById('load-more');

    if (filteredNotes.length === 0) {
      grid.innerHTML = '';
      empty.style.display = '';
      loadMore.style.display = 'none';
      return;
    }
    empty.style.display = 'none';

    const end = Math.min(displayedCount + PAGE_SIZE, filteredNotes.length);
    const fragment = document.createDocumentFragment();
    if (displayedCount === 0) grid.innerHTML = '';

    for (let i = displayedCount; i < end; i++) {
      const note = filteredNotes[i];
      const card = document.createElement('div');
      card.className = 'note-card';
      card.dataset.idx = i;

      const isVideo = !!(note.video);
      const coverUrl = note.coverBase64 || (note.images && note.images[0]) || '';
      const tags = (note.tags || []).slice(0, 5).map(t => t.replace(/^#/, ''));

      card.innerHTML = `
        <div class="note-actions">
          <button class="note-action-btn" data-action="copy-title" title="复制标题">T</button>
          <button class="note-action-btn" data-action="copy-tags" title="复制标签">#</button>
          <button class="note-action-btn" data-action="copy-link" title="复制链接">&#128279;</button>
        </div>
        ${coverUrl
          ? `<img class="note-cover" src="${esc(coverUrl)}" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.onerror=null;this.outerHTML='<div class=\\'note-cover-placeholder\\'><div class=\\'note-cover-placeholder-icon\\'>封面加载失败</div><div class=\\'note-cover-placeholder-tip\\'>不影响查看标题、数据和详情</div></div>'">`
          : '<div class="note-cover-placeholder"><div class="note-cover-placeholder-icon">暂无封面</div><div class="note-cover-placeholder-tip">可直接查看标题、数据和详情</div></div>'}
        <div class="note-body">
          <div class="note-title">${esc(note.title || '无标题')}</div>
          <div class="note-meta">
            ${note._blogger.avatar ? `<img class="note-avatar" src="${esc(note._blogger.avatar)}" referrerpolicy="no-referrer" alt="">` : ''}
            <span class="note-author">${esc(note._blogger.nickname)}</span>
            <span class="note-type-badge ${isVideo ? 'video' : 'image'}">${isVideo ? '视频' : '图文'}</span>
          </div>
          <div class="note-stats">
            <span>&#10084; <b class="val">${fmtNum(note.likes)}</b></span>
            <span>&#9733; <b class="val">${fmtNum(note.collects)}</b></span>
            <span>&#128172; <b class="val">${fmtNum(note.commentCount)}</b></span>
          </div>
          ${tags.length ? `<div class="note-tags">${tags.map(t => `<span class="note-tag">#${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
      `;

      // 点击打开详情侧边栏
      card.addEventListener('click', (e) => {
        if (e.target.closest('.note-action-btn')) return;
        openDetailSidebar(note);
      });

      // 复制按钮
      card.querySelectorAll('.note-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          if (action === 'copy-title') copyText(note.title || '', '标题');
          else if (action === 'copy-tags') copyText((note.tags || []).join(' '), '标签');
          else if (action === 'copy-link') copyText(note.noteUrl || '', '链接');
        });
      });

      fragment.appendChild(card);
    }

    grid.appendChild(fragment);
    displayedCount = end;
    loadMore.style.display = displayedCount < filteredNotes.length ? '' : 'none';
  }

  function updateFilterSummary() {
    const el = document.getElementById('filter-summary');
    const parts = [];
    if (searchQuery) parts.push(`搜索"${searchQuery}"`);
    if (selectedBloggers.size > 0) parts.push(`${selectedBloggers.size} 位博主`);
    if (selectedTags.size > 0) parts.push(`${selectedTags.size} 个标签`);
    if (selectedTypes.size < 2) parts.push(selectedTypes.has('video') ? '仅视频' : '仅图文');
    if (likesMin != null || likesMax != null) parts.push(`赞 ${likesMin ?? 0}-${likesMax ?? '∞'}`);
    if (collectsMin != null || collectsMax != null) parts.push(`藏 ${collectsMin ?? 0}-${collectsMax ?? '∞'}`);

    el.textContent = parts.length > 0
      ? `筛选: ${parts.join(' · ')} — ${filteredNotes.length} 篇`
      : `全部 ${filteredNotes.length} 篇笔记`;

    document.getElementById('btn-clear-filters').style.display = parts.length > 0 ? '' : 'none';
  }

  // ===== 详情侧边栏 =====

  function openDetailSidebar(note) {
    const overlay = document.getElementById('detail-overlay');
    const sidebar = document.getElementById('detail-sidebar');
    const body = document.getElementById('detail-content');

    const tags = (note.tags || []).map(t => t.replace(/^#/, ''));
    const images = note.images || [];
    const comments = (note.comments || []).slice(0, 10);
    const history = note.history || [];

    let html = '';

    // 标题
    html += `<h2 class="detail-title">${esc(note.title || '无标题')}</h2>`;

    // 博主信息
    html += `<div class="detail-meta">
      ${note._blogger?.avatar ? `<img class="detail-avatar" src="${esc(note._blogger.avatar)}" referrerpolicy="no-referrer" alt="">` : ''}
      <span class="detail-author">${esc(note._blogger?.nickname || '')}</span>
      ${note.publishTime ? `<span style="color:#999;font-size:12px">${esc(note.publishTime)}</span>` : ''}
    </div>`;

    // 互动数据
    html += `<div class="detail-stats">
      <span>&#10084; <b>${fmtNum(note.likes)}</b> 赞</span>
      <span>&#9733; <b>${fmtNum(note.collects)}</b> 藏</span>
      <span>&#128172; <b>${fmtNum(note.commentCount)}</b> 评</span>
    </div>`;

    // 操作按钮
    html += `<div class="detail-actions">
      <button class="detail-action-btn" data-copy="title">复制标题</button>
      <button class="detail-action-btn" data-copy="content">复制正文</button>
      <button class="detail-action-btn" data-copy="tags">复制标签</button>
      <button class="detail-action-btn" data-copy="link">复制链接</button>
    </div>`;

    // 图片
    if (images.length > 0) {
      const imgHtml = images.map(url => {
        const src = note.coverBase64 && url === images[0] ? note.coverBase64 : url;
        return `<img class="detail-img" src="${esc(src)}" loading="lazy" referrerpolicy="no-referrer" alt="" onerror="this.style.background='#f0f0f0';this.alt='加载失败'">`;
      }).join('');
      html += `<div class="detail-images">${imgHtml}</div>`;
    }

    // 正文
    if (note.content) {
      html += `<div class="detail-content">${esc(note.content)}</div>`;
    }

    // 标签
    if (tags.length > 0) {
      html += `<div class="detail-tags">${tags.map(t => `<span class="detail-tag">#${esc(t)}</span>`).join('')}</div>`;
    }

    // 历史变化
    if (history.length > 0) {
      html += `<div class="detail-history">
        <div class="detail-history-title">互动变化记录 (${history.length} 次)</div>
        <table class="detail-history-table">
          <tr><th>时间</th><th>赞</th><th>藏</th><th>评</th></tr>
          ${history.slice(-10).map(h => {
            const t = typeof h.ts === 'number' ? new Date(h.ts).toLocaleString('zh-CN') : h.ts;
            return `<tr><td>${esc(String(t))}</td><td>${fmtNum(h.likes)}</td><td>${fmtNum(h.collects)}</td><td>${fmtNum(h.commentCount)}</td></tr>`;
          }).join('')}
          <tr style="font-weight:600"><td>当前</td><td>${fmtNum(note.likes)}</td><td>${fmtNum(note.collects)}</td><td>${fmtNum(note.commentCount)}</td></tr>
        </table>
      </div>`;
    }

    // 评论
    if (comments.length > 0) {
      html += `<div class="detail-comments">
        <div class="detail-comments-title">精选评论 (${note.comments?.length || 0})</div>
        ${comments.map(c => {
          const author = c.nickname || c.user?.nickname || '匿名';
          const text = c.content || c.text || '';
          return `<div class="detail-comment"><span class="detail-comment-author">${esc(author)}</span>${esc(text)}</div>`;
        }).join('')}
      </div>`;
    }

    // 查看原文
    if (note.noteUrl) {
      html += `<a href="${esc(note.noteUrl)}" target="_blank" rel="noopener" class="detail-link">查看原文 &rarr;</a>`;
    }

    body.innerHTML = html;

    // 绑定复制按钮
    body.querySelectorAll('.detail-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.copy;
        if (type === 'title') copyText(note.title || '', '标题');
        else if (type === 'content') copyText(note.content || '', '正文');
        else if (type === 'tags') copyText((note.tags || []).join(' '), '标签');
        else if (type === 'link') copyText(note.noteUrl || '', '链接');
      });
    });

    // 图片点击新窗口打开
    body.querySelectorAll('.detail-img').forEach(img => {
      img.addEventListener('click', () => window.open(img.src, '_blank'));
    });

    overlay.style.display = '';
    sidebar.style.display = '';
  }

  function closeDetailSidebar() {
    document.getElementById('detail-overlay').style.display = 'none';
    document.getElementById('detail-sidebar').style.display = 'none';
  }

  // ===== 批量导出 CSV =====

  function exportFilteredCsv() {
    if (filteredNotes.length === 0) {
      showToast('没有可导出的数据');
      return;
    }

    const csvEscape = (s) => {
      if (s == null) return '';
      const str = String(s);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    const headers = ['标题', '正文', '博主', '点赞', '收藏', '评论', '标签', '内容类型', '发布时间', '链接'];
    const rows = filteredNotes.map(n => [
      csvEscape(n.title),
      csvEscape(n.content),
      csvEscape(n._blogger?.nickname),
      n.likes || 0,
      n.collects || 0,
      n.commentCount || 0,
      csvEscape((n.tags || []).join(' ')),
      n.video ? '视频' : '图文',
      csvEscape(n.publishTime || n.crawlTime || ''),
      csvEscape(n.noteUrl || ''),
    ].join(','));

    const bom = '\uFEFF';
    const csv = bom + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `素材库导出_${filteredNotes.length}篇_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast(`已导出 ${filteredNotes.length} 篇笔记`);
  }

  // ===== 侧栏初始化 =====

  function initBloggerFilter(index) {
    const container = document.getElementById('blogger-filter');
    container.innerHTML = '';
    for (const entry of index) {
      const label = document.createElement('label');
      label.className = 'cb-label';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = true;
      cb.value = entry.userId;
      cb.addEventListener('change', () => {
        const allCbs = container.querySelectorAll('input[type=checkbox]');
        selectedBloggers.clear();
        let allChecked = true;
        allCbs.forEach(c => {
          if (c.checked) selectedBloggers.add(c.value);
          else allChecked = false;
        });
        if (allChecked) selectedBloggers.clear();
        applyFilters();
      });
      const span = document.createElement('span');
      span.textContent = `${entry.nickname || '未知'} (${entry.noteCount || 0})`;
      label.appendChild(cb);
      label.appendChild(span);
      container.appendChild(label);
    }
  }

  function initTagCloud() {
    const tagCounts = new Map();
    for (const note of allNotes) {
      for (const raw of (note.tags || [])) {
        const t = raw.replace(/^#/, '');
        if (!t) continue;
        tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
      }
    }
    const sorted = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
    const container = document.getElementById('tag-cloud');
    container.innerHTML = '';
    for (const [tag, count] of sorted) {
      const pill = document.createElement('span');
      pill.className = 'tag-pill';
      pill.textContent = `#${tag} (${count})`;
      pill.dataset.tag = tag;
      pill.addEventListener('click', () => {
        if (selectedTags.has(tag)) {
          selectedTags.delete(tag);
          pill.classList.remove('active');
        } else {
          selectedTags.add(tag);
          pill.classList.add('active');
        }
        applyFilters();
      });
      container.appendChild(pill);
    }
  }

  // ===== 事件绑定 =====

  function bindEvents() {
    // 搜索
    let searchTimer;
    document.getElementById('search-input').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        searchQuery = e.target.value.trim();
        applyFilters();
      }, 300);
    });

    // 排序
    document.getElementById('sort-select').addEventListener('change', (e) => {
      sortKey = e.target.value;
      applyFilters();
    });

    // 内容类型
    document.querySelectorAll('.type-filter').forEach(cb => {
      cb.addEventListener('change', () => {
        selectedTypes.clear();
        document.querySelectorAll('.type-filter:checked').forEach(c => selectedTypes.add(c.value));
        applyFilters();
      });
    });

    // 互动区间
    let rangeTimer;
    const rangeInputs = ['likes-min', 'likes-max', 'collects-min', 'collects-max'];
    rangeInputs.forEach(id => {
      document.getElementById(id).addEventListener('input', () => {
        clearTimeout(rangeTimer);
        rangeTimer = setTimeout(() => {
          const v = (id) => {
            const val = document.getElementById(id).value.trim();
            return val === '' ? null : parseInt(val, 10);
          };
          likesMin = v('likes-min');
          likesMax = v('likes-max');
          collectsMin = v('collects-min');
          collectsMax = v('collects-max');
          applyFilters();
        }, 400);
      });
    });

    // 清除筛选
    document.getElementById('btn-clear-filters').addEventListener('click', () => {
      searchQuery = '';
      document.getElementById('search-input').value = '';
      selectedBloggers.clear();
      selectedTags.clear();
      selectedTypes = new Set(['image', 'video']);
      likesMin = likesMax = collectsMin = collectsMax = null;

      document.querySelectorAll('#blogger-filter input').forEach(c => c.checked = true);
      document.querySelectorAll('.type-filter').forEach(c => c.checked = true);
      document.querySelectorAll('.tag-pill.active').forEach(p => p.classList.remove('active'));
      document.getElementById('sort-select').value = 'likes-desc';
      sortKey = 'likes-desc';
      rangeInputs.forEach(id => document.getElementById(id).value = '');

      applyFilters();
    });

    // 加载更多
    document.getElementById('btn-load-more').addEventListener('click', renderNotes);

    // 导出 CSV
    document.getElementById('btn-export-csv').addEventListener('click', exportFilteredCsv);

    // 详情侧边栏
    document.getElementById('btn-detail-close').addEventListener('click', closeDetailSidebar);
    document.getElementById('detail-overlay').addEventListener('click', closeDetailSidebar);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDetailSidebar();
    });

    // 返回分析看板
    document.getElementById('btn-back-analysis').addEventListener('click', () => {
      window.location.href = chrome.runtime.getURL('analysis/analysis.html');
    });
  }

  // ===== 启动 =====

  function applyEntryContext() {
    if (entrySearch) {
      searchQuery = entrySearch.trim();
      document.getElementById('search-input').value = searchQuery;
    }

    if (entryBlogger) {
      selectedBloggers = new Set([entryBlogger]);
      document.querySelectorAll('#blogger-filter input').forEach(cb => {
        cb.checked = cb.value === entryBlogger;
      });
    }

    applyFilters();

    if (entryNoteId) {
      const match = filteredNotes.find(note =>
        String(note.noteId || note.id || '') === entryNoteId ||
        String(note.id || note.noteId || '') === entryNoteId
      ) || allNotes.find(note =>
        String(note.noteId || note.id || '') === entryNoteId ||
        String(note.id || note.noteId || '') === entryNoteId
      );
      if (match) openDetailSidebar(match);
    }
  }

  async function init() {
    bindEvents();
    const index = await loadAllNotes();

    if (allNotes.length === 0) {
      document.getElementById('empty-state').style.display = '';
      document.querySelector('.empty-state p:last-child').textContent = '还没有采集过笔记，先去抓取一些吧';
      return;
    }

    initBloggerFilter(index);
    initTagCloud();
    applyEntryContext();
    setTimeout(() => startLibraryOnboarding(), 300);
  }

  init();
})();
