// Mixpanel 埋点封装 — MV3 原生 HTTP API
// 同时适配 service worker / popup / analysis tab / content script（经 background 中转）
//
// 配置：将下方 TOKEN 替换为 Mixpanel Project Token
// 空 TOKEN 时全部 track/flush 静默跳过，扩展正常运行
//
// 事件属性自动附带：distinct_id, $insert_id, time, session_id, ext_version, tier, language

const ANALYTICS = {
  TOKEN: '9fc73fa5bde8c140a7d52b840a97c347',  // Mixpanel Project Token
  ENDPOINT: 'https://api.mixpanel.com/track',

  QUEUE_KEY: 'analytics_queue',
  CLIENT_ID_KEY: 'analytics_client_id',
  OPT_OUT_KEY: 'analytics_opt_out',

  MAX_QUEUE: 50,
  FLUSH_THRESHOLD: 5,
  FLUSH_DEBOUNCE_MS: 30000,

  queue: [],
  sessionId: null,
  _flushTimer: null,
  _initialized: false,

  // ========== 生命周期 ==========

  async init() {
    if (this._initialized) return;
    this._initialized = true;
    this.sessionId = this._genId();
    try {
      const data = await chrome.storage.local.get(this.QUEUE_KEY);
      if (Array.isArray(data[this.QUEUE_KEY]) && data[this.QUEUE_KEY].length > 0) {
        this.queue = data[this.QUEUE_KEY];
        // 进程重启后尝试续发上次未成功的批次
        this.flush();
      }
    } catch {}
  },

  _genId() {
    try {
      return crypto.randomUUID();
    } catch {
      return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 10);
    }
  },

  async getDistinctId() {
    const data = await chrome.storage.local.get(this.CLIENT_ID_KEY);
    if (data[this.CLIENT_ID_KEY]) return data[this.CLIENT_ID_KEY];
    const id = this._genId();
    await chrome.storage.local.set({ [this.CLIENT_ID_KEY]: id });
    return id;
  },

  async isOptedOut() {
    const data = await chrome.storage.local.get(this.OPT_OUT_KEY);
    return data[this.OPT_OUT_KEY] === true;
  },

  async setOptOut(optOut) {
    await chrome.storage.local.set({ [this.OPT_OUT_KEY]: !!optOut });
    if (optOut) {
      this.queue = [];
      try { await chrome.storage.local.remove(this.QUEUE_KEY); } catch {}
    }
  },

  async _getTier() {
    try {
      if (typeof LICENSE !== 'undefined' && LICENSE.getInfo) {
        const info = await LICENSE.getInfo();
        return info.tier || 'free';
      }
    } catch {}
    return 'unknown';
  },

  // ========== 上报入口 ==========

  async track(eventName, props = {}) {
    if (!this.TOKEN) return;                // 未配置 token，静默跳过
    try {
      if (await this.isOptedOut()) return;
      await this.init();

      let lang = 'unknown';
      try { lang = (typeof navigator !== 'undefined' && navigator.language) || 'unknown'; } catch {}

      const event = {
        event: eventName,
        properties: {
          token: this.TOKEN,
          distinct_id: await this.getDistinctId(),
          $insert_id: this._genId(),
          time: Math.floor(Date.now() / 1000),
          session_id: this.sessionId,
          ext_version: chrome.runtime.getManifest().version,
          tier: await this._getTier(),
          language: lang,
          ...props,
        },
      };
      this.queue.push(event);

      if (this.queue.length >= this.FLUSH_THRESHOLD) {
        this.flush();
      } else {
        this._scheduleFlush();
      }
    } catch {
      // 埋点失败绝不影响业务逻辑
    }
  },

  _scheduleFlush() {
    if (this._flushTimer) return;
    this._flushTimer = setTimeout(() => {
      this._flushTimer = null;
      this.flush();
    }, this.FLUSH_DEBOUNCE_MS);
  },

  async flush() {
    if (!this.TOKEN) return;
    if (this.queue.length === 0) return;
    if (this._flushTimer) {
      clearTimeout(this._flushTimer);
      this._flushTimer = null;
    }
    const batch = this.queue.splice(0);
    try {
      const resp = await fetch(this.ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        keepalive: true,
      });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      try { await chrome.storage.local.remove(this.QUEUE_KEY); } catch {}
    } catch {
      // 失败：重新入队，限制条数避免无限膨胀
      this.queue = [...batch, ...this.queue].slice(0, this.MAX_QUEUE);
      try {
        await chrome.storage.local.set({ [this.QUEUE_KEY]: this.queue });
      } catch {}
    }
  },

  // ========== Content Script 转发入口 ==========
  // content script 里调用 ANALYTICS.trackViaBackground(...)，由 background 上报

  trackViaBackground(eventName, props = {}) {
    try {
      chrome.runtime.sendMessage({ action: 'analytics_track', eventName, props });
    } catch {}
  },
};

// 浏览器 window 环境（popup / analysis tab）自动初始化 + 页面卸载时刷新
if (typeof window !== 'undefined') {
  ANALYTICS.init();
  window.addEventListener('beforeunload', () => {
    // keepalive fetch 在页面卸载时仍能完成请求
    if (ANALYTICS.queue.length > 0 && ANALYTICS.TOKEN) {
      try {
        fetch(ANALYTICS.ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(ANALYTICS.queue),
          keepalive: true,
        });
        ANALYTICS.queue = [];
        chrome.storage.local.remove(ANALYTICS.QUEUE_KEY);
      } catch {}
    }
  });
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') ANALYTICS.flush();
    });
  }
}
