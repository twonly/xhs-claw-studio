// AI Tools — 给 LLM 用的查询工具（OpenAI function-calling 兼容 schema）
// 所有 handler 只读在内存里的 notes[]，不打网络；这样工具调用延时 ≈ 0
// 宿主：lib/ai-service.js 的 chatWithTools()

const AI_TOOLS = (function () {
  // ========== Schemas（OpenAI tools 格式；DeepSeek/Kimi/GLM/Qwen 都遵守同规范） ==========

  const SCHEMAS = [
    {
      type: 'function',
      function: {
        name: 'list_notes',
        description:
          '列出博主的笔记。支持按标签筛选、日期区间筛选、排序。返回紧凑字段（不含正文全文）。' +
          '用于回答"点赞最高的 10 篇笔记是什么"、"最近 30 天发了哪些"等问题。',
        parameters: {
          type: 'object',
          properties: {
            tag: { type: 'string', description: '标签名（包含匹配、忽略大小写）；留空表示不按标签筛' },
            since: { type: 'string', description: 'ISO 日期 YYYY-MM-DD，只返回此日期后发布的笔记' },
            until: { type: 'string', description: 'ISO 日期 YYYY-MM-DD，只返回此日期前发布的笔记' },
            sortBy: {
              type: 'string',
              enum: ['likes', 'collects', 'comments', 'date'],
              description: '排序字段，默认 likes',
            },
            limit: { type: 'integer', description: '返回多少条（默认 10，最大 30）' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'search_notes',
        description: '在标题和正文里全文搜索关键词，返回命中笔记和文本摘录。用于回答"哪些笔记提过 XX"。',
        parameters: {
          type: 'object',
          properties: {
            query: { type: 'string', description: '要搜索的关键词或短语' },
            limit: { type: 'integer', description: '返回多少条（默认 10，最大 20）' },
          },
          required: ['query'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'get_note_detail',
        description:
          '获取指定 noteId 的完整详情（正文、全部标签、图片数、评论样本最多 20 条）。' +
          '用于针对某一篇笔记做深度追问时使用。',
        parameters: {
          type: 'object',
          properties: {
            noteId: { type: 'string', description: '从 list_notes/search_notes 返回的 noteId' },
          },
          required: ['noteId'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'stats_by_tag',
        description:
          '按标签聚合统计，返回每个标签的笔记数、平均点赞/收藏/评论。用于回答"哪个标签的 ROI 最高"。',
        parameters: {
          type: 'object',
          properties: {
            minCount: { type: 'integer', description: '标签至少出现在多少篇笔记里才统计（默认 2）' },
            limit: { type: 'integer', description: '返回多少个标签（默认 10，最大 20）' },
          },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'stats_by_month',
        description:
          '按月聚合笔记数量 + 平均点赞，返回发布节奏时间轴。用于回答"博主什么时候爆发的"、"发布频率怎么变化"。',
        parameters: { type: 'object', properties: {} },
      },
    },
    {
      type: 'function',
      function: {
        name: 'top_commented_notes',
        description: '返回评论量最高的笔记 Top N。评论多通常意味着读者互动强、有争议或有问题。',
        parameters: {
          type: 'object',
          properties: {
            limit: { type: 'integer', description: '返回多少条（默认 5，最大 15）' },
          },
        },
      },
    },
  ];

  // ========== Handlers 工厂：把 notes[] 和 bloggerMeta 闭包进去 ==========

  function createHandlers(notes = [], bloggerMeta = {}) {
    const ALL = Array.isArray(notes) ? notes : [];

    function compactNote(n) {
      return {
        noteId: n.noteId || '',
        title: n.title || '',
        likes: n.likes || 0,
        collects: n.collects || 0,
        comments: n.commentCount || 0,
        tags: (n.tags || []).slice(0, 10),
        publishTime: n.publishTime || '',
        imageCount: n.imageCount || 0,
      };
    }

    function parseDate(str) {
      if (!str) return null;
      // 统一处理 "2026-04-15 14:30" / "2026-04-15" / ISO 等
      const d = new Date(str.replace(/\//g, '-'));
      return isNaN(d) ? null : d;
    }

    function list_notes(args = {}) {
      const { tag, since, until } = args;
      const sortBy = args.sortBy || 'likes';
      const limit = Math.min(Math.max(args.limit || 10, 1), 30);
      let pool = ALL.slice();

      if (tag) {
        const needle = String(tag).toLowerCase();
        pool = pool.filter((n) =>
          (n.tags || []).some((t) => String(t).toLowerCase().includes(needle)),
        );
      }
      const sinceDate = parseDate(since);
      const untilDate = parseDate(until);
      if (sinceDate || untilDate) {
        pool = pool.filter((n) => {
          const d = parseDate(n.publishTime);
          if (!d) return false;
          if (sinceDate && d < sinceDate) return false;
          if (untilDate && d > untilDate) return false;
          return true;
        });
      }

      if (sortBy === 'date') {
        pool.sort((a, b) => {
          const da = parseDate(a.publishTime)?.getTime() || 0;
          const db = parseDate(b.publishTime)?.getTime() || 0;
          return db - da;
        });
      } else {
        const key = sortBy === 'comments' ? 'commentCount' : sortBy;
        pool.sort((a, b) => (b[key] || 0) - (a[key] || 0));
      }

      return {
        matched: pool.length,
        returned: Math.min(pool.length, limit),
        notes: pool.slice(0, limit).map(compactNote),
      };
    }

    function search_notes(args = {}) {
      const query = String(args.query || '').trim();
      const limit = Math.min(Math.max(args.limit || 10, 1), 20);
      if (!query) return { error: 'query is required' };
      const needle = query.toLowerCase();
      const hits = [];
      for (const n of ALL) {
        const hay = `${n.title || ''}\n${n.content || ''}`.toLowerCase();
        const idx = hay.indexOf(needle);
        if (idx < 0) continue;
        const start = Math.max(0, idx - 20);
        const end = Math.min(hay.length, idx + needle.length + 40);
        const excerpt = (n.content || n.title || '').slice(start, end);
        hits.push({
          ...compactNote(n),
          excerpt,
        });
        if (hits.length >= limit) break;
      }
      return { matched: hits.length, notes: hits };
    }

    function get_note_detail(args = {}) {
      const noteId = String(args.noteId || '');
      if (!noteId) return { error: 'noteId is required' };
      const n = ALL.find((x) => x.noteId === noteId);
      if (!n) return { error: `noteId ${noteId} not found` };
      const comments = Array.isArray(n.comments)
        ? n.comments
            .filter((c) => (c.content || '').trim())
            .slice(0, 20)
            .map((c) => ({
              author: c.author || '',
              content: (c.content || '').slice(0, 120),
              ipLocation: c.ipLocation || '',
            }))
        : [];
      return {
        noteId: n.noteId,
        title: n.title || '',
        content: (n.content || '').slice(0, 1500),
        tags: n.tags || [],
        likes: n.likes || 0,
        collects: n.collects || 0,
        commentCount: n.commentCount || 0,
        imageCount: n.imageCount || 0,
        publishTime: n.publishTime || '',
        commentSamples: comments,
      };
    }

    function stats_by_tag(args = {}) {
      const minCount = Math.max(args.minCount || 2, 1);
      const limit = Math.min(Math.max(args.limit || 10, 1), 20);
      const byTag = new Map();
      for (const n of ALL) {
        for (const t of n.tags || []) {
          const bucket = byTag.get(t) || { count: 0, likes: 0, collects: 0, comments: 0 };
          bucket.count += 1;
          bucket.likes += n.likes || 0;
          bucket.collects += n.collects || 0;
          bucket.comments += n.commentCount || 0;
          byTag.set(t, bucket);
        }
      }
      const rows = [...byTag.entries()]
        .filter(([, v]) => v.count >= minCount)
        .map(([tag, v]) => ({
          tag,
          noteCount: v.count,
          avgLikes: Math.round(v.likes / v.count),
          avgCollects: Math.round(v.collects / v.count),
          avgComments: Math.round(v.comments / v.count),
          totalEngagement: v.likes + v.collects + v.comments,
        }))
        .sort((a, b) => b.avgLikes - a.avgLikes)
        .slice(0, limit);
      return { matched: rows.length, tags: rows };
    }

    function stats_by_month() {
      const byMonth = new Map();
      for (const n of ALL) {
        const d = parseDate(n.publishTime);
        if (!d) continue;
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        const bucket = byMonth.get(key) || { count: 0, likes: 0, collects: 0 };
        bucket.count += 1;
        bucket.likes += n.likes || 0;
        bucket.collects += n.collects || 0;
        byMonth.set(key, bucket);
      }
      const rows = [...byMonth.entries()]
        .map(([month, v]) => ({
          month,
          noteCount: v.count,
          avgLikes: Math.round(v.likes / v.count),
          totalLikes: v.likes,
        }))
        .sort((a, b) => a.month.localeCompare(b.month));
      return { months: rows };
    }

    function top_commented_notes(args = {}) {
      const limit = Math.min(Math.max(args.limit || 5, 1), 15);
      const rows = ALL
        .slice()
        .sort((a, b) => (b.commentCount || 0) - (a.commentCount || 0))
        .slice(0, limit)
        .map(compactNote);
      return { notes: rows };
    }

    return {
      list_notes,
      search_notes,
      get_note_detail,
      stats_by_tag,
      stats_by_month,
      top_commented_notes,
    };
  }

  // 中文标签，用于 UI 显示 "正在查询：xxx"
  const DISPLAY_NAME = {
    list_notes: '浏览笔记',
    search_notes: '关键词搜索',
    get_note_detail: '笔记详情',
    stats_by_tag: '标签统计',
    stats_by_month: '月度节奏',
    top_commented_notes: '高评论笔记',
  };

  // 把工具调用的 args 缩成一句简短描述，让 UI chip 能区分多次同名调用
  function describeCall(name, args = {}) {
    switch (name) {
      case 'search_notes':
        return args.query ? `「${String(args.query).slice(0, 18)}」` : '';
      case 'list_notes': {
        const parts = [];
        if (args.tag) parts.push(`#${args.tag}`);
        if (args.since || args.until) {
          parts.push(`${args.since || ''}~${args.until || ''}`);
        }
        if (args.sortBy && args.sortBy !== 'likes') parts.push(`按${args.sortBy}`);
        if (args.limit) parts.push(`${args.limit}条`);
        return parts.length ? ` (${parts.join(' ')})` : '';
      }
      case 'get_note_detail':
        return args.noteId ? ` (${String(args.noteId).slice(0, 8)})` : '';
      case 'stats_by_tag':
        return args.minCount && args.minCount !== 2 ? ` (≥${args.minCount}篇)` : '';
      case 'top_commented_notes':
        return args.limit ? ` (${args.limit}条)` : '';
      default:
        return '';
    }
  }

  const api = { SCHEMAS, createHandlers, DISPLAY_NAME, describeCall };
  if (typeof window !== 'undefined') window.AI_TOOLS = api;
  return api;
})();
