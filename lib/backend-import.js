// 创作者后台数据导入 — 解析小红书创作者中心导出的 Excel 文件
// 支持两类文件：笔记列表明细表.xlsx（必选） + 近7日观看数据.xlsx（可选）

const BACKEND_IMPORT = {

  // ========== 笔记列表明细表 解析 ==========

  parseNoteDetail(workbook) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!sheet) throw new Error('Excel 文件为空');
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });

    // 找到表头行（含"笔记标题"的那行）
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rows.length, 5); i++) {
      if (rows[i]?.some(c => String(c).includes('笔记标题'))) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx < 0) throw new Error('未找到表头行（需包含"笔记标题"列）');

    const headers = rows[headerIdx].map(h => String(h).trim());
    const colMap = {};
    const COLUMN_ALIASES = {
      title: ['笔记标题'],
      publishTime: ['首次发布时间', '发布时间'],
      type: ['体裁', '笔记类型'],
      impressions: ['曝光', '曝光量'],
      views: ['观看量', '观看'],
      coverCTR: ['封面点击率'],
      likes: ['点赞', '点赞数'],
      comments: ['评论', '评论数'],
      collects: ['收藏', '收藏数'],
      followerGain: ['涨粉', '涨粉数'],
      shares: ['分享', '分享数'],
      avgWatchTime: ['人均观看时长', '平均观看时长'],
      danmaku: ['弹幕', '弹幕数'],
    };
    for (const [key, aliases] of Object.entries(COLUMN_ALIASES)) {
      for (const alias of aliases) {
        const idx = headers.indexOf(alias);
        if (idx >= 0) { colMap[key] = idx; break; }
      }
    }
    if (colMap.title === undefined) throw new Error('未找到"笔记标题"列');

    const result = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[colMap.title]) continue;
      const title = String(row[colMap.title]).trim();
      if (!title) continue;

      result.push({
        title,
        publishTime: this._parsePublishTime(row[colMap.publishTime]),
        type: colMap.type !== undefined ? String(row[colMap.type]).trim() : null,
        impressions: this._parseNum(row[colMap.impressions]),
        views: this._parseNum(row[colMap.views]),
        coverCTR: this._parseCTR(row[colMap.coverCTR]),
        likes: this._parseNum(row[colMap.likes]),
        comments: this._parseNum(row[colMap.comments]),
        collects: this._parseNum(row[colMap.collects]),
        followerGain: this._parseNum(row[colMap.followerGain]),
        shares: this._parseNum(row[colMap.shares]),
        avgWatchTime: this._parseWatchTime(row[colMap.avgWatchTime]),
        danmaku: this._parseNum(row[colMap.danmaku]),
      });
    }
    return result;
  },

  // ========== 近7日观看数据 解析 ==========

  parseAccountTimeSeries(workbook) {
    const result = { summary: {}, daily: {}, periodDays: null };
    const SHEET_MAP = {
      '账号总体观看数据': 'summary',
      '曝光趋势': 'impressions',
      '观看趋势': 'views',
      '封面点击率趋势': 'coverCTR',
      '平均观看时长趋势': 'avgWatchTime',
      '观看总时长趋势': 'totalWatchTime',
      '视频完播率趋势': 'completionRate',
    };
    for (const [sheetName, key] of Object.entries(SHEET_MAP)) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (key === 'summary') {
        for (const row of rows) {
          if (row.length >= 2 && row[0]) {
            result.summary[String(row[0]).trim()] = row[1];
          }
        }
      } else {
        result.daily[key] = [];
        for (let i = 1; i < rows.length; i++) {
          if (rows[i].length < 2 || !rows[i][0]) continue;
          result.daily[key].push({
            date: String(rows[i][0]).trim(),
            value: this._parseTimeSeriesValue(rows[i][1]),
          });
        }
        result.daily[key].sort((a, b) => a.date.localeCompare(b.date));
      }
    }
    // 自动检测时间跨度（7日/30日/其他）
    const firstSeries = Object.values(result.daily).find(arr => arr.length > 0);
    if (firstSeries) {
      result.periodDays = firstSeries.length;
    }
    return result;
  },

  // ========== 匹配与合并 ==========

  mergeBackendData(existingNotes, importedRows) {
    const matched = [];
    const unmatched = [];
    const used = new Set();

    for (const row of importedRows) {
      let bestMatch = null;
      let bestScore = 0;

      for (let i = 0; i < existingNotes.length; i++) {
        if (used.has(i)) continue;
        const note = existingNotes[i];
        const score = this._matchScore(note, row);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = i;
        }
      }

      if (bestMatch !== null && bestScore >= 2) {
        used.add(bestMatch);
        matched.push({ noteIndex: bestMatch, row });
      } else {
        unmatched.push(row);
      }
    }

    // 应用匹配结果
    const updatedNotes = existingNotes.map(n => ({ ...n }));
    const now = Date.now();
    for (const { noteIndex, row } of matched) {
      updatedNotes[noteIndex].backend = {
        impressions: row.impressions,
        views: row.views,
        coverCTR: row.coverCTR,
        followerGain: row.followerGain,
        shares: row.shares,
        avgWatchTime: row.avgWatchTime,
        danmaku: row.danmaku,
        importedAt: now,
      };
    }

    // 未匹配的行同样落盘，作为 backend-only 笔记（没有抓取内容但保留后台数据）
    // 用 backendKey 做去重：同标题+同发布时间的行，二次导入时覆盖而非新增
    const keyFor = (row) => `${this._normalizeTitle(row.title)}|${row.publishTime || ''}`;
    const backendOnlyIndex = new Map();
    for (let i = 0; i < updatedNotes.length; i++) {
      if (updatedNotes[i].isBackendOnly) {
        backendOnlyIndex.set(updatedNotes[i].backendKey, i);
      }
    }
    let addedCount = 0;
    let refreshedCount = 0;
    for (const row of unmatched) {
      const bk = keyFor(row);
      const entry = {
        isBackendOnly: true,
        backendKey: bk,
        title: row.title,
        publishTime: row.publishTime ? new Date(row.publishTime).toLocaleString('zh-CN', {
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit',
        }) : '',
        publishTimestamp: row.publishTime || null,
        likes: row.likes || 0,
        collects: row.collects || 0,
        commentCount: row.comments || 0,
        type: row.type || null,
        backend: {
          impressions: row.impressions,
          views: row.views,
          coverCTR: row.coverCTR,
          followerGain: row.followerGain,
          shares: row.shares,
          avgWatchTime: row.avgWatchTime,
          danmaku: row.danmaku,
          importedAt: now,
        },
      };
      if (backendOnlyIndex.has(bk)) {
        updatedNotes[backendOnlyIndex.get(bk)] = entry;
        refreshedCount++;
      } else {
        updatedNotes.push(entry);
        addedCount++;
      }
    }

    return {
      notes: updatedNotes,
      matchedCount: matched.length,
      unmatchedCount: unmatched.length,
      backendOnlyAdded: addedCount,
      backendOnlyRefreshed: refreshedCount,
      totalImported: importedRows.length,
    };
  },

  // ========== 匹配评分 ==========

  _matchScore(note, row) {
    let score = 0;
    const noteTitle = this._normalizeTitle(note.title);
    const rowTitle = this._normalizeTitle(row.title);

    // 精确标题匹配 = 3分
    if (noteTitle === rowTitle && noteTitle.length > 0) score += 3;
    // 标题包含关系 = 1分（处理截断）
    else if (noteTitle.length > 5 && rowTitle.length > 5 &&
             (noteTitle.includes(rowTitle) || rowTitle.includes(noteTitle))) score += 1;
    else return 0; // 标题不匹配直接跳过

    // 日期匹配 = 1分
    if (note.publishTimestamp && row.publishTime) {
      const diff = Math.abs(note.publishTimestamp - row.publishTime);
      if (diff < 86400000 * 2) score += 1; // 2天内
    } else if (note.publishTime && row.publishTime) {
      // 尝试从字符串解析
      const noteTs = new Date(note.publishTime).getTime();
      if (!isNaN(noteTs)) {
        const diff = Math.abs(noteTs - row.publishTime);
        if (diff < 86400000 * 2) score += 1;
      }
    }

    // 互动数据交叉验证 = 1分（点赞数接近）
    if (note.likes > 0 && row.likes > 0) {
      const ratio = Math.min(note.likes, row.likes) / Math.max(note.likes, row.likes);
      if (ratio > 0.5) score += 1;
    }

    return score;
  },

  _normalizeTitle(title) {
    if (!title) return '';
    return String(title)
      .trim()
      .replace(/[\s\u200b\u00a0]+/g, '')   // 去空白
      .replace(/[，。！？、；：""''（）【】《》…—\u3000]/g, '') // 去标点
      .toLowerCase();
  },

  // ========== 工具函数 ==========

  _parseNum(val) {
    if (val === null || val === undefined || val === '') return 0;
    const n = parseFloat(String(val).replace(/[,，]/g, ''));
    return isNaN(n) ? 0 : Math.round(n);
  },

  _parseCTR(val) {
    if (val === null || val === undefined || val === '') return null;
    const s = String(val).replace('%', '').trim();
    const n = parseFloat(s);
    if (isNaN(n)) return null;
    // 如果值 > 1，认为是百分比（如 26 → 0.26）；如果 < 1，认为已经是小数
    return n > 1 ? n / 100 : n;
  },

  _parseWatchTime(val) {
    if (val === null || val === undefined || val === '') return null;
    const s = String(val).replace('秒', '').replace('s', '').trim();
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  },

  _parsePublishTime(val) {
    if (!val) return null;
    const s = String(val).trim();
    // 格式: "2026年04月01日23时54分25秒"
    const m = s.match(/(\d{4})年(\d{2})月(\d{2})日(\d{2})时(\d{2})分(\d{2})秒/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
    // 格式: "2026年04月01日"
    const m2 = s.match(/(\d{4})年(\d{2})月(\d{2})日/);
    if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3]).getTime();
    // ISO / 其他常见格式
    const ts = new Date(s).getTime();
    return isNaN(ts) ? null : ts;
  },

  _parseTimeSeriesValue(val) {
    if (val === null || val === undefined || val === '') return 0;
    const s = String(val).trim();
    const hadPercent = s.includes('%');
    const cleaned = s.replace(/[%秒,，s]/g, '').trim();
    const n = parseFloat(cleaned);
    if (isNaN(n)) return 0;
    // 百分比字段（"28%"、"5.2%"）统一转成小数（0.28、0.052）
    if (hadPercent) return n / 100;
    return n;
  },

  // ========== 存储 ==========

  async saveAccountTimeSeries(userId, timeSeries) {
    await chrome.storage.local.set({ [`backendTimeSeries_${userId}`]: timeSeries });
  },

  async getAccountTimeSeries(userId) {
    const data = await chrome.storage.local.get(`backendTimeSeries_${userId}`);
    return data[`backendTimeSeries_${userId}`] || null;
  },
};
