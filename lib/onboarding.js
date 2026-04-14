// 新用户引导 - 可复用的蒙版 + 聚光灯 + 气泡提示
// 使用方式：ONBOARDING.start({ key: 'popup', steps: [...], compact: true })

const ONBOARDING = {
  _state: null,
  _resizeHandler: null,
  _scrollHandler: null,

  // 判断某个 key 的引导是否已完成（Promise<boolean>）
  async isDone(key) {
    try {
      const storageKey = `_onboardDone_${key}`;
      const data = await chrome.storage.local.get(storageKey);
      return !!data[storageKey];
    } catch (e) {
      return false;
    }
  },

  async markDone(key) {
    try {
      await chrome.storage.local.set({ [`_onboardDone_${key}`]: true });
    } catch (e) { /* ignore */ }
  },

  async reset(key) {
    try {
      await chrome.storage.local.remove(`_onboardDone_${key}`);
    } catch (e) { /* ignore */ }
  },

  // 自动启动：未完成时才跑
  async autoStart(options) {
    if (await this.isDone(options.key)) return false;
    this.start(options);
    return true;
  },

  // steps: [{ selector, title, content, position: 'auto'|'top'|'bottom'|'left'|'right', padding }]
  start(options) {
    if (this._state) this._destroy();

    const steps = (options.steps || []).filter(Boolean);
    if (!steps.length) return;

    this._state = {
      key: options.key,
      steps,
      index: 0,
      compact: !!options.compact,
      onComplete: options.onComplete || null,
    };

    if (options.compact) document.body.classList.add('onb-compact');

    // 构建 DOM
    const backdrop = document.createElement('div');
    backdrop.className = 'onb-backdrop';
    backdrop.addEventListener('click', () => { /* 吞掉点击，防止穿透 */ });
    document.body.appendChild(backdrop);

    const spotlight = document.createElement('div');
    spotlight.className = 'onb-spotlight onb-fullscreen';
    document.body.appendChild(spotlight);

    const tooltip = document.createElement('div');
    tooltip.className = 'onb-tooltip';
    tooltip.innerHTML = `
      <div class="onb-tooltip-arrow top"></div>
      <div class="onb-tooltip-head">
        <span class="onb-tooltip-title"></span>
        <span class="onb-tooltip-step"></span>
      </div>
      <div class="onb-tooltip-body"></div>
      <div class="onb-tooltip-foot">
        <button type="button" class="onb-tooltip-skip">跳过引导</button>
        <div class="onb-tooltip-actions">
          <button type="button" class="onb-btn onb-btn-ghost onb-btn-prev">上一步</button>
          <button type="button" class="onb-btn onb-btn-primary onb-btn-next">下一步</button>
        </div>
      </div>
    `;
    document.body.appendChild(tooltip);

    this._state.backdrop = backdrop;
    this._state.spotlight = spotlight;
    this._state.tooltip = tooltip;

    // 绑定事件
    tooltip.querySelector('.onb-tooltip-skip').addEventListener('click', () => this._skip());
    tooltip.querySelector('.onb-btn-prev').addEventListener('click', () => this._prev());
    tooltip.querySelector('.onb-btn-next').addEventListener('click', () => this._next());

    // resize/scroll 时重新定位当前步
    this._resizeHandler = () => this._renderStep();
    this._scrollHandler = () => this._renderStep();
    window.addEventListener('resize', this._resizeHandler);
    window.addEventListener('scroll', this._scrollHandler, true);

    this._renderStep();
  },

  _renderStep() {
    const s = this._state;
    if (!s) return;
    const step = s.steps[s.index];
    if (!step) return;

    const tooltip = s.tooltip;
    const spotlight = s.spotlight;

    tooltip.querySelector('.onb-tooltip-title').textContent = step.title || '';
    tooltip.querySelector('.onb-tooltip-body').innerHTML = step.content || '';
    tooltip.querySelector('.onb-tooltip-step').textContent = `${s.index + 1} / ${s.steps.length}`;

    const prevBtn = tooltip.querySelector('.onb-btn-prev');
    const nextBtn = tooltip.querySelector('.onb-btn-next');
    prevBtn.style.visibility = s.index === 0 ? 'hidden' : 'visible';
    nextBtn.textContent = s.index === s.steps.length - 1 ? '完成' : '下一步';

    // 查找目标元素
    const target = step.selector ? document.querySelector(step.selector) : null;

    if (!target || !this._isVisible(target)) {
      // 没有目标 → 整屏蒙版 + 居中气泡
      spotlight.classList.add('onb-fullscreen');
      spotlight.style.left = '-20px';
      spotlight.style.top = '-20px';
      spotlight.style.width = '0';
      spotlight.style.height = '0';
      this._positionTooltipCenter();
      this._setArrow('none');
      return;
    }

    // 滚动到可见
    try {
      target.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'nearest' });
    } catch (e) {
      target.scrollIntoView();
    }

    const rect = target.getBoundingClientRect();
    const padding = step.padding != null ? step.padding : 6;

    spotlight.classList.remove('onb-fullscreen');
    spotlight.style.left = `${rect.left - padding}px`;
    spotlight.style.top = `${rect.top - padding}px`;
    spotlight.style.width = `${rect.width + padding * 2}px`;
    spotlight.style.height = `${rect.height + padding * 2}px`;

    this._positionTooltipNear(rect, step.position || 'auto');
  },

  _isVisible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  },

  _positionTooltipCenter() {
    const tooltip = this._state.tooltip;
    const vw = window.innerWidth, vh = window.innerHeight;
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    tooltip.style.left = `${Math.max(12, (vw - tw) / 2)}px`;
    tooltip.style.top = `${Math.max(12, (vh - th) / 2)}px`;
  },

  _positionTooltipNear(rect, position) {
    const tooltip = this._state.tooltip;
    const vw = window.innerWidth, vh = window.innerHeight;
    const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
    const gap = 14;

    // auto: 选可用空间最大的一侧
    let pos = position;
    if (pos === 'auto') {
      const spaceBelow = vh - rect.bottom;
      const spaceAbove = rect.top;
      const spaceRight = vw - rect.right;
      const spaceLeft = rect.left;
      const max = Math.max(spaceBelow, spaceAbove, spaceRight, spaceLeft);
      if (max === spaceBelow) pos = 'bottom';
      else if (max === spaceAbove) pos = 'top';
      else if (max === spaceRight) pos = 'right';
      else pos = 'left';
    }

    let left, top;
    if (pos === 'bottom') {
      top = rect.bottom + gap;
      left = rect.left + rect.width / 2 - 30;
    } else if (pos === 'top') {
      top = rect.top - th - gap;
      left = rect.left + rect.width / 2 - 30;
    } else if (pos === 'right') {
      left = rect.right + gap;
      top = rect.top + rect.height / 2 - 24;
    } else { // left
      left = rect.left - tw - gap;
      top = rect.top + rect.height / 2 - 24;
    }

    // 边界约束
    left = Math.max(12, Math.min(left, vw - tw - 12));
    top = Math.max(12, Math.min(top, vh - th - 12));

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
    this._setArrow(pos);
  },

  _setArrow(pos) {
    const arrow = this._state.tooltip.querySelector('.onb-tooltip-arrow');
    arrow.classList.remove('top', 'bottom', 'left', 'right');
    if (pos === 'none') { arrow.style.display = 'none'; return; }
    arrow.style.display = 'block';
    // 气泡在目标的下面时，箭头朝上(top)；以此类推
    if (pos === 'bottom') arrow.classList.add('top');
    else if (pos === 'top') arrow.classList.add('bottom');
    else if (pos === 'right') arrow.classList.add('left');
    else arrow.classList.add('right');
  },

  _prev() {
    if (!this._state) return;
    if (this._state.index > 0) {
      this._state.index--;
      this._renderStep();
    }
  },

  _next() {
    if (!this._state) return;
    const s = this._state;
    if (s.index < s.steps.length - 1) {
      s.index++;
      this._renderStep();
    } else {
      this._finish();
    }
  },

  _skip() {
    if (!this._state) return;
    const key = this._state.key;
    this.markDone(key);
    const cb = this._state.onComplete;
    this._destroy();
    if (cb) cb({ skipped: true });
  },

  _finish() {
    if (!this._state) return;
    const key = this._state.key;
    this.markDone(key);
    const cb = this._state.onComplete;
    this._destroy();
    if (cb) cb({ skipped: false });
  },

  _destroy() {
    const s = this._state;
    if (!s) return;
    try { s.backdrop.remove(); } catch (e) {}
    try { s.spotlight.remove(); } catch (e) {}
    try { s.tooltip.remove(); } catch (e) {}
    if (this._resizeHandler) window.removeEventListener('resize', this._resizeHandler);
    if (this._scrollHandler) window.removeEventListener('scroll', this._scrollHandler, true);
    if (s.compact) document.body.classList.remove('onb-compact');
    this._state = null;
  },

  // 可选：挂一个右下角的问号按钮，点击重新开始引导
  attachHelpTrigger(options) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'onb-help-trigger';
    btn.title = '重新查看新手引导';
    btn.textContent = '?';
    btn.addEventListener('click', async () => {
      await this.reset(options.key);
      this.start(options);
    });
    document.body.appendChild(btn);
    return btn;
  },
};
