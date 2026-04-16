// 统一 AI 厂商目录。
// 目标：
// 1. popup 与分析页共用一套厂商/模型定义，避免各自硬编码后漂移。
// 2. 给不同厂商保留各自 endpoint / 参数兼容差异。
// 3. 推荐模型列表是便捷入口，自定义模型名始终可覆盖。

const AI_CATALOG = {
  DEFAULT_CONFIG: {
    provider: 'deepseek',
    model: 'deepseek-chat',
    customBaseUrl: '',
    customModel: '',
  },

  HIDDEN_PREFS_KEY: 'hidden_prefs_revealed',

  PROVIDERS: {
    deepseek: {
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      chatPath: '/v1/chat/completions',
      defaultModel: 'deepseek-chat',
      docsUrl: 'https://api-docs.deepseek.com/zh-cn/guides/reasoning_model',
      models: [
        { id: 'deepseek-chat', label: 'deepseek-chat' },
        { id: 'deepseek-reasoner', label: 'deepseek-reasoner' },
      ],
      customModelPlaceholder: '例如 deepseek-chat',
    },
    openai: {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com',
      chatPath: '/v1/chat/completions',
      defaultModel: 'gpt-5.2',
      docsUrl: 'https://platform.openai.com/docs/guides/latest-model',
      models: [
        { id: 'gpt-5.2', label: 'gpt-5.2' },
        { id: 'gpt-5-mini', label: 'gpt-5-mini' },
        { id: 'gpt-5-nano', label: 'gpt-5-nano' },
        { id: 'gpt-4.1', label: 'gpt-4.1' },
        { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
        { id: 'gpt-4.1-nano', label: 'gpt-4.1-nano' },
        { id: 'o4-mini', label: 'o4-mini' },
      ],
      customModelPlaceholder: '例如 gpt-5.2 或 gpt-4.1',
    },
    moonshot: {
      name: 'Moonshot',
      baseUrl: 'https://api.moonshot.cn',
      chatPath: '/v1/chat/completions',
      defaultModel: 'kimi-k2.5',
      docsUrl: 'https://platform.moonshot.cn/docs/guide/kimi-k2-5-quickstart',
      models: [
        { id: 'kimi-k2.5', label: 'kimi-k2.5' },
        { id: 'kimi-k2-0905-preview', label: 'kimi-k2-0905-preview' },
        { id: 'kimi-k2-turbo-preview', label: 'kimi-k2-turbo-preview' },
        { id: 'kimi-thinking-preview', label: 'kimi-thinking-preview' },
      ],
      customModelPlaceholder: '例如 kimi-k2.5',
    },
    zhipu: {
      name: '智谱 GLM',
      baseUrl: 'https://open.bigmodel.cn/api/paas',
      chatPath: '/v4/chat/completions',
      defaultModel: 'glm-5.1',
      docsUrl: 'https://docs.bigmodel.cn/api-reference',
      models: [
        { id: 'glm-5.1', label: 'glm-5.1' },
        { id: 'glm-5', label: 'glm-5' },
        { id: 'glm-4.7', label: 'glm-4.7' },
        { id: 'glm-4.5-air', label: 'glm-4.5-air' },
      ],
      customModelPlaceholder: '例如 glm-5.1',
    },
    qwen: {
      name: '通义千问',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
      chatPath: '/v1/chat/completions',
      defaultModel: 'qwen3.6-plus',
      docsUrl: 'https://help.aliyun.com/zh/model-studio/newly-released-models',
      models: [
        { id: 'qwen3.6-plus', label: 'qwen3.6-plus' },
        { id: 'qwen3-max-2026-01-23', label: 'qwen3-max-2026-01-23' },
        { id: 'qwen3-coder-plus', label: 'qwen3-coder-plus' },
        { id: 'qwen-plus-latest', label: 'qwen-plus-latest' },
        { id: 'qwen-turbo-latest', label: 'qwen-turbo-latest' },
      ],
      customModelPlaceholder: '例如 qwen3.6-plus',
    },
    siliconflow: {
      name: 'SiliconFlow',
      baseUrl: 'https://api.siliconflow.cn',
      chatPath: '/v1/chat/completions',
      defaultModel: 'deepseek-ai/DeepSeek-V3.2',
      docsUrl: 'https://docs.siliconflow.com/en/api-reference/models/get-model-list',
      models: [
        { id: 'deepseek-ai/DeepSeek-V3.2', label: 'deepseek-ai/DeepSeek-V3.2' },
        { id: 'deepseek-ai/DeepSeek-R1', label: 'deepseek-ai/DeepSeek-R1' },
        { id: 'deepseek-ai/DeepSeek-V3', label: 'deepseek-ai/DeepSeek-V3' },
        { id: 'Qwen/Qwen3-32B', label: 'Qwen/Qwen3-32B' },
        { id: 'Qwen/Qwen3-14B', label: 'Qwen/Qwen3-14B' },
        { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen/Qwen2.5-72B-Instruct' },
      ],
      customModelPlaceholder: '例如 deepseek-ai/DeepSeek-V3.2',
    },
    custom: {
      name: '自定义',
      baseUrl: '',
      chatPath: '/v1/chat/completions',
      defaultModel: '',
      docsUrl: '',
      models: [],
      customModelPlaceholder: '例如 claude-sonnet-4-5 或任意兼容模型',
    },
  },

  getProvider(provider) {
    return this.PROVIDERS[provider] || this.PROVIDERS.deepseek;
  },

  getDefaultModel(provider) {
    const info = this.getProvider(provider);
    return info.defaultModel || info.models?.[0]?.id || '';
  },

  getRecommendedModels(provider) {
    return this.getProvider(provider).models || [];
  },

  getCustomModelPlaceholder(provider) {
    return this.getProvider(provider).customModelPlaceholder || '输入模型名称';
  },

  normalizeConfig(config = {}) {
    const provider = this.PROVIDERS[config.provider] ? config.provider : this.DEFAULT_CONFIG.provider;
    return {
      provider,
      model: config.model || this.getDefaultModel(provider),
      customBaseUrl: (config.customBaseUrl || '').trim(),
      customModel: (config.customModel || '').trim(),
    };
  },

  getEffectiveModel(config = {}) {
    const normalized = this.normalizeConfig(config);
    return normalized.customModel || normalized.model || this.getDefaultModel(normalized.provider);
  },

  getBaseUrl(config = {}) {
    const normalized = this.normalizeConfig(config);
    if (normalized.provider === 'custom') return normalized.customBaseUrl;
    return this.getProvider(normalized.provider).baseUrl;
  },

  getChatCompletionsUrl(config = {}) {
    const normalized = this.normalizeConfig(config);
    const baseUrl = this.getBaseUrl(normalized);
    const chatPath = this.getProvider(normalized.provider).chatPath || '/v1/chat/completions';
    return this._joinBaseAndPath(baseUrl, chatPath);
  },

  buildRequestBody(config = {}, messages = []) {
    const normalized = this.normalizeConfig(config);
    const provider = this.getProvider(normalized.provider);
    const model = this.getEffectiveModel(normalized);

    const body = {
      model,
      messages,
      stream: true,
      max_tokens: 2048,
    };

    if (provider.name === 'OpenAI') {
      delete body.max_tokens;
      body.max_completion_tokens = 2048;
      if (!this._isOpenAIFixedTemperatureModel(model)) {
        body.temperature = 0.7;
      }
      return body;
    }

    if (!this._shouldOmitTemperature(normalized.provider, model)) {
      body.temperature = 0.7;
    }

    return body;
  },

  _shouldOmitTemperature(provider, model) {
    if (provider === 'openai') return this._isOpenAIFixedTemperatureModel(model);
    if (provider === 'deepseek') return model === 'deepseek-reasoner';
    return false;
  },

  _isOpenAIFixedTemperatureModel(model = '') {
    return /^(gpt-5|o\d|o\d-mini|o\d-preview|o4-mini)/.test(model);
  },

  _joinBaseAndPath(baseUrl, path) {
    const cleanBase = String(baseUrl || '').trim().replace(/\/+$/, '');
    if (!cleanBase) return '';
    if (/\/chat\/completions$/i.test(cleanBase)) return cleanBase;

    const pathMatch = String(path || '').match(/^\/(v\d+)\/(.+)$/);
    if (pathMatch && new RegExp(`/${pathMatch[1]}$`, 'i').test(cleanBase)) {
      return `${cleanBase}/${pathMatch[2]}`;
    }
    return `${cleanBase}${path}`;
  },
};
