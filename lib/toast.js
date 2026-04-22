// 统一轻提示组件 —— popup / sidepanel / analysis 复用。
// API: TOAST.show({ level, text, durationMs, action, id? }) → id
//      TOAST.dismiss(id)
// level: 'info' (默认) | 'ok' | 'warn' | 'error'
// error 默认不自动消失；其他 4s 后淡出。
// action: { label, onClick } 渲染为右侧按钮，点击后自动关闭。

const TOAST = {
  _seq: 0,
  _root: null,
  _active: new Map(),   // id → { el, timer }

  show({ level = 'info', text = '', durationMs, action, id } = {}) {
    if (!text) return null;
    this._ensureRoot();

    // 若指定 id 且已存在同 id 的 toast，更新其文案而不叠加
    if (id && this._active.has(id)) {
      this._updateExisting(id, { level, text, durationMs, action });
      return id;
    }

    const toastId = id || `t_${++this._seq}`;
    const el = document.createElement('div');
    el.className = `xhs-toast xhs-toast-${level}`;
    el.setAttribute('role', level === 'error' ? 'alert' : 'status');

    const icon = { info: 'ℹ', ok: '✓', warn: '!', error: '×' }[level] || 'ℹ';
    const safeText = this._escape(text);

    const actionHtml = action?.label
      ? `<button type="button" class="xhs-toast-action">${this._escape(action.label)}</button>`
      : '';

    el.innerHTML = `
      <span class="xhs-toast-icon">${icon}</span>
      <span class="xhs-toast-text">${safeText}</span>
      ${actionHtml}
      <button type="button" class="xhs-toast-close" aria-label="关闭">×</button>
    `;

    el.querySelector('.xhs-toast-close').addEventListener('click', () => this.dismiss(toastId));
    if (action?.onClick) {
      el.querySelector('.xhs-toast-action').addEventListener('click', () => {
        try { action.onClick(); } catch {}
        this.dismiss(toastId);
      });
    }

    this._root.appendChild(el);
    // 触发 enter 动画
    requestAnimationFrame(() => el.classList.add('xhs-toast-show'));

    const finalDuration = durationMs != null ? durationMs : (level === 'error' ? 0 : 4000);
    const record = { el, timer: null };
    if (finalDuration > 0) {
      record.timer = setTimeout(() => this.dismiss(toastId), finalDuration);
    }
    this._active.set(toastId, record);
    return toastId;
  },

  dismiss(id) {
    const record = this._active.get(id);
    if (!record) return;
    if (record.timer) clearTimeout(record.timer);
    record.el.classList.remove('xhs-toast-show');
    record.el.classList.add('xhs-toast-hide');
    setTimeout(() => {
      try { record.el.remove(); } catch {}
      this._active.delete(id);
    }, 200);
  },

  dismissAll() {
    for (const id of Array.from(this._active.keys())) this.dismiss(id);
  },

  _updateExisting(id, { level, text, durationMs, action }) {
    const { el, timer } = this._active.get(id);
    if (timer) clearTimeout(timer);
    el.className = `xhs-toast xhs-toast-${level} xhs-toast-show`;
    const textEl = el.querySelector('.xhs-toast-text');
    if (textEl) textEl.textContent = text;

    const oldAction = el.querySelector('.xhs-toast-action');
    if (oldAction) oldAction.remove();
    if (action?.label) {
      const actionEl = document.createElement('button');
      actionEl.type = 'button';
      actionEl.className = 'xhs-toast-action';
      actionEl.textContent = action.label;
      actionEl.addEventListener('click', () => {
        try { action.onClick?.(); } catch {}
        this.dismiss(id);
      });
      el.querySelector('.xhs-toast-close').before(actionEl);
    }

    const finalDuration = durationMs != null ? durationMs : (level === 'error' ? 0 : 4000);
    const record = this._active.get(id);
    record.timer = finalDuration > 0 ? setTimeout(() => this.dismiss(id), finalDuration) : null;
  },

  _ensureRoot() {
    if (this._root && document.body.contains(this._root)) return;
    let root = document.getElementById('xhs-toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'xhs-toast-root';
      root.className = 'xhs-toast-root';
      document.body.appendChild(root);
    }
    this._root = root;
  },

  _escape(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },
};

if (typeof window !== 'undefined') {
  window.TOAST = TOAST;
}
