// 多博主数据管理层 — CRUD、索引、迁移

const DATA_STORE = {
  // ========== 博主 CRUD ==========

  async saveBlogger(userId, nickname, avatar, profileUrl, notes, stats = null) {
    // v2.9.0: 去重 — 检测是否有不同 userId 但实际是同一个博主的旧记录，自动合并
    const dupId = await this._findDuplicateBlogger(userId, profileUrl, notes);
    if (dupId) {
      // 把旧记录的笔记合并到新记录，然后删除旧记录
      const oldData = await this.getBloggerData(dupId);
      if (oldData?.notes?.length) {
        notes = this.mergeNotes(oldData.notes, notes, true);
      }
      if (!stats && oldData?.stats) stats = oldData.stats;
      if (!avatar && oldData?.avatar) avatar = oldData.avatar;
      if (!profileUrl && oldData?.profileUrl) profileUrl = oldData.profileUrl;
      await this.deleteBlogger(dupId);
    }

    const totalLikes = notes.reduce((s, n) => s + (n.likes || 0), 0);
    const totalCollects = notes.reduce((s, n) => s + (n.collects || 0), 0);
    const totalComments = notes.reduce((s, n) => s + (n.commentCount || 0), 0);
    const now = Date.now();

    // v2.7.0: 合并已有 stats（避免增量抓取时丢失上次抓到的粉丝数）
    const existingData = await chrome.storage.local.get(`blogger_${userId}`);
    const existingBlogger = existingData[`blogger_${userId}`] || null;
    let mergedStats = stats || null;
    if (!mergedStats) {
      mergedStats = existingBlogger?.stats || null;
    }

    // v2.7.2: 时序快照 — 保留旧笔记指标到 history[]
    if (existingBlogger?.notes?.length) {
      const oldMap = new Map();
      for (const oldNote of existingBlogger.notes) {
        const nid = this._getNoteKey(oldNote);
        if (nid) oldMap.set(nid, oldNote);
      }
      for (const newNote of notes) {
        const nid = this._getNoteKey(newNote);
        if (!nid) continue;
        const oldNote = oldMap.get(nid);
        if (!oldNote) continue;
        // 如果指标有变化，把旧值推入 history
        if (oldNote.likes !== newNote.likes ||
            oldNote.collects !== newNote.collects ||
            oldNote.commentCount !== newNote.commentCount) {
          const history = Array.isArray(oldNote.history) ? [...oldNote.history] : [];
          history.push({
            likes: oldNote.likes,
            collects: oldNote.collects,
            commentCount: oldNote.commentCount,
            ts: oldNote.crawlTime || existingBlogger.scrapedAt || now,
          });
          // 最多保留 50 条历史
          newNote.history = history.slice(-50);
        } else {
          // 指标没变也要保留已有 history
          if (Array.isArray(oldNote.history) && oldNote.history.length > 0) {
            newNote.history = oldNote.history;
          }
        }
      }
    }

    // v2.7.2: 博主级快照 — 记录每次抓取的汇总指标
    const bloggerSnapshots = Array.isArray(existingBlogger?.snapshots) ? [...existingBlogger.snapshots] : [];
    // 仅当与上次快照有变化时才记录
    const lastSnap = bloggerSnapshots[bloggerSnapshots.length - 1];
    if (!lastSnap ||
        lastSnap.totalLikes !== totalLikes ||
        lastSnap.totalCollects !== totalCollects ||
        lastSnap.noteCount !== notes.length) {
      bloggerSnapshots.push({
        ts: now,
        noteCount: notes.length,
        totalLikes, totalCollects, totalComments,
        followerCount: mergedStats?.followerCount ?? null,
      });
      // 最多保留 100 条博主快照
      if (bloggerSnapshots.length > 100) bloggerSnapshots.splice(0, bloggerSnapshots.length - 100);
    }

    // 保存完整数据
    await chrome.storage.local.set({
      [`blogger_${userId}`]: {
        userId, nickname, avatar, profileUrl,
        notes, scrapedAt: now, noteCount: notes.length,
        stats: mergedStats,
        snapshots: bloggerSnapshots,
      },
    });

    // 更新索引（upsert）
    const index = await this.getBloggerIndex();
    const existing = index.findIndex(b => b.userId === userId);
    const entry = {
      userId, nickname, avatar, profileUrl,
      noteCount: notes.length, totalLikes, totalCollects, totalComments,
      lastScrapedAt: now,
      followerCount: mergedStats?.followerCount ?? null,
      followingCount: mergedStats?.followingCount ?? null,
      likedAndCollectedCount: mergedStats?.likedAndCollectedCount ?? null,
      redId: mergedStats?.redId ?? null,
      desc: mergedStats?.desc ?? null,
      gender: mergedStats?.gender ?? null,
      ipLocation: mergedStats?.ipLocation ?? null,
    };
    if (existing >= 0) {
      index[existing] = entry;
    } else {
      index.unshift(entry);
    }
    await chrome.storage.local.set({ bloggerIndex: index });

    // 更新最近抓取
    await this._addRecentScrape({ userId, nickname, avatar, profileUrl, noteCount: notes.length, scrapedAt: now });
  },

  async getBloggerIndex() {
    const data = await chrome.storage.local.get('bloggerIndex');
    return data.bloggerIndex || [];
  },

  async getBloggerData(userId) {
    const data = await chrome.storage.local.get(`blogger_${userId}`);
    return data[`blogger_${userId}`] || null;
  },

  async deleteBlogger(userId) {
    // 删除所有相关数据
    await chrome.storage.local.remove([
      `blogger_${userId}`,
      `batch_${userId}`,
      `aiReport_${userId}`,
      `aiChat_${userId}`,
    ]);
    // 从索引中移除
    const index = await this.getBloggerIndex();
    const filtered = index.filter(b => b.userId !== userId);
    await chrome.storage.local.set({ bloggerIndex: filtered });
    // 从最近抓取中移除
    const recent = await this.getRecentScrapes();
    const filteredRecent = recent.filter(r => r.userId !== userId);
    await chrome.storage.local.set({ recentScrapes: filteredRecent });
  },

  // ========== 最近记录 ==========

  async getRecentScrapes() {
    const data = await chrome.storage.local.get('recentScrapes');
    return data.recentScrapes || [];
  },

  async _addRecentScrape(entry) {
    const list = await this.getRecentScrapes();
    // 去重（同一用户只保留最新）
    const filtered = list.filter(r => r.userId !== entry.userId);
    filtered.unshift(entry);
    // 最多保留 10 条
    await chrome.storage.local.set({ recentScrapes: filtered.slice(0, 20) });
  },

  // ========== 迁移（v2.2 → v2.3）==========

  async migrateIfNeeded() {
    const flag = await chrome.storage.local.get('_migrationV23Done');
    if (flag._migrationV23Done) return;

    const data = await chrome.storage.local.get('analysisData');
    const notes = data.analysisData;
    if (notes && notes.length > 0) {
      // 从笔记中提取博主信息
      let userId = null;
      const firstNote = notes[0];

      // 尝试从 noteUrl 提取 userId
      if (firstNote.noteUrl) {
        userId = this.extractUserIdFromUrl(firstNote.noteUrl);
      }
      // 尝试从 author 提取
      const nickname = firstNote.author?.nickname || '已迁移数据';
      const avatar = firstNote.author?.avatar || '';

      // 生成合成 key
      if (!userId) {
        userId = 'legacy_' + Date.now().toString(36);
      }

      const profileUrl = userId.startsWith('legacy_')
        ? '' : `https://www.xiaohongshu.com/user/profile/${userId}`;

      await this.saveBlogger(userId, nickname, avatar, profileUrl, notes);

      // 迁移旧 AI 缓存（best effort）
      try {
        const oldHash = AI_SERVICE?.hashData?.(notes);
        if (oldHash) {
          const oldReport = await chrome.storage.local.get(`aiReport_${oldHash}`);
          const oldChat = await chrome.storage.local.get(`aiChat_${oldHash}`);
          if (oldReport[`aiReport_${oldHash}`]) {
            await chrome.storage.local.set({ [`aiReport_${userId}`]: oldReport[`aiReport_${oldHash}`] });
          }
          if (oldChat[`aiChat_${oldHash}`]) {
            await chrome.storage.local.set({ [`aiChat_${userId}`]: oldChat[`aiChat_${oldHash}`] });
          }
        }
      } catch {}

      // 清理旧 key
      await chrome.storage.local.remove('analysisData');
    }

    await chrome.storage.local.set({ _migrationV23Done: true });
  },

  // ========== 工具函数 ==========

  extractUserIdFromUrl(url) {
    if (!url) return null;
    const match = url.match(/\/user\/profile\/([a-f0-9]+)/);
    return match ? match[1] : null;
  },

  getNoteKey(note) {
    return this._getNoteKey(note);
  },

  isValidProfileUrl(url) {
    if (!url) return false;
    return /^https?:\/\/(www\.)?xiaohongshu\.com\/user\/profile\/[a-f0-9]+/.test(url.trim());
  },

  mergeNotes(baseNotes = [], incomingNotes = [], preferIncoming = true) {
    const merged = Array.isArray(baseNotes) ? baseNotes.map(note => ({ ...note })) : [];
    const keyedIndexes = new Map();

    for (let i = 0; i < merged.length; i++) {
      const key = this._getNoteKey(merged[i]);
      if (key) keyedIndexes.set(key, i);
    }

    for (const note of Array.isArray(incomingNotes) ? incomingNotes : []) {
      const key = this._getNoteKey(note);
      if (!key) {
        merged.push(note);
        continue;
      }

      if (keyedIndexes.has(key)) {
        if (preferIncoming) {
          const oldBackend = merged[keyedIndexes.get(key)].backend;
          merged[keyedIndexes.get(key)] = note;
          // 保留已导入的创作者后台数据
          if (oldBackend && !note.backend) {
            merged[keyedIndexes.get(key)].backend = oldBackend;
          }
        }
        continue;
      }

      keyedIndexes.set(key, merged.length);
      merged.push(note);
    }

    return merged;
  },

  // ========== 笔记唯一标识 ==========

  _getNoteKey(note) {
    if (note.noteId) return note.noteId;
    if (note.id) return note.id;
    if (note.noteUrl) {
      const m = note.noteUrl.match(/\/(?:explore|discovery\/item)\/([a-f0-9]+)/);
      if (m) return m[1];
    }
    return null;
  },

  // ========== 博主去重（v2.9.0）==========

  async deduplicateIndex() {
    const index = await this.getBloggerIndex();
    if (index.length < 2) return;

    // 按 profileUrl 中的 userId 分组
    const profileIdMap = new Map(); // profileId → [indexEntry, ...]
    for (const b of index) {
      const pid = this._extractProfileId(b.profileUrl);
      if (!pid) continue;
      if (!profileIdMap.has(pid)) profileIdMap.set(pid, []);
      profileIdMap.get(pid).push(b);
    }

    for (const [pid, entries] of profileIdMap) {
      if (entries.length < 2) continue;
      // 保留笔记最多的那条，合并其余
      entries.sort((a, b) => (b.noteCount || 0) - (a.noteCount || 0));
      const primary = entries[0];
      console.warn(`[DataStore] dedup: profileId=${pid}, keeping "${primary.nickname}" (${primary.userId}), merging ${entries.length - 1} duplicate(s):`, entries.slice(1).map(e => `"${e.nickname}" (${e.userId})`));

      for (let i = 1; i < entries.length; i++) {
        const dup = entries[i];
        const dupData = await this.getBloggerData(dup.userId);
        if (dupData?.notes?.length) {
          const primaryData = await this.getBloggerData(primary.userId);
          const mergedNotes = this.mergeNotes(primaryData?.notes || [], dupData.notes, false);
          const mergedStats = primaryData?.stats || dupData.stats || null;
          const mergedSnapshots = [
            ...(primaryData?.snapshots || []),
            ...(dupData?.snapshots || []),
          ].sort((a, b) => (a.ts || 0) - (b.ts || 0)).slice(-100);

          await chrome.storage.local.set({
            [`blogger_${primary.userId}`]: {
              ...primaryData,
              notes: mergedNotes,
              noteCount: mergedNotes.length,
              stats: mergedStats,
              snapshots: mergedSnapshots,
              scrapedAt: Math.max(primaryData?.scrapedAt || 0, dupData?.scrapedAt || 0),
            },
          });
        }
        await this.deleteBlogger(dup.userId);
      }
    }
  },

  _extractProfileId(url) {
    if (!url) return null;
    const m = url.match(/\/user\/profile\/([a-f0-9]+)/);
    return m ? m[1] : null;
  },

  // ========== 博主去重检测（v2.9.0）==========

  async _findDuplicateBlogger(currentUserId, profileUrl, notes) {
    const index = await this.getBloggerIndex();
    if (index.length === 0) return null;

    // 1. 如果 profileUrl 匹配（最可靠）
    if (profileUrl) {
      const extractId = (url) => {
        const m = url?.match(/\/user\/profile\/([a-f0-9]+)/);
        return m ? m[1] : null;
      };
      const currentProfileId = extractId(profileUrl);
      for (const b of index) {
        if (b.userId === currentUserId) continue;
        const bProfileId = extractId(b.profileUrl);
        if (currentProfileId && bProfileId && currentProfileId === bProfileId) {
          console.warn(`[DataStore] duplicate detected by profileUrl: new="${currentUserId}" matches existing="${b.userId}" (${b.nickname})`);
          return b.userId;
        }
      }
    }

    // 2. 笔记重叠检测：如果新数据的笔记有 ≥50% 与某个旧博主的笔记重合，判定为同一人
    if (notes.length >= 3) {
      const newNoteIds = new Set(
        notes.map(n => this._getNoteKey(n)).filter(Boolean)
      );
      if (newNoteIds.size >= 3) {
        for (const b of index) {
          if (b.userId === currentUserId) continue;
          const oldData = await this.getBloggerData(b.userId);
          if (!oldData?.notes?.length) continue;
          const oldNoteIds = new Set(
            oldData.notes.map(n => this._getNoteKey(n)).filter(Boolean)
          );
          let overlap = 0;
          for (const id of newNoteIds) {
            if (oldNoteIds.has(id)) overlap++;
          }
          if (overlap >= Math.min(newNoteIds.size, oldNoteIds.size) * 0.5) {
            console.warn(`[DataStore] duplicate detected by note overlap: new="${currentUserId}" overlaps ${overlap} notes with existing="${b.userId}" (${b.nickname})`);
            return b.userId;
          }
        }
      }
    }

    return null;
  },

  // ========== 批量加载 ==========

  async getMultipleBloggerData(userIds) {
    if (!userIds || userIds.length === 0) return [];
    const keys = userIds.map(id => `blogger_${id}`);
    const data = await chrome.storage.local.get(keys);
    return userIds
      .map(id => data[`blogger_${id}`])
      .filter(Boolean);
  },
};
