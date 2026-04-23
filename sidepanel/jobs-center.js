// 任务中心 — 订阅 JOBS 并渲染分组卡片（侧边栏专属）
// 依赖：lib/jobs-registry.js 已先加载并暴露 window.JOBS

(function () {
  if (typeof JOBS === 'undefined') return;

  const section = document.getElementById('jobs-center-section');
  const bodyEl = document.getElementById('jobs-center-body');
  const clearBtn = document.getElementById('jobs-center-clear');
  if (!section || !bodyEl) return;

  const STATUS = JOBS.STATUS;
  const ATTENTION = new Set([STATUS.CAPTCHA_WAIT, STATUS.RATE_LIMITED, STATUS.FAILED]);
  const ACTIVE = new Set([STATUS.RUNNING, STATUS.PAUSED_COOLDOWN]);
  const TERMINAL = new Set([STATUS.DONE, STATUS.CANCELLED]);

  const STATUS_LABEL = {
    [STATUS.RUNNING]: '抓取中',
    [STATUS.PAUSED_COOLDOWN]: '冷却中',
    [STATUS.CAPTCHA_WAIT]: '需要验证',
    [STATUS.RATE_LIMITED]: '被限流',
    [STATUS.FAILED]: '已中断',
    [STATUS.DONE]: '已完成',
    [STATUS.CANCELLED]: '已取消',
  };

  function relativeTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
    const days = Math.floor(diff / 86_400_000);
    if (days === 1) return '昨天';
    if (days < 7) return `${days} 天前`;
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function formatCooldown(until) {
    if (!until) return '';
    const remainSec = Math.max(0, Math.round((until - Date.now()) / 1000));
    const m = Math.floor(remainSec / 60);
    const s = remainSec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function buildCard(job) {
    const status = job.status || STATUS.RUNNING;
    const nickname = job.nickname || '未命名博主';
    const scraped = job.scraped || 0;
    const total = job.total || 0;
    const errorCount = job.errorCount || 0;

    // 副行文案：根据状态拼不同内容
    let metaParts = [`<span class="job-card-progress">${scraped}/${total}</span>`];
    if (status === STATUS.PAUSED_COOLDOWN && job.chunkCooldownUntil) {
      metaParts.push(`防封冷却 ${formatCooldown(job.chunkCooldownUntil)}`);
    }
    if (status === STATUS.RATE_LIMITED && job.lastErrorMessage) {
      metaParts.push(escapeHtml(job.lastErrorMessage));
    }
    if (status === STATUS.FAILED && job.lastErrorMessage) {
      metaParts.push(escapeHtml(job.lastErrorMessage));
    }
    if (errorCount > 0) metaParts.push(`${errorCount} 个错误`);
    if (TERMINAL.has(status) && job.endedAt) {
      metaParts.push(relativeTime(job.endedAt));
    }

    // 操作按钮
    const actions = [];
    if (ACTIVE.has(status)) {
      actions.push(`<button data-action="open" data-job="${job.id}">查看</button>`);
      actions.push(`<button data-action="cancel" data-job="${job.id}">取消</button>`);
    } else if (status === STATUS.CAPTCHA_WAIT) {
      actions.push(`<button class="primary" data-action="captcha" data-job="${job.id}">去验证</button>`);
      actions.push(`<button data-action="remove" data-job="${job.id}">放弃</button>`);
    } else if (status === STATUS.RATE_LIMITED || status === STATUS.FAILED) {
      actions.push(`<button class="primary" data-action="resume" data-job="${job.id}">继续抓取</button>`);
      actions.push(`<button data-action="remove" data-job="${job.id}">放弃</button>`);
    } else if (status === STATUS.DONE || status === STATUS.CANCELLED) {
      if (job.userId) {
        actions.push(`<button class="primary" data-action="analyze" data-job="${job.id}">打开分析</button>`);
      }
      actions.push(`<button data-action="rerun" data-job="${job.id}">再抓一次</button>`);
      actions.push(`<span class="spacer"></span>`);
      actions.push(`<button class="ghost" data-action="remove" data-job="${job.id}" title="从列表移除">×</button>`);
    }

    return `
      <div class="job-card" data-status="${status}" data-job="${job.id}">
        <div class="job-card-head">
          <div class="job-card-title">@${escapeHtml(nickname)}</div>
          <span class="job-card-status">${STATUS_LABEL[status] || status}</span>
        </div>
        <div class="job-card-meta">${metaParts.join(' · ')}</div>
        <div class="job-card-actions">${actions.join('')}</div>
      </div>
    `;
  }

  function renderGroup(label, groupKey, jobs) {
    if (!jobs.length) return '';
    return `
      <div class="jobs-center-group" data-group="${groupKey}">
        <div class="jobs-center-group-label">
          <span class="jobs-center-group-dot"></span>
          <span>${label}</span>
          <span style="color:#bbb">· ${jobs.length}</span>
        </div>
        ${jobs.map(buildCard).join('')}
      </div>
    `;
  }

  function render(jobs) {
    const active = jobs.filter((j) => ACTIVE.has(j.status));
    const attention = jobs.filter((j) => ATTENTION.has(j.status));
    const terminal = jobs.filter((j) => TERMINAL.has(j.status));

    if (!active.length && !attention.length && !terminal.length) {
      section.classList.add('hidden');
      return;
    }
    section.classList.remove('hidden');

    bodyEl.innerHTML = [
      renderGroup('进行中', 'active', active),
      renderGroup('需要处理', 'attention', attention),
      renderGroup('最近完成', 'done', terminal),
    ].join('');

    if (clearBtn) {
      clearBtn.hidden = terminal.length === 0;
    }
  }

  async function refresh() {
    try {
      const jobs = await JOBS.list();
      render(jobs);
    } catch {}
  }

  // 冷却倒计时需要每秒刷一下，但只在当前有 paused_cooldown 任务时刷
  let tickTimer = null;
  function scheduleTick() {
    if (tickTimer) return;
    tickTimer = setInterval(async () => {
      const jobs = await JOBS.list();
      const hasCooldown = jobs.some((j) => j.status === STATUS.PAUSED_COOLDOWN && j.chunkCooldownUntil);
      if (!hasCooldown) {
        clearInterval(tickTimer);
        tickTimer = null;
        return;
      }
      // 只更新有 chunkCooldownUntil 的卡片的倒计时文案，避免整段 innerHTML 重渲染
      jobs.forEach((j) => {
        if (j.status !== STATUS.PAUSED_COOLDOWN || !j.chunkCooldownUntil) return;
        const card = bodyEl.querySelector(`.job-card[data-job="${j.id}"] .job-card-meta`);
        if (!card) return;
        // 只改第二段文案（冷却倒计时）
        const remain = formatCooldown(j.chunkCooldownUntil);
        const progress = `<span class="job-card-progress">${j.scraped || 0}/${j.total || 0}</span>`;
        const parts = [progress, `防封冷却 ${remain}`];
        if (j.errorCount > 0) parts.push(`${j.errorCount} 个错误`);
        card.innerHTML = parts.join(' · ');
      });
    }, 1000);
  }

  // ========== 事件委托 ==========

  bodyEl.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const jobId = btn.dataset.job;
    if (!jobId) return;

    const job = await JOBS.get(jobId);
    if (!job) return;

    if (action === 'open' || action === 'rerun') {
      if (job.profileUrl) openTab(job.profileUrl);
      return;
    }

    if (action === 'captcha') {
      const url = job.captchaUrl || 'https://www.xiaohongshu.com/';
      openTab(url);
      return;
    }

    if (action === 'resume') {
      // 打开博主主页，让 content script 重新加载，用户再点 "继续抓取"
      if (job.profileUrl) openTab(job.profileUrl);
      return;
    }

    if (action === 'analyze') {
      const url = chrome.runtime.getURL(`analysis/analysis.html?userId=${encodeURIComponent(job.userId || '')}`);
      openTab(url);
      return;
    }

    if (action === 'cancel') {
      // 发停止请求到对应的 XHS tab
      await requestStopForJob(job);
      return;
    }

    if (action === 'remove') {
      await JOBS.remove(jobId);
      return;
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      await JOBS.clearTerminal();
    });
  }

  function openTab(url) {
    try {
      chrome.tabs.create({ url });
    } catch {}
  }

  async function requestStopForJob(job) {
    if (!job.profileUrl) return;
    try {
      const tabs = await chrome.tabs.query({ url: `${job.profileUrl}*` });
      if (!tabs.length) {
        // 没找到 tab —— 用户大概率已经关了它；直接标记为 CANCELLED
        await JOBS.upsert({ id: job.id, status: JOBS.STATUS.CANCELLED });
        return;
      }
      // 向所有匹配 tab 广播 stopBatchScrape
      for (const tab of tabs) {
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'stopBatchScrape' });
        } catch {}
      }
    } catch {
      // 失败兜底：直接在 storage 里打 cancelled 标，避免卡住
      await JOBS.upsert({ id: job.id, status: JOBS.STATUS.CANCELLED });
    }
  }

  // ========== 生命周期 ==========

  JOBS.subscribe((list) => {
    render(list);
    if (list.some((j) => j.status === STATUS.PAUSED_COOLDOWN && j.chunkCooldownUntil)) {
      scheduleTick();
    }
  });

  // 初次加载
  refresh().then(() => {
    JOBS.list().then((list) => {
      if (list.some((j) => j.status === STATUS.PAUSED_COOLDOWN && j.chunkCooldownUntil)) {
        scheduleTick();
      }
    });
  });
})();
