// 云同步 v1（v2.8.0）— Supabase REST 直连，无 SDK 依赖
// 数据流：本地 chrome.storage.local 始终是 source of truth，后台增量上传到 Supabase

const CLOUD_SYNC = {
  SUPABASE_URL: 'https://adiasillxxfqtduwngdp.supabase.co',
  SUPABASE_KEY: 'sb_publishable_HsI40sZWRX5dV55oaN5K8w_H-G0GIgf',
  SESSION_KEY: 'cloudSyncSession',
  INSTALL_ID_KEY: 'cloudSyncInstallId',

  // ========== 会话管理 ==========
  async getSession() {
    const data = await chrome.storage.local.get(this.SESSION_KEY);
    return data[this.SESSION_KEY] || null;
  },

  async _setSession(session) {
    if (session) {
      await chrome.storage.local.set({ [this.SESSION_KEY]: session });
    } else {
      await chrome.storage.local.remove(this.SESSION_KEY);
    }
  },

  async getUser() {
    const session = await this.getSession();
    return session?.user || null;
  },

  async isLoggedIn() {
    const session = await this.getSession();
    return !!session?.access_token;
  },

  isAnonymousSession(session) {
    if (!session?.user) return false;
    if (session.user.is_anonymous === true) return true;
    if (session.user.app_metadata?.provider === 'anonymous') return true;
    return false;
  },

  hasBoundEmail(session) {
    return !!(session?.user?.email) && !this.isAnonymousSession(session);
  },

  async getInstallId() {
    const data = await chrome.storage.local.get(this.INSTALL_ID_KEY);
    if (data[this.INSTALL_ID_KEY]) return data[this.INSTALL_ID_KEY];
    const id = crypto.randomUUID();
    await chrome.storage.local.set({ [this.INSTALL_ID_KEY]: id });
    return id;
  },

  // ========== 认证 ==========

  _authAttempts: [],

  _checkRateLimit() {
    const now = Date.now();
    this._authAttempts = this._authAttempts.filter((t) => now - t < 60000);
    if (this._authAttempts.length >= 5) {
      throw new Error('操作过于频繁，请 1 分钟后重试');
    }
    this._authAttempts.push(now);
  },

  _validatePassword(password) {
    if (!password || password.length < 8) return '密码至少 8 位';
    if (!/[a-zA-Z]/.test(password)) return '密码需包含字母';
    if (!/[0-9]/.test(password)) return '密码需包含数字';
    return null;
  },

  _sessionFromAuth(data) {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      user: data.user,
    };
  },

  async _saveSessionFromAuth(data) {
    await this._setSession(this._sessionFromAuth(data));
  },

  async signUp(email, password) {
    this._checkRateLimit();
    const passwordError = this._validatePassword(password);
    if (passwordError) throw new Error(passwordError);

    const currentSession = await this._ensureValidSession();
    const anonymousSession = this.isAnonymousSession(currentSession) ? currentSession : null;

    const res = await fetch(`${this.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: this._publicHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(this._humanError(data) || '注册失败');
    }

    if (!data.access_token) {
      return {
        ok: true,
        requiresConfirm: true,
        keptAnonymousIdentity: !!anonymousSession,
      };
    }

    const nextSession = this._sessionFromAuth(data);
    const migration = anonymousSession
      ? await this._migrateAnonymousData(anonymousSession, nextSession)
      : { bloggers: 0, notes: 0, aiReports: 0 };

    await this._setSession(nextSession);
    return {
      ok: true,
      requiresConfirm: false,
      migration,
    };
  },

  async signIn(email, password) {
    this._checkRateLimit();

    const currentSession = await this._ensureValidSession();
    const anonymousSession = this.isAnonymousSession(currentSession) ? currentSession : null;

    const res = await fetch(`${this.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: this._publicHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(this._humanError(data) || '登录失败');
    }

    const nextSession = this._sessionFromAuth(data);
    const migration = anonymousSession
      ? await this._migrateAnonymousData(anonymousSession, nextSession)
      : { bloggers: 0, notes: 0, aiReports: 0 };

    await this._setSession(nextSession);
    return { ok: true, migration };
  },

  async signOut() {
    const session = await this.getSession();
    if (session?.access_token) {
      await fetch(`${this.SUPABASE_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          ...this._publicHeaders(),
          Authorization: `Bearer ${session.access_token}`,
        },
      }).catch(() => {});
    }
    await this._setSession(null);
  },

  async ensureAnonymousSession() {
    const existing = await this._ensureValidSession();
    if (existing) return existing;

    const installId = await this.getInstallId();
    const res = await fetch(`${this.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: this._publicHeaders(),
      body: JSON.stringify({
        data: {
          install_id: installId,
          source: 'xhs-claw-studio-extension',
        },
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(
        this._humanError(data) || '匿名云身份创建失败，请检查 Supabase 是否已开启 Anonymous Sign-Ins'
      );
    }
    await this._saveSessionFromAuth(data);
    return this.getSession();
  },

  async ensureUploadSession() {
    const session = await this._ensureValidSession();
    if (session) return session;
    return this.ensureAnonymousSession();
  },

  async _refreshToken() {
    const session = await this.getSession();
    if (!session?.refresh_token) return null;

    const res = await fetch(`${this.SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: this._publicHeaders(),
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.warn('[CloudSync] refresh failed, sign-out:', data);
      await this._setSession(null);
      return null;
    }

    const newSession = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      user: data.user || session.user,
    };
    await this._setSession(newSession);
    return newSession;
  },

  async _ensureValidSession() {
    let session = await this.getSession();
    if (!session) return null;
    if (session.expires_at && Date.now() > session.expires_at - 60000) {
      session = await this._refreshToken();
    }
    return session;
  },

  _publicHeaders() {
    return {
      'Content-Type': 'application/json',
      apikey: this.SUPABASE_KEY,
    };
  },

  _headersForSession(session, extras = {}) {
    return {
      'Content-Type': 'application/json',
      apikey: this.SUPABASE_KEY,
      Authorization: `Bearer ${session.access_token}`,
      ...extras,
    };
  },

  async _authedHeaders() {
    const session = await this._ensureValidSession();
    if (!session) throw new Error('未建立云端身份');
    return this._headersForSession(session);
  },

  _humanError(data) {
    if (!data) return null;
    const message = data.error_description || data.msg || data.message || data.error;
    if (!message) return null;

    if (/Email not confirmed/i.test(message)) {
      return '邮箱未验证，请查收邮箱中的验证邮件后再登录。';
    }
    if (/Invalid login credentials/i.test(message)) return '邮箱或密码错误';
    if (/User already registered/i.test(message)) return '此邮箱已注册，请直接登录';
    if (/Password should be at least/i.test(message)) return '密码至少 8 位，需包含字母和数字';
    if (/Unable to validate email/i.test(message)) return '邮箱格式不正确';
    if (/Anonymous sign-?ins are disabled/i.test(message)) {
      return '当前 Supabase 未开启匿名登录，请先在 Auth 配置里开启 Anonymous Sign-Ins';
    }
    return message;
  },

  async _fetchAllRowsWithSession(session, table, select = '*') {
    const rows = [];
    const limit = 1000;
    let offset = 0;

    while (true) {
      const url =
        `${this.SUPABASE_URL}/rest/v1/${table}` +
        `?select=${encodeURIComponent(select)}` +
        `&order=id.asc&limit=${limit}&offset=${offset}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: this._headersForSession(session),
      });
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(`读取 ${table} 失败: ${this._truncErr(txt)}`);
      }
      const chunk = await res.json();
      rows.push(...chunk);
      if (chunk.length < limit) break;
      offset += limit;
    }

    return rows;
  },

  async _migrateAnonymousData(oldSession, newSession) {
    if (!oldSession?.user?.id || !newSession?.user?.id) {
      return { bloggers: 0, notes: 0, aiReports: 0 };
    }
    if (!this.isAnonymousSession(oldSession)) {
      return { bloggers: 0, notes: 0, aiReports: 0 };
    }
    if (oldSession.user.id === newSession.user.id) {
      return { bloggers: 0, notes: 0, aiReports: 0 };
    }

    const [oldBloggers, oldNotes, oldAiReports] = await Promise.all([
      this._fetchAllRowsWithSession(oldSession, 'bloggers'),
      this._fetchAllRowsWithSession(oldSession, 'notes'),
      this._fetchAllRowsWithSession(oldSession, 'ai_reports'),
    ]);

    const newHeaders = this._headersForSession(newSession, {
      Prefer: 'resolution=merge-duplicates,return=representation',
    });
    const oldHeaders = this._headersForSession(oldSession);
    const newUserId = newSession.user.id;

    const oldBloggerIdToXhs = new Map();
    oldBloggers.forEach((row) => {
      oldBloggerIdToXhs.set(row.id, row.xhs_user_id);
    });

    const newBloggerIdByXhs = new Map();
    if (oldBloggers.length > 0) {
      const bloggerRows = oldBloggers.map(({ id, user_id, ...row }) => ({
        ...row,
        user_id: newUserId,
        updated_at: new Date().toISOString(),
      }));

      const bloggerRes = await fetch(
        `${this.SUPABASE_URL}/rest/v1/bloggers?on_conflict=user_id,xhs_user_id`,
        { method: 'POST', headers: newHeaders, body: JSON.stringify(bloggerRows) }
      );
      if (!bloggerRes.ok) {
        const txt = await bloggerRes.text();
        throw new Error(`匿名数据迁移失败（博主）: ${this._truncErr(txt)}`);
      }
      const insertedBloggers = await bloggerRes.json();
      insertedBloggers.forEach((row) => {
        newBloggerIdByXhs.set(row.xhs_user_id, row.id);
      });
    }

    let migratedNotes = 0;
    if (oldNotes.length > 0) {
      const noteRows = oldNotes
        .map(({ id, user_id, ...row }) => {
          const xhsUserId = oldBloggerIdToXhs.get(row.blogger_id);
          const newBloggerId = xhsUserId ? newBloggerIdByXhs.get(xhsUserId) : null;
          if (!newBloggerId) return null;
          return {
            ...row,
            user_id: newUserId,
            blogger_id: newBloggerId,
            updated_at: new Date().toISOString(),
          };
        })
        .filter(Boolean);

      for (let i = 0; i < noteRows.length; i += 100) {
        const chunk = noteRows.slice(i, i + 100);
        const noteRes = await fetch(
          `${this.SUPABASE_URL}/rest/v1/notes?on_conflict=user_id,xhs_note_id`,
          { method: 'POST', headers: newHeaders, body: JSON.stringify(chunk) }
        );
        if (!noteRes.ok) {
          const txt = await noteRes.text();
          throw new Error(`匿名数据迁移失败（笔记）: ${this._truncErr(txt)}`);
        }
        migratedNotes += chunk.length;
      }
    }

    let migratedAiReports = 0;
    if (oldAiReports.length > 0) {
      const aiRows = oldAiReports.map(({ id, user_id, ...row }) => ({
        ...row,
        user_id: newUserId,
        updated_at: new Date().toISOString(),
      }));
      const aiRes = await fetch(
        `${this.SUPABASE_URL}/rest/v1/ai_reports?on_conflict=user_id,scope,scope_key`,
        { method: 'POST', headers: newHeaders, body: JSON.stringify(aiRows) }
      );
      if (!aiRes.ok) {
        const txt = await aiRes.text();
        throw new Error(`匿名数据迁移失败（AI 报告）: ${this._truncErr(txt)}`);
      }
      migratedAiReports = aiRows.length;
    }

    await fetch(
      `${this.SUPABASE_URL}/rest/v1/ai_reports?user_id=eq.${oldSession.user.id}`,
      { method: 'DELETE', headers: oldHeaders }
    ).catch(() => {});
    await fetch(
      `${this.SUPABASE_URL}/rest/v1/bloggers?user_id=eq.${oldSession.user.id}`,
      { method: 'DELETE', headers: oldHeaders }
    ).catch(() => {});

    return {
      bloggers: oldBloggers.length,
      notes: migratedNotes,
      aiReports: migratedAiReports,
    };
  },

  // ========== 同步：单个博主 ==========
  async syncBlogger(bloggerData) {
    const session = await this.ensureUploadSession();
    const userId = session.user.id;

    const totalLikes = bloggerData.notes.reduce((sum, note) => sum + (note.likes || 0), 0);
    const totalCollects = bloggerData.notes.reduce((sum, note) => sum + (note.collects || 0), 0);
    const totalComments = bloggerData.notes.reduce((sum, note) => sum + (note.commentCount || 0), 0);

    const bloggerRow = {
      user_id: userId,
      xhs_user_id: bloggerData.userId,
      nickname: bloggerData.nickname || null,
      avatar: bloggerData.avatar || null,
      profile_url: bloggerData.profileUrl || null,
      follower_count: bloggerData.stats?.followerCount ?? null,
      following_count: bloggerData.stats?.followingCount ?? null,
      note_count: bloggerData.notes.length,
      total_likes: totalLikes,
      total_collects: totalCollects,
      total_comments: totalComments,
      scraped_at: new Date(bloggerData.scrapedAt || Date.now()).toISOString(),
      updated_at: new Date().toISOString(),
    };

    const headers = this._headersForSession(session, {
      Prefer: 'resolution=merge-duplicates,return=representation',
    });

    const bloggerRes = await fetch(
      `${this.SUPABASE_URL}/rest/v1/bloggers?on_conflict=user_id,xhs_user_id`,
      { method: 'POST', headers, body: JSON.stringify(bloggerRow) }
    );
    if (!bloggerRes.ok) {
      const txt = await bloggerRes.text();
      throw new Error(`博主同步失败: ${this._truncErr(txt)}`);
    }

    const bloggerResult = await bloggerRes.json();
    const cloudBloggerId = bloggerResult[0]?.id;
    if (!cloudBloggerId) throw new Error('博主同步失败：未返回 cloud id');

    const noteRows = bloggerData.notes
      .map((note) => ({
        user_id: userId,
        blogger_id: cloudBloggerId,
        xhs_note_id: this._extractNoteId(note),
        title: note.title || null,
        content: note.content || null,
        tags: Array.isArray(note.tags) ? note.tags : [],
        images: Array.isArray(note.images) ? note.images : [],
        cover: note.images?.[0] || null,
        is_video: !!(note.video || note.isVideo),
        likes: note.likes || 0,
        collects: note.collects || 0,
        comment_count: note.commentCount || (Array.isArray(note.comments) ? note.comments.length : 0),
        publish_time: note.publishTimestamp ? new Date(note.publishTimestamp).toISOString() : null,
        publish_text: note.publishTime || note.publish_time || null,
        note_url: note.noteUrl || null,
        scraped_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
      .filter((note) => note.xhs_note_id);

    let synced = 0;
    const skipped = bloggerData.notes.length - noteRows.length;
    for (let i = 0; i < noteRows.length; i += 50) {
      const chunk = noteRows.slice(i, i + 50);
      const noteRes = await fetch(
        `${this.SUPABASE_URL}/rest/v1/notes?on_conflict=user_id,xhs_note_id`,
        { method: 'POST', headers, body: JSON.stringify(chunk) }
      );
      if (!noteRes.ok) {
        const txt = await noteRes.text();
        throw new Error(`笔记同步失败 (chunk ${Math.floor(i / 50) + 1}): ${this._truncErr(txt)}`);
      }
      synced += chunk.length;
    }

    return {
      bloggerCloudId: cloudBloggerId,
      noteCount: synced,
      skipped,
      totalAttempted: bloggerData.notes.length,
      sessionKind: this.isAnonymousSession(session) ? 'anonymous' : 'email',
    };
  },

  _extractNoteId(note) {
    if (note.id) return String(note.id);
    if (note.noteId) return String(note.noteId);
    if (note.noteUrl) {
      const match = note.noteUrl.match(/\/(?:explore|discovery\/item)\/([a-f0-9]+)/);
      if (match) return match[1];
    }
    // 后台导入的笔记没有 noteId，用 backendKey 生成稳定的合成 ID
    if (note.isBackendOnly && note.backendKey) {
      return 'be_' + this._simpleHash(note.backendKey);
    }
    return null;
  },

  // 简单哈希：把字符串转成 12 位十六进制，足够做去重 key
  _simpleHash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return ((h2 >>> 0) * 0x100000000 + (h1 >>> 0)).toString(16).padStart(12, '0');
  },

  _truncErr(txt) {
    return (txt || '').slice(0, 240);
  },

  // ========== 同步：全部博主 ==========
  async syncAll(progressCallback) {
    await this.ensureUploadSession();
    const index = await DATA_STORE.getBloggerIndex();
    let bloggerCount = 0;
    let totalNotes = 0;
    const errors = [];

    for (let i = 0; i < index.length; i += 1) {
      const entry = index[i];
      try {
        progressCallback?.({
          current: i + 1,
          total: index.length,
          bloggerName: entry.nickname,
        });
        const blogger = await DATA_STORE.getBloggerData(entry.userId);
        if (!blogger || !blogger.notes?.length) continue;
        const result = await this.syncBlogger(blogger);
        totalNotes += result.noteCount;
        bloggerCount += 1;
      } catch (e) {
        console.error('[CloudSync] blogger sync failed:', entry.userId, e);
        errors.push({ userId: entry.userId, nickname: entry.nickname, error: e.message });
      }
    }

    let aiReportCount = 0;
    try {
      aiReportCount = await this.syncAllAiReports();
    } catch (e) {
      console.warn('[CloudSync] AI reports sync failed:', e);
    }

    await chrome.storage.local.set({ cloudSyncLastAt: Date.now() });
    return { bloggerCount, totalNotes, aiReportCount, errors };
  },

  async getLastSyncAt() {
    const data = await chrome.storage.local.get('cloudSyncLastAt');
    return data.cloudSyncLastAt || null;
  },

  // ========== 远端统计 ==========
  async getRemoteStats() {
    const session = await this._ensureValidSession();
    if (!session) return { bloggers: 0, notes: 0 };

    const headers = this._headersForSession(session, { Prefer: 'count=exact' });

    const fetchCount = async (table) => {
      const res = await fetch(
        `${this.SUPABASE_URL}/rest/v1/${table}?select=id&limit=1`,
        { method: 'GET', headers }
      );
      if (!res.ok) {
        console.warn('[CloudSync] count failed for', table, res.status);
        return 0;
      }
      const range = res.headers.get('content-range') || '';
      const match = range.match(/\/(\d+|\*)$/);
      if (!match || match[1] === '*') return 0;
      return parseInt(match[1], 10);
    };

    const [bloggers, notes] = await Promise.all([fetchCount('bloggers'), fetchCount('notes')]);
    return { bloggers, notes };
  },

  // ========== AI 报告同步 ==========
  async syncAiReport(scopeKey, content, scope = 'single', model = 'deepseek') {
    const session = await this.ensureUploadSession();
    const userId = session.user.id;

    const row = {
      user_id: userId,
      scope,
      scope_key: scopeKey,
      content,
      model,
      updated_at: new Date().toISOString(),
    };

    const headers = this._headersForSession(session, {
      Prefer: 'resolution=merge-duplicates,return=representation',
    });

    const res = await fetch(
      `${this.SUPABASE_URL}/rest/v1/ai_reports?on_conflict=user_id,scope,scope_key`,
      { method: 'POST', headers, body: JSON.stringify(row) }
    );

    if (!res.ok) {
      const txt = await res.text();
      console.warn('[CloudSync] AI report sync failed:', this._truncErr(txt));
      return null;
    }
    const result = await res.json();
    return result[0] || null;
  },

  async getCloudAiReport(scopeKey, scope = 'single') {
    const session = await this._ensureValidSession();
    if (!session) return null;

    const res = await fetch(
      `${this.SUPABASE_URL}/rest/v1/ai_reports?scope=eq.${encodeURIComponent(scope)}&scope_key=eq.${encodeURIComponent(scopeKey)}&limit=1`,
      { method: 'GET', headers: this._headersForSession(session) }
    );

    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  },

  async syncAllAiReports() {
    const session = await this.ensureUploadSession();
    if (!session) return 0;

    const allData = await chrome.storage.local.get(null);
    const reportKeys = Object.keys(allData).filter((key) => key.startsWith('aiReport_'));
    let synced = 0;

    for (const key of reportKeys) {
      const scopeKey = key.replace('aiReport_', '');
      const reportData = allData[key];
      const content = typeof reportData === 'string' ? reportData : reportData?.content;
      if (!content) continue;
      const scope = scopeKey.startsWith('compare_')
        ? 'compare'
        : scopeKey.startsWith('section_')
          ? 'section'
          : 'single';
      try {
        await this.syncAiReport(scopeKey, content, scope);
        synced += 1;
      } catch (e) {
        console.warn('[CloudSync] AI report sync failed for', scopeKey, e);
      }
    }
    return synced;
  },

  // ========== 删除云端数据 ==========
  async clearCloudData() {
    const session = await this._ensureValidSession();
    if (!session) throw new Error('暂无可清理的云端身份');

    const headers = this._headersForSession(session);
    await fetch(
      `${this.SUPABASE_URL}/rest/v1/ai_reports?user_id=eq.${session.user.id}`,
      { method: 'DELETE', headers }
    ).catch(() => {});

    const res = await fetch(
      `${this.SUPABASE_URL}/rest/v1/bloggers?user_id=eq.${session.user.id}`,
      { method: 'DELETE', headers }
    );
    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`删除云端数据失败: ${this._truncErr(txt)}`);
    }
  },
};
