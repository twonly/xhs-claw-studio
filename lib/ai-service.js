// AI 服务封装 — 多厂商 OpenAI 兼容接口 + SSE 流式 + 数据摘要 + 历史管理

const AI_SERVICE = {
  // ========== 厂商注册表 ==========
  // 所有厂商均使用 OpenAI 兼容的 /v1/chat/completions 接口

  PROVIDERS: AI_CATALOG.PROVIDERS,

  // ========== 配置管理 ==========

  async getConfig() {
    const data = await chrome.storage.local.get('aiConfig');
    return AI_CATALOG.normalizeConfig(data.aiConfig || AI_CATALOG.DEFAULT_CONFIG);
  },

  async setConfig(config) {
    await chrome.storage.local.set({ aiConfig: config });
  },

  async getApiKey(providerOverride = null) {
    const provider = providerOverride || (await this.getConfig())?.provider || AI_CATALOG.DEFAULT_CONFIG.provider;
    const data = await chrome.storage.local.get(['aiApiKeys', 'aiApiKey', 'deepseekApiKey']);
    const keyMap = data.aiApiKeys && typeof data.aiApiKeys === 'object' ? data.aiApiKeys : {};

    // 向后兼容：
    // 1. 优先读按 provider 存储的新结构
    // 2. DeepSeek 回退到旧的全局 aiApiKey / deepseekApiKey
    // 3. 其他 provider 如果没有单独 key，则不再错误复用全局 key
    if (keyMap[provider]) return this.normalizeApiKey(keyMap[provider]);
    if (provider === 'deepseek') {
      return this.normalizeApiKey(data.aiApiKey || data.deepseekApiKey || '');
    }
    return null;
  },

  async setApiKey(key, providerOverride = null) {
    const provider = providerOverride || (await this.getConfig())?.provider || AI_CATALOG.DEFAULT_CONFIG.provider;
    const normalizedKey = this.normalizeApiKey(key);
    const data = await chrome.storage.local.get('aiApiKeys');
    const keyMap = data.aiApiKeys && typeof data.aiApiKeys === 'object' ? data.aiApiKeys : {};
    keyMap[provider] = normalizedKey;

    const payload = { aiApiKeys: keyMap };
    if (provider === 'deepseek') {
      payload.aiApiKey = normalizedKey;
      payload.deepseekApiKey = normalizedKey;
    }
    await chrome.storage.local.set(payload);
  },

  _getEndpoint() {
    const config = AI_CATALOG.normalizeConfig(this._cachedConfig || AI_CATALOG.DEFAULT_CONFIG);
    return {
      url: AI_CATALOG.getChatCompletionsUrl(config),
      model: AI_CATALOG.getEffectiveModel(config),
      body: AI_CATALOG.buildRequestBody(config),
    };
  },

  normalizeApiKey(key) {
    const normalized = String(key || '')
      .replace(/[•·]/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/["'`]/g, '')
      .replace(/\s+/g, '')
      .trim();
    return normalized || null;
  },

  validateApiKey(key) {
    const normalized = this.normalizeApiKey(key);
    if (!normalized) throw new Error('请先填写有效的 API Key');
    return normalized;
  },

  async testConnection(configOverride = null, apiKeyOverride = null) {
    const config = AI_CATALOG.normalizeConfig(configOverride || await this.getConfig());
    const apiKey = this.validateApiKey(apiKeyOverride || await this.getApiKey());

    const url = AI_CATALOG.getChatCompletionsUrl(config);
    const model = AI_CATALOG.getEffectiveModel(config);
    if (!url) throw new Error('未配置 API 地址，请检查厂商或自定义地址');
    if (!model) throw new Error('未配置模型名称，请检查模型设置');

    const body = AI_CATALOG.buildRequestBody(config, [
      { role: 'user', content: 'ping' },
    ]);
    body.stream = false;
    if ('max_tokens' in body) body.max_tokens = 8;
    if ('max_completion_tokens' in body) body.max_completion_tokens = 8;

    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          ...body,
          model,
        }),
      });
    } catch (e) {
      if (/non ISO-8859-1/i.test(String(e?.message || ''))) {
        throw new Error('API Key 包含异常字符，请重新复制粘贴纯文本 Key 后重试');
      }
      throw e;
    }

    const rawText = await resp.text().catch(() => '');
    if (!resp.ok) {
      if (resp.status === 401) throw new Error('API Key 无效，请检查设置');
      if (resp.status === 403) throw new Error('当前 Key 没有访问该模型或接口的权限');
      if (resp.status === 404) throw new Error('接口地址或模型名称不存在，请检查 Base URL 与模型名');
      if (resp.status === 429) throw new Error('请求过于频繁或额度不足，请稍后再试');
      throw new Error(`请求失败 (${resp.status})：${rawText.slice(0, 160)}`);
    }

    let data = null;
    try {
      data = rawText ? JSON.parse(rawText) : null;
    } catch {
      if (/api key is invalid/i.test(rawText)) {
        throw new Error('API Key 无效，请检查设置');
      }
      return {
        ok: true,
        provider: config.provider,
        model,
        url,
        raw: rawText.slice(0, 160),
      };
    }

    if (data?.error?.message) {
      throw new Error(data.error.message);
    }

    return {
      ok: true,
      provider: config.provider,
      model: data?.model || model,
      url,
      id: data?.id || null,
    };
  },

  // ========== 数据摘要构建 ==========

  buildDataDigest(notes) {
    if (!notes || notes.length === 0) return '无数据';

    const totalLikes = notes.reduce((s, n) => s + (n.likes || 0), 0);
    const totalCollects = notes.reduce((s, n) => s + (n.collects || 0), 0);
    const totalComments = notes.reduce((s, n) => s + (n.commentCount || 0), 0);

    const author = notes[0]?.author?.nickname || '未知';
    const dates = notes.map(n => n.publishTime || n.publish_time || '').filter(Boolean);
    const dateRange = dates.length > 0
      ? `${dates[dates.length - 1]} ~ ${dates[0]}`
      : '未知';

    let digest = `## 数据概览
- 博主：${author}
- 笔记数量：${notes.length} 篇
- 日期范围：${dateRange}
- 总点赞：${totalLikes}，总收藏：${totalCollects}，总评论：${totalComments}
- 平均互动/篇：${((totalLikes + totalCollects + totalComments) / notes.length).toFixed(1)}
`;

    const sorted = [...notes].sort((a, b) => (b.likes || 0) - (a.likes || 0));
    const top5 = sorted.slice(0, 5);
    digest += `\n## Top 5 高互动笔记\n`;
    top5.forEach((n, i) => {
      const tags = n.tags?.slice(0, 5).join(', ') || '无标签';
      digest += `${i + 1}. 「${(n.title || '无标题').slice(0, 40)}」— ${n.likes || 0}赞/${n.collects || 0}藏/${n.commentCount || 0}评 — 标签: ${tags}\n`;
    });

    const bottom5 = sorted.slice(-5).reverse();
    digest += `\n## Bottom 5 低互动笔记\n`;
    bottom5.forEach((n, i) => {
      digest += `${i + 1}. 「${(n.title || '无标题').slice(0, 40)}」— ${n.likes || 0}赞/${n.collects || 0}藏\n`;
    });

    const tagCount = {};
    for (const n of notes) {
      if (!n.tags) continue;
      for (const t of n.tags) tagCount[t] = (tagCount[t] || 0) + 1;
    }
    const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (topTags.length > 0) {
      digest += `\n## 标签词频 Top 10\n`;
      topTags.forEach(([tag, count]) => {
        digest += `- #${tag}: ${count}篇\n`;
      });
    }

    const avgTitleLen = (notes.reduce((s, n) => s + (n.title?.length || 0), 0) / notes.length).toFixed(0);
    const avgContentLen = (notes.reduce((s, n) => s + (n.content?.length || 0), 0) / notes.length).toFixed(0);
    const avgImages = (notes.reduce((s, n) => s + (n.imageCount || 0), 0) / notes.length).toFixed(1);
    const avgTags = (notes.reduce((s, n) => s + (n.tags?.length || 0), 0) / notes.length).toFixed(1);

    digest += `\n## 内容特征
- 平均标题长度：${avgTitleLen}字
- 平均正文长度：${avgContentLen}字
- 平均图片数：${avgImages}张/篇
- 平均标签数：${avgTags}个/篇
`;

    if (notes.length >= 5) {
      const top20 = sorted.slice(0, Math.max(1, Math.ceil(notes.length * 0.2)));
      const rest = sorted.slice(Math.ceil(notes.length * 0.2));
      if (rest.length > 0) {
        const topAvgTitle = (top20.reduce((s, n) => s + (n.title?.length || 0), 0) / top20.length).toFixed(0);
        const restAvgTitle = (rest.reduce((s, n) => s + (n.title?.length || 0), 0) / rest.length).toFixed(0);
        const topAvgContent = (top20.reduce((s, n) => s + (n.content?.length || 0), 0) / top20.length).toFixed(0);
        const restAvgContent = (rest.reduce((s, n) => s + (n.content?.length || 0), 0) / rest.length).toFixed(0);
        const topAvgImg = (top20.reduce((s, n) => s + (n.imageCount || 0), 0) / top20.length).toFixed(1);
        const restAvgImg = (rest.reduce((s, n) => s + (n.imageCount || 0), 0) / rest.length).toFixed(1);

        digest += `\n## 爆款 vs 普通对比（Top 20% vs 其余）
- 标题长度：${topAvgTitle}字 vs ${restAvgTitle}字
- 正文长度：${topAvgContent}字 vs ${restAvgContent}字
- 图片数量：${topAvgImg}张 vs ${restAvgImg}张
`;
      }
    }

    // 创作者后台数据（如已导入）
    const backendNotes = notes.filter(n => n.backend);
    if (backendNotes.length > 0) {
      const totalImpressions = backendNotes.reduce((s, n) => s + (n.backend.impressions || 0), 0);
      const totalViews = backendNotes.reduce((s, n) => s + (n.backend.views || 0), 0);
      const totalShares = backendNotes.reduce((s, n) => s + (n.backend.shares || 0), 0);
      const totalFollowerGain = backendNotes.reduce((s, n) => s + (n.backend.followerGain || 0), 0);
      const ctrs = backendNotes.map(n => n.backend.coverCTR).filter(v => v != null);
      const avgCTR = ctrs.length > 0 ? (ctrs.reduce((a, b) => a + b, 0) / ctrs.length * 100).toFixed(1) : '无';
      const watchTimes = backendNotes.map(n => n.backend.avgWatchTime).filter(v => v != null);
      const avgWatch = watchTimes.length > 0 ? (watchTimes.reduce((a, b) => a + b, 0) / watchTimes.length).toFixed(1) : '无';

      digest += `\n## 创作者后台数据（${backendNotes.length} 条笔记已导入）
- 总曝光：${totalImpressions}，平均曝光/篇：${(totalImpressions / backendNotes.length).toFixed(0)}
- 总观看：${totalViews}，观看率：${totalImpressions > 0 ? (totalViews / totalImpressions * 100).toFixed(1) : 0}%
- 平均封面点击率：${avgCTR}%
- 平均观看时长：${avgWatch}秒
- 总涨粉：${totalFollowerGain}，平均涨粉/篇：${(totalFollowerGain / backendNotes.length).toFixed(1)}
- 总分享：${totalShares}，平均分享/篇：${(totalShares / backendNotes.length).toFixed(1)}
`;

      // 涨粉 Top 5
      const topFollower = [...backendNotes].sort((a, b) => (b.backend.followerGain || 0) - (a.backend.followerGain || 0)).slice(0, 5);
      if (topFollower[0]?.backend?.followerGain > 0) {
        digest += `\n## 涨粉 Top 5\n`;
        topFollower.forEach((n, i) => {
          digest += `${i + 1}. 「${(n.title || '无标题').slice(0, 40)}」— 涨粉${n.backend.followerGain} / 曝光${n.backend.impressions || 0} / 分享${n.backend.shares || 0}\n`;
        });
      }

      // 分享 Top 5
      const topShares = [...backendNotes].sort((a, b) => (b.backend.shares || 0) - (a.backend.shares || 0)).slice(0, 5);
      if (topShares[0]?.backend?.shares > 0) {
        digest += `\n## 分享 Top 5\n`;
        topShares.forEach((n, i) => {
          digest += `${i + 1}. 「${(n.title || '无标题').slice(0, 40)}」— 分享${n.backend.shares} / 曝光${n.backend.impressions || 0}\n`;
        });
      }
    }

    return digest;
  },

  // ========== SSE 流式调用 ==========

  async *streamChat(messages) {
    const apiKey = this.validateApiKey(await this.getApiKey());

    // 获取最新配置
    this._cachedConfig = await this.getConfig();
    const { url, model, body } = this._getEndpoint();

    if (!url) throw new Error('未配置 API 地址，请在设置中选择厂商或填写自定义地址');
    if (!model) throw new Error('未配置模型名称，请在设置中选择或填写模型');

    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          ...body,
          model,
          messages,
        }),
      });
    } catch (e) {
      if (/non ISO-8859-1/i.test(String(e?.message || ''))) {
        throw new Error('API Key 包含异常字符，请重新复制粘贴纯文本 Key 后重试');
      }
      throw e;
    }

    if (!resp.ok) {
      const errorText = await resp.text().catch(() => '');
      if (resp.status === 401) throw new Error('API Key 无效，请检查设置');
      if (resp.status === 429) throw new Error('请求过于频繁，请稍后再试');
      throw new Error(`API 请求失败 (${resp.status}): ${errorText.slice(0, 200)}`);
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          yield { text: '', done: true };
          return;
        }
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.delta?.content || '';
          if (content) yield { text: content, done: false };
        } catch {}
      }
    }
    yield { text: '', done: true };
  },

  // ========== 生成分析报告 ==========

  async *generateReport(notes) {
    const digest = this.buildDataDigest(notes);
    const hasBackend = notes.some(n => n.backend);
    const backendExtra = hasBackend ? `
6. 如果数据中包含「创作者后台数据」，务必深入分析：
   - 曝光→观看转化率（封面点击率）的优化空间
   - 观看时长与互动的关系
   - 涨粉效率最高的内容类型
   - 分享传播力强的内容特征
   - 给出封面优化、内容节奏优化的具体建议` : '';
    const messages = [
      {
        role: 'system',
        content: `你是一位资深小红书运营分析师。基于以下笔记数据摘要，生成专业的运营分析报告。

要求：
1. 用 ## 标题分4段：内容策略分析、爆款密码解析、对标建议、数据洞察
2. 每段 150-300 字，语气专业但易懂
3. 给出具体可执行的建议，引用数据支撑
4. 对标建议要包含：选题方向、标题公式、内容结构、标签策略
5. 数据洞察要发现异常点和机会点${backendExtra}

数据摘要：
${digest}`,
      },
      {
        role: 'user',
        content: '请生成完整的运营分析报告。',
      },
    ];

    yield* this.streamChat(messages);
  },

  async *generateSectionInsight(sectionName, digest, noteCount = 0) {
    const messages = [
      {
        role: 'system',
        content: `你是一位资深小红书运营分析师。现在你只分析一个细分图表模块，不要泛泛而谈。

要求：
1. 输出 2 段以内，总长度控制在 120-220 字
2. 先解释这组数据说明了什么，再给 2-3 条可执行建议
3. 必须紧扣当前模块，不要扩展到整份账号总报告
4. 如果样本不足或结论不稳，要明确指出

模块名称：${sectionName}
样本笔记数：${noteCount}

模块数据摘要：
${digest}`,
      },
      {
        role: 'user',
        content: `请总结「${sectionName}」这部分数据，并给出具体建议。`,
      },
    ];

    yield* this.streamChat(messages);
  },

  // ========== Q&A 对话 ==========

  async *chat(notes, userMessage, history = []) {
    const digest = this.buildDataDigest(notes);
    const messages = [
      {
        role: 'system',
        content: `你是小红书运营分析助手。基于以下抓取数据回答用户问题。回答要简洁专业，用数据说话。如果用户的问题与数据无关，可以基于你的小红书运营知识回答。

数据摘要：
${digest}`,
      },
      ...history.slice(-20),
      { role: 'user', content: userMessage },
    ];

    yield* this.streamChat(messages);
  },

  // ========== 缓存 & 历史管理 ==========

  hashData(notes) {
    const ids = notes.slice(0, 5).map(n => n.noteId || n.title || '').join('|');
    const key = `${ids}_${notes.length}`;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = ((hash << 5) - hash + key.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(36);
  },

  async saveReport(dataHash, report) {
    await chrome.storage.local.set({ [`aiReport_${dataHash}`]: report });
    if (typeof CLOUD_SYNC !== 'undefined') {
      CLOUD_SYNC.syncAiReport(dataHash, report, 'single').catch(() => {});
    }
  },

  async loadReport(dataHash) {
    const data = await chrome.storage.local.get(`aiReport_${dataHash}`);
    return data[`aiReport_${dataHash}`] || null;
  },

  async saveChatHistory(dataHash, messages) {
    await chrome.storage.local.set({ [`aiChat_${dataHash}`]: messages });
  },

  async loadChatHistory(dataHash) {
    const data = await chrome.storage.local.get(`aiChat_${dataHash}`);
    return data[`aiChat_${dataHash}`] || [];
  },

  async clearHistory(dataHash) {
    await chrome.storage.local.remove([`aiReport_${dataHash}`, `aiChat_${dataHash}`]);
  },

  getSectionCacheKey(scopeKey, sectionKey) {
    return `section_${scopeKey}_${sectionKey}`;
  },

  async saveSectionReport(scopeKey, sectionKey, report) {
    const key = this.getSectionCacheKey(scopeKey, sectionKey);
    await chrome.storage.local.set({ [`aiReport_${key}`]: report });
    if (typeof CLOUD_SYNC !== 'undefined') {
      CLOUD_SYNC.syncAiReport(key, report, 'section').catch(() => {});
    }
  },

  async loadSectionReport(scopeKey, sectionKey) {
    const key = this.getSectionCacheKey(scopeKey, sectionKey);
    const data = await chrome.storage.local.get(`aiReport_${key}`);
    return data[`aiReport_${key}`] || null;
  },

  // ========== 多博主对比分析 ==========

  buildComparisonDigest(bloggersData) {
    let digest = '## 多博主对比数据摘要\n\n';

    const totalNotes = bloggersData.reduce((s, b) => s + (b.notes?.length || 0), 0);
    const bloggerNames = bloggersData.map(b => b.nickname || '未知').join(' vs ');
    digest += `共对比 ${bloggersData.length} 位博主：${bloggerNames}\n`;
    digest += `总笔记数：${totalNotes}篇\n\n`;

    for (const b of bloggersData) {
      digest += `===== 博主：${b.nickname || '未知'} =====\n`;
      digest += this.buildDataDigest(b.notes) + '\n\n';
    }

    return digest;
  },

  async *generateComparisonReport(bloggersData) {
    const digest = this.buildComparisonDigest(bloggersData);
    const messages = [
      {
        role: 'system',
        content: `你是一位资深小红书 MCN 运营分析师。基于以下多位博主的数据摘要，生成专业的对比分析报告。

要求：
1. 用 ## 标题分5段：整体格局分析、各博主优劣势、策略差异解读、标签与选题分析、实操建议
2. 「整体格局分析」概述这几位博主的规模差异和各自定位
3. 「各博主优劣势」逐一点评每位博主的强项和短板，引用具体数据
4. 「策略差异解读」对比他们在标题风格、内容长度、配图策略、标签使用上的差异
5. 「标签与选题分析」分析话题重叠和差异化机会
6. 「实操建议」给出具体可执行的行动建议：如果是 MCN，该签约谁；如果是个人博主，该学习谁的哪些做法
7. 每段 200-400 字，语气专业但易懂
8. 引用数据支撑每个观点，明确标注"该学什么"和"该避免什么"

数据摘要：
${digest}`,
      },
      {
        role: 'user',
        content: '请生成完整的多博主对比分析报告。',
      },
    ];

    yield* this.streamChat(messages);
  },

  async *compareChat(bloggersData, userMessage, history = []) {
    const digest = this.buildComparisonDigest(bloggersData);
    const messages = [
      {
        role: 'system',
        content: `你是小红书运营分析助手。你正在对比分析以下几位博主的数据。基于数据回答用户问题，可以横向对比、推荐策略、分析差异。回答简洁专业。

数据摘要：
${digest}`,
      },
      ...history.slice(-20),
      { role: 'user', content: userMessage },
    ];

    yield* this.streamChat(messages);
  },

  getComparisonCacheKey(userIds) {
    return `compare_${userIds.sort().join('_')}`;
  },

  async saveComparisonReport(userIds, report) {
    const key = this.getComparisonCacheKey(userIds);
    await chrome.storage.local.set({ [`aiReport_${key}`]: report });
    if (typeof CLOUD_SYNC !== 'undefined') {
      CLOUD_SYNC.syncAiReport(key, report, 'compare').catch(() => {});
    }
  },

  async loadComparisonReport(userIds) {
    const key = this.getComparisonCacheKey(userIds);
    const data = await chrome.storage.local.get(`aiReport_${key}`);
    return data[`aiReport_${key}`] || null;
  },

  async saveComparisonChat(userIds, messages) {
    const key = this.getComparisonCacheKey(userIds);
    await chrome.storage.local.set({ [`aiChat_${key}`]: messages });
  },

  async loadComparisonChat(userIds) {
    const key = this.getComparisonCacheKey(userIds);
    const data = await chrome.storage.local.get(`aiChat_${key}`);
    return data[`aiChat_${key}`] || [];
  },
};
