// 抓取错误分类器 —— 给 note-scraper 的批量循环判断该重试 / 跳过 / 硬停
// 无副作用，不依赖 chrome.* API，可在 content script 与 popup 共用。

const ERROR_CLASSIFIER = {
  KINDS: {
    CAPTCHA: 'captcha',         // 人机验证拦截，需用户手动处理
    RATE_LIMIT: 'rate_limit',   // 429/503 等，应退避重试
    RESTRICTED: 'restricted',   // 403 或账号/笔记被风控，硬停
    NOT_FOUND: 'not_found',     // 笔记删除/私密，跳过即可
    NETWORK: 'network',         // fetch reject，短退避
    FATAL: 'fatal',             // 其他未分类错误
  },

  // 每类的重试计划（ms）。空数组表示不重试。
  // 后续调用 waitMsFor 会在基础值上叠加 ±20% 抖动。
  _SCHEDULE: {
    rate_limit: [30_000, 60_000, 120_000],
    network: [15_000, 30_000],
    captcha: [],
    restricted: [],
    not_found: [],
    fatal: [],
  },

  // 根据请求 / HTML / 抛出的 error 给出分类结论
  // 入参：{ resp?: Response-like, html?: string, error?: Error }
  // resp-like 对象只需有 status / redirected / url 字段
  classify({ resp, html, error } = {}) {
    // 1. fetch reject（无 resp，只有 error）
    if (!resp && error) {
      const msg = String(error?.message || '').toLowerCase();
      // ai-service 里已经处理过的编码异常单独归类到 fatal，避免空转重试
      if (/non iso-8859-1|invalid/.test(msg) && /key|header/.test(msg)) {
        return this._make('fatal', error.message, 'fetch_encoding_err');
      }
      return this._make('network', '网络异常，正在重试…', 'network_' + (msg.slice(0, 24) || 'unknown'));
    }

    // 2. 302 → 人机验证
    if (resp?.redirected && typeof resp.url === 'string' && resp.url.includes('/website-login/captcha')) {
      const v = this._make('captcha', '需要人机验证', 'captcha_302');
      v.captchaUrl = resp.url;
      return v;
    }

    // 3. HTML 兜底验证页（某些情况未 302 而是直接返回验证页）
    if (typeof html === 'string' && html.includes('/website-login/captcha') && html.includes('verifyUuid')) {
      const m = html.match(/https?:\/\/[^"'\s]*\/website-login\/captcha[^"'\s]*/);
      const v = this._make('captcha', '需要人机验证', 'captcha_html');
      v.captchaUrl = m ? m[0] : 'https://www.xiaohongshu.com/';
      return v;
    }

    // 4. HTTP 状态码
    if (resp && typeof resp.status === 'number') {
      const s = resp.status;
      if (s === 429) return this._make('rate_limit', '请求过于频繁，正在自动放缓…', 'http_429');
      if (s === 503 || s === 502 || s === 504) return this._make('rate_limit', '小红书网关暂不可用，稍候重试…', 'http_' + s);
      if (s === 403) return this._make('restricted', '访问被拒绝，IP 或账号可能已被风控', 'http_403');
      if (s === 401) return this._make('restricted', '未登录或登录已过期，请重新登录后重试', 'http_401');
      if (s === 404) return this._make('not_found', '笔记不存在或已删除', 'http_404');
      if (s >= 400 && s < 500) return this._make('fatal', `请求失败 (HTTP ${s})`, 'http_' + s);
      if (s >= 500) return this._make('rate_limit', `服务端错误 (HTTP ${s})，稍候重试…`, 'http_' + s);
    }

    // 5. HTML 里的限制关键字
    if (typeof html === 'string') {
      if (html.includes('当前笔记暂时无法浏览')) {
        return this._make('not_found', '笔记暂时无法浏览', 'html_note_unavailable');
      }
      if (html.includes('请打开小红书App扫码查看')) {
        return this._make('restricted', '笔记被限制访问', 'html_app_only');
      }
    }

    // 6. error.message 兜底分类
    if (error) {
      const m = String(error.message || '');
      if (/CAPTCHA_REQUIRED/i.test(m)) return this._make('captcha', '需要人机验证', 'captcha_err');
      if (/HTTP 4\d{2}/i.test(m)) return this._make('fatal', m, 'http_err_4xx');
      if (/HTTP 5\d{2}/i.test(m)) return this._make('rate_limit', m, 'http_err_5xx');
      return this._make('fatal', m || '未知错误', 'fatal_' + (m.slice(0, 24) || 'unknown'));
    }

    return this._make('fatal', '未知错误', 'fatal_unclassified');
  },

  retryScheduleFor(kind) {
    return this._SCHEDULE[kind] || [];
  },

  maxAttemptsFor(kind) {
    return this.retryScheduleFor(kind).length;
  },

  // attempt 从 1 开始计数；超出 schedule 返回 0（表示不再重试）
  waitMsFor(kind, attempt) {
    const schedule = this.retryScheduleFor(kind);
    const base = schedule[attempt - 1];
    if (!base) return 0;
    const jitter = 0.8 + Math.random() * 0.4; // 0.8 ~ 1.2
    return Math.round(base * jitter);
  },

  _make(kind, userMessage, analyticsTag) {
    return {
      kind,
      userMessage: userMessage || '',
      analyticsTag: analyticsTag || kind,
      retryable: this.maxAttemptsFor(kind) > 0,
    };
  },
};

if (typeof window !== 'undefined') {
  window.ERROR_CLASSIFIER = ERROR_CLASSIFIER;
}
