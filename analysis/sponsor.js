// 作者推广位渲染与生命周期管理
// 两个槽位固定内容：bottom = 作者 GitHub；sidebar = 作者小红书博主名片
// 修改作者信息只需改下方 AUTHOR 常量

const AUTHOR = {
  github: {
    url: 'https://github.com/twonly/xhs-claw-studio',
    title: '红薯采集器开源项目',
    desc: '觉得有用？给个 Star 支持作者持续更新',
    cta: '前往 GitHub',
  },
  xhs: {
    url: 'https://www.xiaohongshu.com/user/profile/6467b1210000000010027a51',
    avatar: 'https://sns-avatar-qc.xhscdn.com/avatar/1040g2jo31o8l17085m005p37m4gk4uih3rl8sc8?imageView2/2/w/540/format/webp|imageMogr2/strip2',
    nickname: 'AI拯救打工人（大厂爆料版）',
    bio: '🔥 Vibe Working，Vibe Living\n🎯 AI工具实操，摸鱼技巧，翻车实录 🚗\n✅ AI产品经理，AI Agent落地\n💡 混迹3家500强，大厂内幕爆料',
    cta: '关注我的小红书',
  },
};

const SPONSOR = {
  DISMISS_KEY: 'sponsor_dismissed_until',
  OPTOUT_KEY: 'sponsor_opt_out',
  UNLOCK_KEY: AI_CATALOG.HIDDEN_PREFS_KEY,
  DISMISS_DAYS: 30,
  _rendered: false,
  _storageBound: false,

  async init() {
    document.querySelectorAll('.sponsor-dismiss').forEach(btn => {
      btn.addEventListener('click', (e) => this._onDismiss(e));
    });

    this._bindStorageListener();
    await this._syncVisibility();
  },

  async _isOptedOut() {
    try {
      const data = await chrome.storage.local.get(this.OPTOUT_KEY);
      return data[this.OPTOUT_KEY] === true;
    } catch { return false; }
  },

  async _isUnlocked() {
    try {
      const data = await chrome.storage.local.get(this.UNLOCK_KEY);
      return data[this.UNLOCK_KEY] === true;
    } catch { return false; }
  },

  _isDismissed() {
    try {
      const v = parseInt(localStorage.getItem(this.DISMISS_KEY) || '0', 10);
      return v > Date.now();
    } catch { return false; }
  },

  async _syncVisibility() {
    const unlocked = await this._isUnlocked();
    const optedOut = await this._isOptedOut();
    const dismissed = this._isDismissed();

    if (!unlocked || optedOut || dismissed) {
      this._rendered = false;
      this._hideAll();
      return;
    }

    if (this._rendered) {
      document.querySelectorAll('.sponsor-slot').forEach(el => el.removeAttribute('hidden'));
      return;
    }

    this._renderGitHubCard('bottom');
    this._renderXhsCard('sidebar');
    this._rendered = true;
  },

  _bindStorageListener() {
    if (this._storageBound) return;
    this._storageBound = true;
    try {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes[this.OPTOUT_KEY] || changes[this.UNLOCK_KEY]) {
          this._syncVisibility().catch(() => {});
        }
      });
    } catch {}
  },

  _hideAll() {
    document.querySelectorAll('.sponsor-slot').forEach(el => el.setAttribute('hidden', ''));
  },

  _renderGitHubCard(slotName) {
    const slotEl = document.getElementById(`sponsor-${slotName}`);
    const contentEl = document.getElementById(`sponsor-${slotName}-content`);
    if (!slotEl || !contentEl) return;
    const a = AUTHOR.github;

    contentEl.innerHTML = `
      <div class="gh-card">
        <div class="gh-header">
          <svg class="gh-icon" viewBox="0 0 16 16" aria-hidden="true">
            <path fill="#24292e" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
          </svg>
          <div class="gh-text">
            <div class="gh-title">${this._esc(a.title)}</div>
            <div class="gh-desc">${this._esc(a.desc)}</div>
          </div>
        </div>
        <a class="gh-cta" href="${this._esc(a.url)}" target="_blank" rel="noopener noreferrer"
           data-source="github">★ ${this._esc(a.cta)}</a>
      </div>
    `;
    slotEl.removeAttribute('hidden');
    this._track('sponsor_impression', { slot: slotName, kind: 'github' });
    contentEl.querySelector('.gh-cta')?.addEventListener('click', () => {
      this._track('sponsor_click', { slot: slotName, kind: 'github' });
    });
  },

  _renderXhsCard(slotName) {
    const slotEl = document.getElementById(`sponsor-${slotName}`);
    const contentEl = document.getElementById(`sponsor-${slotName}-content`);
    if (!slotEl || !contentEl) return;
    const a = AUTHOR.xhs;

    contentEl.innerHTML = `
      <div class="xhs-card">
        <img class="xhs-avatar" src="${this._esc(a.avatar)}" alt="${this._esc(a.nickname)}"
             referrerpolicy="no-referrer" onerror="this.style.display='none'">
        <div class="xhs-nickname">${this._esc(a.nickname)}</div>
        <div class="xhs-bio">${this._esc(a.bio)}</div>
        <a class="xhs-cta" href="${this._esc(a.url)}" target="_blank" rel="noopener noreferrer"
           data-source="xhs">${this._esc(a.cta)}</a>
      </div>
    `;
    slotEl.removeAttribute('hidden');
    this._track('sponsor_impression', { slot: slotName, kind: 'xhs' });
    contentEl.querySelector('.xhs-cta')?.addEventListener('click', () => {
      this._track('sponsor_click', { slot: slotName, kind: 'xhs' });
    });
  },

  _onDismiss(e) {
    try {
      localStorage.setItem(
        this.DISMISS_KEY,
        String(Date.now() + this.DISMISS_DAYS * 86400 * 1000)
      );
    } catch {}
    this._hideAll();
    this._rendered = false;
    this._track('sponsor_dismiss', { slot: e.currentTarget.dataset.slot });
  },

  _track(event, props) {
    try {
      if (typeof ANALYTICS !== 'undefined') ANALYTICS.track(event, props);
    } catch {}
  },

  _esc(s) {
    const div = document.createElement('div');
    div.textContent = String(s ?? '');
    return div.innerHTML;
  },
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => SPONSOR.init());
} else {
  SPONSOR.init();
}
