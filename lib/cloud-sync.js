// 云同步 v1（v2.8.0）— Supabase REST 直连，无 SDK 依赖
// 数据流：本地 chrome.storage.local 始终是 source of truth，后台增量上传到 Supabase

const CLOUD_SYNC = {
  SUPABASE_URL: 'https://adiasillxxfqtduwngdp.supabase.co',
  SUPABASE_KEY: 'sb_publishable_HsI40sZWRX5dV55oaN5K8w_H-G0GIgf',

  // ========== 会话管理 ==========
  async getSession() {
    const data = await chrome.storage.local.get('cloudSyncSession');
    return data.cloudSyncSession || null;
  },

  async _setSession(session) {
    if (session) {
      await chrome.storage.local.set({ cloudSyncSession: session });
    } else {
      await chrome.storage.local.remove('cloudSyncSession');
    }
  },

  async getUser() {
    const s = await this.getSession();
    return s?.user || null;
  },

  async isLoggedIn() {
    const s = await this.getSession();
    return !!s?.access_token;
  },

  // ========== 认证（email + password）==========

  _authAttempts: [],

  _checkRateLimit() {
    const now = Date.now();
    this._authAttempts = this._authAttempts.filter(t => now - t < 60000);
    if (this._authAttempts.length >= 5) {
      throw new Error('操作过于频繁，请 1 分钟后重试');
    }
    this._authAttempts.push(now);
  },

  _validatePassword(pwd) {
    if (!pwd || pwd.length < 8) return '密码至少 8 位';
    if (!/[a-zA-Z]/.test(pwd)) return '密码需包含字母';
    if (!/[0-9]/.test(pwd)) return '密码需包含数字';
    return null;
  },

  async signUp(email, password) {
    this._checkRateLimit();
    const pwdErr = this._validatePassword(password);
    if (pwdErr) throw new Error(pwdErr);

    const res = await fetch(`${this.SUPABASE_URL}/auth/v1/signup`, {
      method: 'POST',
      headers: this._publicHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(this._humanError(data) || '注册失败');
    }
    if (data.access_token) {
      await this._saveSessionFromAuth(data);
      return { ok: true, requiresConfirm: false };
    }
    // 用户已创建但 dashboard 启用了 confirm email
    return { ok: true, requiresConfirm: true };
  },

  async signIn(email, password) {
    this._checkRateLimit();

    const res = await fetch(`${this.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: this._publicHeaders(),
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(this._humanError(data) || '登录失败');
    }
    await this._saveSessionFromAuth(data);
    return { ok: true };
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

  async _saveSessionFromAuth(data) {
    await this._setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      user: data.user,
    });
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
    // token 还有 < 60s 时提前刷新
    if (session.expires_at && Date.now() > session.expires_at - 60000) {
      session = await this._refreshToken();
    }
    return session;
  },

  _publicHeaders() {
    return {
      'Content-Type': 'application/json',
      'apikey': this.SUPABASE_KEY,
    };
  },

  async _authedHeaders() {
    const session = await this._ensureValidSession();
    if (!session) throw new Error('未登录');
    return {
      'Content-Type': 'application/json',
      'apikey': this.SUPABASE_KEY,
      'Authorization': `Bearer ${session.access_token}`,
    };
  },

  _humanError(data) {
    if (!data) return null;
    const msg = data.error_description || data.msg || data.message || data.error;
    if (!msg) return null;
    // 常见错误中文化
    if (/Email not confirmed/i.test(msg)) {
      return '邮箱未验证，请查收注册邮箱中的验证邮件，点击链接完成验证后重新登录。';
    }
    if (/Invalid login credentials/i.test(msg)) return '邮箱或密码错误';
    if (/User already registered/i.test(msg)) return '此邮箱已注册，请直接登录';
    if (/Password should be at least/i.test(msg)) return '密码至少 8 位，需包含字母和数字';
    if (/Unable to validate email/i.test(msg)) return '邮箱格式不正确';
    return msg;
  },

  // ========== 同步：单个博主 ==========
  async syncBlogger(bloggerData) {
    const session = await this._ensureValidSession();
    if (!session) throw new Error('未登录');
    const userId = session.user.id;

    const totalLikes = bloggerData.notes.reduce((s, n) => s + (n.likes || 0), 0);
    const totalCollects = bloggerData.notes.reduce((s, n) => s + (n.collects || 0), 0);
    const totalComments = bloggerData.notes.reduce((s, n) => s + (n.commentCount || 0), 0);

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

    const headers = {
      ...(await this._authedHeaders()),
      'Prefer': 'resolution=merge-duplicates,return=representation',
    };

    // upsert blogger
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

    // upsert notes 分批 50 条
    const noteRows = bloggerData.notes.map(n => ({
      user_id: userId,
      blogger_id: cloudBloggerId,
      xhs_note_id: this._extractNoteId(n),
      title: n.title || null,
      content: n.content || null,
      tags: Array.isArray(n.tags) ? n.tags : [],
      images: Array.isArray(n.images) ? n.images : [],
      cover: n.images?.[0] || null,
      is_video: !!(n.video || n.isVideo),
      likes: n.likes || 0,
      collects: n.collects || 0,
      comment_count: n.commentCount || (Array.isArray(n.comments) ? n.comments.length : 0),
      publish_time: n.publishTimestamp ? new Date(n.publishTimestamp).toISOString() : null,
      publish_text: n.publishTime || n.publish_time || null,
      note_url: n.noteUrl || null,
      scraped_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })).filter(n => n.xhs_note_id);

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
    };
  },

  _extractNoteId(note) {
    if (note.id) return String(note.id);
    if (note.noteId) return String(note.noteId);
    if (note.noteUrl) {
      const m = note.noteUrl.match(/\/(?:explore|discovery\/item)\/([a-f0-9]+)/);
      if (m) return m[1];
    }
    return null;
  },

  _truncErr(txt) {
    return (txt || '').slice(0, 240);
  },

  // ========== 同步：全部博主 ==========
  async syncAll(progressCallback) {
    const session = await this._ensureValidSession();
    if (!session) throw new Error('未登录');
    const index = await DATA_STORE.getBloggerIndex();
    let bloggerCount = 0;
    let totalNotes = 0;
    const errors = [];

    for (let i = 0; i < index.length; i++) {
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
        bloggerCount++;
      } catch (e) {
        console.error('[CloudSync] blogger sync failed:', entry.userId, e);
        errors.push({ userId: entry.userId, nickname: entry.nickname, error: e.message });
      }
    }

    // 同步 AI 报告缓存
    let aiReportCount = 0;
    try {
      aiReportCount = await this.syncAllAiReports();
    } catch (e) {
      console.warn('[CloudSync] AI reports sync failed:', e);
    }

    // 记录最后一次同步时间
    await chrome.storage.local.set({ cloudSyncLastAt: Date.now() });

    return { bloggerCount, totalNotes, aiReportCount, errors };
  },

  async getLastSyncAt() {
    const data = await chrome.storage.local.get('cloudSyncLastAt');
    return data.cloudSyncLastAt || null;
  },

  // ========== 远端统计（用于"我的数据"面板）==========
  async getRemoteStats() {
    const baseHeaders = await this._authedHeaders();
    const headers = {
      ...baseHeaders,
      'Prefer': 'count=exact',
    };

    // 用 limit=1 + count=exact 拿总数（content-range: 0-0/123），不用拉全表
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
      const m = range.match(/\/(\d+|\*)$/);
      if (!m || m[1] === '*') return 0;
      return parseInt(m[1], 10);
    };

    const [bloggers, notes] = await Promise.all([
      fetchCount('bloggers'),
      fetchCount('notes'),
    ]);

    return { bloggers, notes };
  },

  // ========== AI 报告同步 ==========
  async syncAiReport(scopeKey, content, scope = 'single', model = 'deepseek') {
    const session = await this._ensureValidSession();
    if (!session) return null;
    const userId = session.user.id;

    const row = {
      user_id: userId,
      scope,
      scope_key: scopeKey,
      content,
      model,
      updated_at: new Date().toISOString(),
    };

    const headers = {
      ...(await this._authedHeaders()),
      'Prefer': 'resolution=merge-duplicates,return=representation',
    };

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

    const headers = await this._authedHeaders();
    const res = await fetch(
      `${this.SUPABASE_URL}/rest/v1/ai_reports?scope=eq.${encodeURIComponent(scope)}&scope_key=eq.${encodeURIComponent(scopeKey)}&limit=1`,
      { method: 'GET', headers }
    );

    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  },

  async syncAllAiReports() {
    const session = await this._ensureValidSession();
    if (!session) return 0;

    // 找本地所有 aiReport_* 缓存
    const allData = await chrome.storage.local.get(null);
    const reportKeys = Object.keys(allData).filter(k => k.startsWith('aiReport_'));
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
        synced++;
      } catch (e) {
        console.warn('[CloudSync] AI report sync failed for', scopeKey, e);
      }
    }
    return synced;
  },

  // ========== 删除云端数据 ==========
  async clearCloudData() {
    const session = await this._ensureValidSession();
    if (!session) throw new Error('未登录');
    const headers = await this._authedHeaders();
    // 删 ai_reports（无外键关联，需要单独删）
    await fetch(
      `${this.SUPABASE_URL}/rest/v1/ai_reports?user_id=eq.${session.user.id}`,
      { method: 'DELETE', headers }
    ).catch(() => {});
    // 删 bloggers（cascade 会连带删 notes）
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
