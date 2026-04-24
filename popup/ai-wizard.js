// AI 配置向导 —— 4 步 modal：欢迎 → 选厂商 → 填 Key → 测试/完成
// 依赖：AI_CATALOG, AI_SERVICE, ONBOARDING
// 宿主：popup / sidepanel / analysis 均可挂载；调用 AI_WIZARD.open()

(function () {
  const ONBOARD_KEY = 'ai_wizard';

  const state = {
    step: 0,                // 0..3
    provider: 'deepseek',
    apiKey: '',
    testing: false,
    testResult: null,       // { ok: boolean, message, detail?, errorKind? }
    onComplete: null,
    root: null,
    overlay: null,
  };

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function ensureRoot() {
    if (state.root) return state.root;
    let root = document.getElementById('ai-wizard-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'ai-wizard-root';
      document.body.appendChild(root);
    }
    state.root = root;
    return root;
  }

  async function open(options = {}) {
    if (typeof AI_CATALOG === 'undefined' || typeof AI_SERVICE === 'undefined') return;
    state.step = 0;
    state.provider = options.provider || (await currentProvider()) || 'deepseek';
    state.apiKey = '';
    state.testing = false;
    state.testResult = null;
    state.onComplete = typeof options.onComplete === 'function' ? options.onComplete : null;
    mount();
  }

  function close({ completed = false } = {}) {
    if (state.overlay) {
      state.overlay.remove();
      state.overlay = null;
    }
    if (typeof ONBOARDING !== 'undefined') {
      // 无论完成还是跳过都标记为 done，不再自动弹
      ONBOARDING.markDone(ONBOARD_KEY).catch(() => {});
    }
    if (completed && state.onComplete) {
      try { state.onComplete(); } catch {}
    }
  }

  async function currentProvider() {
    try {
      const data = await chrome.storage.local.get('aiConfig');
      return data?.aiConfig?.provider || null;
    } catch {
      return null;
    }
  }

  function mount() {
    const root = ensureRoot();
    root.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'ai-wizard-overlay';
    overlay.innerHTML = renderModal();
    root.appendChild(overlay);
    state.overlay = overlay;
    attachEvents(overlay);

    // 第 4 步自动发起测试
    if (state.step === 3 && !state.testing && !state.testResult) {
      runTest();
    }
  }

  function renderModal() {
    return `
      <div class="ai-wizard-modal" role="dialog" aria-modal="true">
        <div class="ai-wizard-header">
          <div class="ai-wizard-steps">
            ${[0, 1, 2, 3].map((i) => {
              const cls = i === state.step ? 'active' : (i < state.step ? 'done' : '');
              return `<span class="ai-wizard-dot ${cls}"></span>`;
            }).join('')}
            <span>第 ${state.step + 1} / 4 步</span>
          </div>
          <button class="ai-wizard-close" data-action="close" title="关闭">×</button>
        </div>
        <div class="ai-wizard-body">${renderBody()}</div>
        <div class="ai-wizard-footer">${renderFooter()}</div>
      </div>
    `;
  }

  function renderBody() {
    if (state.step === 0) return renderStepWelcome();
    if (state.step === 1) return renderStepProvider();
    if (state.step === 2) return renderStepKey();
    if (state.step === 3) return renderStepTest();
    return '';
  }

  function renderStepWelcome() {
    return `
      <h3 class="ai-wizard-title">配置 AI，解锁账号分析能力</h3>
      <p class="ai-wizard-subtitle">
        Claw Studio 的 AI 功能由你自己的 API Key 驱动，<strong>插件不代付模型费用</strong>。
        配置一次即可解锁下面这些功能：
      </p>
      <div class="ai-wizard-bullet">自动生成账号分析报告（人设 / 选题 / 爆款拆解）</div>
      <div class="ai-wizard-bullet">针对博主数据的 Q&A 对话</div>
      <div class="ai-wizard-bullet">选题与封面灵感建议</div>
      <p class="ai-wizard-subtitle" style="margin-top:12px">
        整个配置约 30 秒；如果稍后再说，在 AI 设置区随时可以重新打开本向导。
      </p>
    `;
  }

  function renderStepProvider() {
    const providers = ['deepseek', 'openai', 'moonshot', 'zhipu', 'qwen', 'siliconflow', 'custom'];
    return `
      <h3 class="ai-wizard-title">选一个 AI 厂商</h3>
      <p class="ai-wizard-subtitle">所有厂商都是 OpenAI 兼容接口。国内用户推荐 DeepSeek（送额度、响应快）；有 ChatGPT Plus 的用户推荐 OpenAI（推理最强）。</p>
      <div class="ai-wizard-providers">
        ${providers.map(renderProviderCard).join('')}
      </div>
    `;
  }

  function renderProviderCard(providerId) {
    const p = AI_CATALOG.getProvider(providerId);
    if (!p) return '';
    const selected = state.provider === providerId ? 'selected' : '';
    const tagLabel = p.recommended ? AI_CATALOG.RECOMMENDED_LABEL[p.recommended] : '';
    const tagHtml = tagLabel
      ? `<span class="ai-wizard-provider-tag" data-tag="${p.recommended}">${tagLabel}</span>`
      : '';
    const signupHtml = p.signupUrl
      ? `<a class="ai-wizard-provider-link" href="${escapeHtml(p.signupUrl)}" target="_blank" rel="noreferrer" data-stop-propagation>去申请 Key →</a>`
      : '';
    return `
      <button type="button" class="ai-wizard-provider-card ${selected}" data-provider="${providerId}">
        ${tagHtml}
        <div class="ai-wizard-provider-name">${escapeHtml(p.name)}</div>
        <div class="ai-wizard-provider-tagline">${escapeHtml(p.tagline || '')}</div>
        ${signupHtml}
      </button>
    `;
  }

  function renderStepKey() {
    const p = AI_CATALOG.getProvider(state.provider);
    const placeholder = state.provider === 'custom' ? 'sk-... 或你的自建代理 token' : 'sk-...';
    const signupLink = p.signupUrl
      ? `<a href="${escapeHtml(p.signupUrl)}" target="_blank" rel="noreferrer">去 ${escapeHtml(p.name)} 控制台申请 →</a>`
      : '';
    const customUrlBlock = state.provider === 'custom'
      ? `
        <div class="ai-wizard-key-wrap" style="margin-top:10px">
          <input class="ai-wizard-key-input" id="ai-wizard-custom-url"
            placeholder="API 地址，例如 https://api.example.com"
            value="${escapeHtml(state.customBaseUrl || '')}">
          <div class="ai-wizard-key-hint">只有"自定义"厂商需要填。其他厂商已内置地址。</div>
        </div>`
      : '';
    return `
      <h3 class="ai-wizard-title">填入 ${escapeHtml(p.name)} 的 API Key</h3>
      <p class="ai-wizard-subtitle">Key 只保存在本地 chrome.storage，不会上传任何服务器。粘贴时会自动去除首尾空白。</p>
      <div class="ai-wizard-key-wrap">
        <input type="password" class="ai-wizard-key-input" id="ai-wizard-key-input"
          placeholder="${placeholder}" value="${escapeHtml(state.apiKey || '')}" autocomplete="off">
        <div class="ai-wizard-key-hint">${signupLink}</div>
        <div class="ai-wizard-key-error" id="ai-wizard-key-error" hidden></div>
      </div>
      ${customUrlBlock}
    `;
  }

  function renderStepTest() {
    if (state.testing) {
      return `
        <div class="ai-wizard-test-status">
          <div class="ai-wizard-spinner"></div>
          <div class="ai-wizard-test-msg">连通测试中…</div>
          <div class="ai-wizard-test-detail">${escapeHtml(AI_CATALOG.getChatCompletionsUrl(draftConfig()))}</div>
        </div>
      `;
    }
    if (!state.testResult) {
      return `<div class="ai-wizard-test-status"><div class="ai-wizard-spinner"></div></div>`;
    }
    if (state.testResult.ok) {
      const r = state.testResult;
      return `
        <div class="ai-wizard-test-status">
          <div class="ai-wizard-check">✓</div>
          <div class="ai-wizard-test-msg">AI 已就绪 — ${escapeHtml(r.providerName)} / ${escapeHtml(r.model || '')}</div>
          <div class="ai-wizard-test-detail">${escapeHtml(r.url || '')}</div>
        </div>
        <p class="ai-wizard-subtitle" style="margin-top:8px">
          Key 已保存在本地。下一步你可以直接在分析页点"生成分析报告"使用 AI 功能。
        </p>
      `;
    }
    return `
      <div class="ai-wizard-test-status">
        <div class="ai-wizard-cross">✕</div>
        <div class="ai-wizard-test-msg">连通失败</div>
        <div class="ai-wizard-test-detail">${escapeHtml(state.testResult.message || '')}</div>
      </div>
      <details class="ai-wizard-troubleshoot">
        <summary>常见错误对照</summary>
        <ul>
          <li><strong>401</strong> — Key 写错或已被撤销。回"上一步"重新粘贴。</li>
          <li><strong>403</strong> — Key 正确但没开通当前模型，到控制台开启对应模型权限。</li>
          <li><strong>404</strong> — Base URL 错了（尤其是自定义厂商），检查路径末尾是否多/少了 <code>/v1</code>。</li>
          <li><strong>429</strong> — 额度用完或触发频控，稍后再试。</li>
          <li><strong>网络错误 / failed to fetch</strong> — 可能是代理或 CORS 限制，换网或换厂商试试。</li>
        </ul>
      </details>
    `;
  }

  function renderFooter() {
    if (state.step === 0) {
      return `
        <button class="ai-wizard-btn ghost" data-action="close">跳过</button>
        <span class="spacer"></span>
        <button class="ai-wizard-btn primary" data-action="next">下一步</button>
      `;
    }
    if (state.step === 1) {
      return `
        <button class="ai-wizard-btn" data-action="prev">上一步</button>
        <button class="ai-wizard-btn ghost" data-action="close">跳过</button>
        <span class="spacer"></span>
        <button class="ai-wizard-btn primary" data-action="next">下一步</button>
      `;
    }
    if (state.step === 2) {
      return `
        <button class="ai-wizard-btn" data-action="prev">上一步</button>
        <span class="spacer"></span>
        <button class="ai-wizard-btn primary" data-action="next">测试连通</button>
      `;
    }
    if (state.step === 3) {
      if (state.testing) {
        return `
          <button class="ai-wizard-btn" data-action="prev" disabled>上一步</button>
          <span class="spacer"></span>
          <button class="ai-wizard-btn primary" disabled>测试中...</button>
        `;
      }
      if (state.testResult?.ok) {
        return `
          <span class="spacer"></span>
          <button class="ai-wizard-btn" data-action="close">关闭</button>
          <button class="ai-wizard-btn primary" data-action="finish">完成并开始使用</button>
        `;
      }
      return `
        <button class="ai-wizard-btn" data-action="prev">回去改 Key</button>
        <span class="spacer"></span>
        <button class="ai-wizard-btn primary" data-action="retry">再试一次</button>
      `;
    }
    return '';
  }

  function attachEvents(overlay) {
    overlay.addEventListener('click', (e) => {
      // 点遮罩（不在 modal 内）不关闭 —— 避免误触；只有显式点 × 才关
      const link = e.target.closest('[data-stop-propagation]');
      if (link) {
        e.stopPropagation();
        return;
      }
      const btn = e.target.closest('[data-action]');
      if (btn) handleAction(btn.dataset.action, e);
      const card = e.target.closest('[data-provider]');
      if (card) {
        state.provider = card.dataset.provider;
        rerender();
      }
    });

    const keyInput = overlay.querySelector('#ai-wizard-key-input');
    if (keyInput) {
      keyInput.addEventListener('input', (e) => {
        state.apiKey = e.target.value.trim();
        const err = overlay.querySelector('#ai-wizard-key-error');
        if (err) err.hidden = true;
      });
      keyInput.focus();
    }

    const urlInput = overlay.querySelector('#ai-wizard-custom-url');
    if (urlInput) {
      urlInput.addEventListener('input', (e) => {
        state.customBaseUrl = e.target.value.trim();
      });
    }

    // Esc 关闭
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') close({ completed: false });
    });
  }

  function handleAction(action, event) {
    if (action === 'close') return close({ completed: false });
    if (action === 'next') return goNext();
    if (action === 'prev') return goPrev();
    if (action === 'retry') return runTest();
    if (action === 'finish') {
      close({ completed: true });
      if (state.testResult?.ok && typeof window !== 'undefined') {
        // 同步更新宿主里的 AI 设置区 UI（如果存在）
        try { window.dispatchEvent(new CustomEvent('ai-wizard-complete')); } catch {}
      }
    }
  }

  function goPrev() {
    if (state.step > 0) {
      state.step -= 1;
      state.testResult = null;
      rerender();
    }
  }

  async function goNext() {
    if (state.step === 0) {
      state.step = 1;
      rerender();
      return;
    }
    if (state.step === 1) {
      if (!state.provider) return;
      state.step = 2;
      rerender();
      return;
    }
    if (state.step === 2) {
      // 校验 Key
      const err = state.overlay.querySelector('#ai-wizard-key-error');
      if (!state.apiKey || state.apiKey.length < 8) {
        if (err) {
          err.textContent = '请粘贴完整的 API Key（长度至少 8 个字符）';
          err.hidden = false;
        }
        return;
      }
      if (state.provider === 'custom' && !state.customBaseUrl) {
        if (err) {
          err.textContent = '自定义厂商需要填 API 地址';
          err.hidden = false;
        }
        return;
      }
      state.step = 3;
      rerender();
      // rerender 会自动触发 runTest（mount 末尾检测）
    }
  }

  function draftConfig() {
    return AI_CATALOG.normalizeConfig({
      provider: state.provider,
      model: AI_CATALOG.getDefaultModel(state.provider),
      customBaseUrl: state.customBaseUrl || '',
      customModel: '',
    });
  }

  async function runTest() {
    state.testing = true;
    state.testResult = null;
    rerender();
    try {
      const config = draftConfig();
      const result = await AI_SERVICE.testConnection(config, state.apiKey);
      state.testResult = {
        ok: true,
        providerName: AI_CATALOG.getProvider(state.provider).name,
        model: result.model,
        url: result.url,
      };
      // 成功 → 落盘 Key + config，复用现有存储
      await AI_SERVICE.setApiKey(state.apiKey, state.provider);
      await chrome.storage.local.set({ aiConfig: config });
    } catch (e) {
      state.testResult = {
        ok: false,
        message: e?.message || '未知错误',
      };
    } finally {
      state.testing = false;
      rerender();
    }
  }

  function rerender() {
    if (!state.overlay) return;
    state.overlay.innerHTML = renderModal();
    attachEvents(state.overlay);
    if (state.step === 3 && !state.testing && !state.testResult) {
      runTest();
    }
  }

  // 首次打开 popup 时是否应该自动弹出向导：没有任何 provider 的 Key，且没标记过 done
  async function shouldAutoOpen() {
    if (typeof AI_SERVICE === 'undefined' || typeof ONBOARDING === 'undefined') return false;
    const done = await ONBOARDING.isDone(ONBOARD_KEY).catch(() => false);
    if (done) return false;
    // 有任意一家已存 Key 就不再打扰
    const providers = ['deepseek', 'openai', 'moonshot', 'zhipu', 'qwen', 'siliconflow', 'custom'];
    for (const p of providers) {
      const key = await AI_SERVICE.getApiKey(p).catch(() => '');
      if (key) return false;
    }
    return true;
  }

  const api = { open, close, shouldAutoOpen, ONBOARD_KEY };
  if (typeof window !== 'undefined') window.AI_WIZARD = api;
})();
