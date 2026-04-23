// Shared job registry — 一次批量抓取任务的全生命周期记录
// 存储：chrome.storage.local.jobs_index
// 宿主：content script / popup / sidepanel / background（service worker）
// 设计原则：
//   - 所有写入都走 upsert，自动保留活动任务 + 最近 N 条已完成
//   - storage.onChanged 天然跨 context 推送，UI 只需订阅
//   - 不存 results（太大，已经在 batch_${userId} / blogger_${userId} 里了），只存轻量进度元数据

const JOBS = (function () {
  const STORAGE_KEY = 'jobs_index';
  const MAX_JOBS = 20;

  const STATUS = {
    RUNNING: 'running',
    PAUSED_COOLDOWN: 'paused_cooldown',
    CAPTCHA_WAIT: 'captcha_wait',
    RATE_LIMITED: 'rate_limited',
    DONE: 'done',
    FAILED: 'failed',
    CANCELLED: 'cancelled',
  };

  const ACTIVE = new Set([
    STATUS.RUNNING,
    STATUS.PAUSED_COOLDOWN,
    STATUS.CAPTCHA_WAIT,
    STATUS.RATE_LIMITED,
  ]);

  function isActive(status) {
    return ACTIVE.has(status);
  }

  async function _read() {
    try {
      const data = await chrome.storage.local.get(STORAGE_KEY);
      return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
    } catch {
      return [];
    }
  }

  async function _write(list) {
    // 淘汰策略：活动任务全保留；已结束任务按 endedAt 倒序，总数封顶 MAX_JOBS
    const active = list.filter((j) => isActive(j.status));
    const terminal = list
      .filter((j) => !isActive(j.status))
      .sort((a, b) => (b.endedAt || b.updatedAt || 0) - (a.endedAt || a.updatedAt || 0));
    const kept = [...active, ...terminal].slice(0, MAX_JOBS);
    try {
      await chrome.storage.local.set({ [STORAGE_KEY]: kept });
    } catch {}
    return kept;
  }

  async function list() {
    return _read();
  }

  async function get(id) {
    const jobs = await _read();
    return jobs.find((j) => j.id === id) || null;
  }

  async function upsert(patch) {
    if (!patch || !patch.id) throw new Error('JOBS.upsert: id required');
    const jobs = await _read();
    const now = Date.now();
    const idx = jobs.findIndex((j) => j.id === patch.id);

    if (idx >= 0) {
      const merged = { ...jobs[idx], ...patch, updatedAt: now };
      // 进入终态时自动打上 endedAt（如果调用方没传）
      if (!isActive(merged.status) && !merged.endedAt) {
        merged.endedAt = now;
      }
      // 从终态回到活动态（极少数场景，比如续传）时清掉 endedAt
      if (isActive(merged.status) && merged.endedAt) {
        delete merged.endedAt;
      }
      jobs[idx] = merged;
    } else {
      const created = {
        startedAt: now,
        updatedAt: now,
        scraped: 0,
        total: 0,
        errorCount: 0,
        status: STATUS.RUNNING,
        ...patch,
      };
      if (!isActive(created.status) && !created.endedAt) {
        created.endedAt = now;
      }
      jobs.unshift(created);
    }

    return _write(jobs);
  }

  async function remove(id) {
    const jobs = await _read();
    return _write(jobs.filter((j) => j.id !== id));
  }

  async function clearTerminal() {
    const jobs = await _read();
    return _write(jobs.filter((j) => isActive(j.status)));
  }

  function subscribe(cb) {
    if (!chrome?.storage?.onChanged) return () => {};
    const handler = (changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      const newList = Array.isArray(changes[STORAGE_KEY].newValue)
        ? changes[STORAGE_KEY].newValue
        : [];
      const oldList = Array.isArray(changes[STORAGE_KEY].oldValue)
        ? changes[STORAGE_KEY].oldValue
        : [];
      try {
        cb(newList, oldList);
      } catch {}
    };
    chrome.storage.onChanged.addListener(handler);
    return () => chrome.storage.onChanged.removeListener(handler);
  }

  function generateId() {
    return `job_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  const api = {
    STORAGE_KEY,
    STATUS,
    MAX_JOBS,
    isActive,
    list,
    get,
    upsert,
    remove,
    clearTerminal,
    subscribe,
    generateId,
  };

  if (typeof window !== 'undefined') window.JOBS = api;
  // service worker 宿主（background.js）
  if (typeof self !== 'undefined' && typeof window === 'undefined') {
    try { self.JOBS = api; } catch {}
  }
  return api;
})();
