// 单篇小红书笔记内容抓取 Content Script
// 支持直接笔记页面、浮层/模态窗口、个人主页批量点击抓取

(function () {
  // 防止重复注入
  if (window.__xhsNoteScraper) return;
  window.__xhsNoteScraper = true;

  // 埋点转发：content script 无法直接访问 lib/analytics.js，
  // 通过 background service worker 中转上报
  let _analyticsErrorSamples = 0;
  function trackAnalytics(eventName, props) {
    try {
      chrome.runtime.sendMessage({
        action: 'analytics_track',
        eventName,
        props: props || {},
      }).catch(() => {});
    } catch {}
  }
  // 采样上报抓取错误类型（避免每次失败都发事件造成噪音）
  function trackSampledScrapeError(errorMsg) {
    _analyticsErrorSamples++;
    // 第 1、5、20、50 次错误各上报一次，用于了解错误类型分布
    if ([1, 5, 20, 50].includes(_analyticsErrorSamples)) {
      trackAnalytics('scrape_error', {
        mode: 'profile_item',
        error_type: String(errorMsg || 'unknown').slice(0, 60),
        error_sample_n: _analyticsErrorSamples,
      });
    }
  }

  // ========== 容器检测（浮层 or 全页面）==========

  function getNoteContainer() {
    // 浮层/模态窗选择器（从个人主页点击笔记时的侧边栏）
    const floatSelectors = [
      '.note-detail-mask',
      '.detail-window',
      '[class*="DetailWindow"]',
      '[class*="SideModal"]',
      '[class*="side-modal"]',
      '.modal-container',
      '[role="dialog"]',
      '#noteContainer',
      '[class*="note-detail"]',
    ];

    for (const sel of floatSelectors) {
      const el = document.querySelector(sel);
      if (el && el.offsetWidth > 0) return el;
    }

    // 没有浮层，用整个 document
    return document;
  }

  function q(selector) {
    const container = getNoteContainer();
    return container.querySelector(selector);
  }

  function qAll(selector) {
    const container = getNoteContainer();
    return container.querySelectorAll(selector);
  }

  // ========== 笔记ID提取 ==========

  function getNoteId() {
    const path = window.location.pathname;
    const match = path.match(/\/explore\/([a-f0-9]+)/);
    if (match) return match[1];
    const match2 = path.match(/\/discovery\/item\/([a-f0-9]+)/);
    if (match2) return match2[1];
    // 个人主页点击打开笔记: /user/profile/{userId}/{noteId}
    const match3 = path.match(/\/user\/profile\/[a-f0-9]+\/([a-f0-9]+)/);
    if (match3) return match3[1];
    return null;
  }

  // ========== 正文提取 ==========

  function getContent() {
    const selectors = [
      '#detail-desc',
      '.note-content .desc',
      '[class*="detail-desc"]',
      '.desc .note-text',
      '[id*="detail-desc"]',
      '[class*="note-scroller"] .desc',
      '[class*="note-scroller"] [class*="desc"]',
      '.desc',
      '[class*="content"] .desc',
      '[class*="desc"]',
      '.note-text',
    ];

    for (const sel of selectors) {
      const el = q(sel);
      if (!el) continue;

      const spans = el.querySelectorAll('span');
      if (spans.length > 1) {
        const text = Array.from(spans).map(s => s.textContent.trim()).filter(Boolean).join('\n');
        if (text.length >= 5) return text;
      }
      const text = el.innerText?.trim() || el.textContent?.trim() || '';
      if (text.length >= 5) return text;
    }
    return '';
  }

  // ========== 标题提取 ==========

  function getTitle() {
    const selectors = [
      '#detail-title',
      '[class*="detail-title"]',
      '[class*="note-scroller"] .title',
      '.title',
      '[class*="title"]',
      'h1',
    ];
    for (const sel of selectors) {
      const el = q(sel);
      if (el) {
        const text = el.textContent.trim();
        if (text.length >= 2 && text.length < 200) return text;
      }
    }

    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) return ogTitle.getAttribute('content') || '';

    return '';
  }

  // ========== 标签/话题提取 ==========

  function getTags() {
    const tags = new Set();

    const selectors = [
      'a[href*="/page/topics/"]',
      'a[href*="/search_result/"]',
      '.tag',
      '.topic',
      '[class*="tag"]',
      '[class*="topic"]',
      'a[href*="/topic"]',
      'a[href*="/search"]',
    ];

    for (const sel of selectors) {
      const elements = qAll(sel);
      for (const el of elements) {
        let text = el.textContent.trim();
        if (text.length >= 1 && text.length <= 50) {
          text = text.replace(/^#/, '').trim();
          if (text) tags.add(text);
        }
      }
    }

    if (tags.size === 0) {
      const content = getContent();
      const hashMatches = content.match(/#([^\s#]+)/g);
      if (hashMatches) {
        for (const m of hashMatches) {
          const t = m.replace(/^#/, '').trim();
          if (t.length >= 1 && t.length <= 30) tags.add(t);
        }
      }
    }

    return Array.from(tags);
  }

  // ========== 图片提取 ==========

  function getImagesFromMeta() {
    const images = [];
    const metas = document.querySelectorAll('meta[name="og:image"], meta[property="og:image"]');
    for (const meta of metas) {
      const url = meta.getAttribute('content');
      if (url && url.includes('xhscdn') && url.includes('notes_pre_post')) {
        images.push(url.startsWith('http://') ? url.replace('http://', 'https://') : url);
      }
    }
    return images;
  }

  function getImagesFromDOM() {
    const images = new Set();

    const carouselSelectors = [
      '.swiper-slide .note-slider-img img',
      '.swiper-slide img',
      '.xhs-slider-container img',
      '.note-slider-img img',
      '[class*="slider"] img',
      '[class*="swiper"] img',
    ];

    for (const sel of carouselSelectors) {
      const imgs = qAll(sel);
      for (const img of imgs) {
        const src = img.src || img.dataset.src || img.getAttribute('data-src');
        if (isValidImageSrc(src)) images.add(src);
      }
    }

    if (images.size === 0) {
      const imgs = qAll('img');
      for (const img of imgs) {
        const src = img.src || img.dataset.src;
        if (isValidImageSrc(src) && img.width > 50) {
          images.add(src);
        }
      }
    }

    return Array.from(images);
  }

  function getImages() {
    const metaImages = getImagesFromMeta();
    if (metaImages.length > 0) return metaImages;
    return getImagesFromDOM();
  }

  function isValidImageSrc(src) {
    if (!src) return false;
    if (src.startsWith('data:')) return false;
    if (src.includes('avatar')) return false;
    if (!src.includes('http')) return false;
    return true;
  }

  // ========== 通过轮播滑动获取所有图片 ==========

  async function getAllImagesBySliding() {
    const metaImages = getImagesFromMeta();
    if (metaImages.length > 0) return metaImages;

    const images = new Set();
    const nextBtnSelectors = [
      '.swiper-button-next',
      '[class*="next"]',
      'button[aria-label="next"]',
      '.arrow-right',
    ];

    function collectCurrentImages() {
      const selectors = ['.swiper-slide .note-slider-img img', '.swiper-slide img', '[class*="slider"] img'];
      for (const sel of selectors) {
        const imgs = qAll(sel);
        for (const img of imgs) {
          const src = img.src || img.dataset.src;
          if (isValidImageSrc(src)) images.add(src);
        }
      }
    }

    collectCurrentImages();

    let nextBtn = null;
    for (const sel of nextBtnSelectors) {
      nextBtn = q(sel);
      if (nextBtn) break;
    }

    if (nextBtn) {
      let maxSlides = 20;
      while (maxSlides-- > 0) {
        const isDisabled = nextBtn.classList.contains('swiper-button-disabled') ||
          nextBtn.disabled ||
          nextBtn.style.pointerEvents === 'none' ||
          nextBtn.style.display === 'none';
        if (isDisabled) break;

        nextBtn.click();
        await new Promise(r => setTimeout(r, 500));
        collectCurrentImages();
      }
    }

    return Array.from(images);
  }

  // ========== 评论抓取 ==========

  function getComments() {
    const comments = [];
    const container = getNoteContainer();
    const commentItems = container.querySelectorAll('.comment-item');

    for (const item of commentItems) {
      const contentEl = item.querySelector('.content .note-text');
      const content = contentEl ? contentEl.textContent.trim() : '';

      const authorEl = item.querySelector('.author-wrapper .name, .author-wrapper a.name');
      const author = authorEl ? authorEl.textContent.trim() : '';

      const tagEl = item.querySelector('.author-wrapper .tag');
      const isAuthor = tagEl ? tagEl.textContent.trim() === '作者' : false;

      const dateEl = item.querySelector('.info .date span');
      const time = dateEl ? dateEl.textContent.trim() : '';

      const picEl = item.querySelector('.comment-picture img');
      const picture = picEl ? (picEl.src || '') : '';

      const id = item.id || '';

      if (content || picture) {
        comments.push({ id, author, isAuthor, content, time, picture });
      }
    }

    return comments;
  }

  // ========== 互动数据提取 ==========

  function getMetrics() {
    const result = { likes: 0, collects: 0, comments: 0, shares: 0 };

    const metaMap = {
      'og:xhs:note_like': 'likes',
      'og:xhs:note_collect': 'collects',
      'og:xhs:note_comment': 'comments',
    };

    for (const [metaName, key] of Object.entries(metaMap)) {
      const meta = document.querySelector(`meta[name="${metaName}"]`) ||
        document.querySelector(`meta[property="${metaName}"]`);
      if (meta) {
        const val = parseInt(meta.getAttribute('content'));
        if (!isNaN(val)) result[key] = val;
      }
    }

    if (result.likes === 0 || result.collects === 0 || result.comments === 0) {
      const interactSelectors = [
        '.like-wrapper .count',
        '.collect-wrapper .count',
        '.chat-wrapper .count',
        '[class*="like"] .count',
        '[class*="collect"] .count',
        '[class*="comment"] .count',
      ];

      for (const sel of interactSelectors) {
        const el = q(sel);
        if (!el) continue;
        const val = parseCount(el.textContent);
        if (sel.includes('like') && result.likes === 0) result.likes = val;
        else if (sel.includes('collect') && result.collects === 0) result.collects = val;
        else if ((sel.includes('comment') || sel.includes('chat')) && result.comments === 0) result.comments = val;
      }

      if (result.likes === 0) {
        const container = getNoteContainer();
        const allSpans = container.querySelectorAll('[class*="interact"] span, [class*="engage"] span, [class*="bottom"] span');
        const nums = [];
        for (const sp of allSpans) {
          const v = parseCount(sp.textContent);
          if (v > 0) nums.push(v);
        }
        if (nums.length >= 1 && result.likes === 0) result.likes = nums[0];
        if (nums.length >= 2 && result.collects === 0) result.collects = nums[1];
        if (nums.length >= 3 && result.comments === 0) result.comments = nums[2];
      }
    }

    return result;
  }

  function parseCount(text) {
    if (!text) return 0;
    text = text.trim();
    if (text.includes('万') || text.includes('w')) {
      const num = parseFloat(text);
      return isNaN(num) ? 0 : Math.round(num * 10000);
    }
    if (text.includes('千') || text.includes('k')) {
      const num = parseFloat(text);
      return isNaN(num) ? 0 : Math.round(num * 1000);
    }
    const num = parseInt(text.replace(/,/g, ''));
    return isNaN(num) ? 0 : num;
  }

  // ========== 作者信息 ==========

  function getAuthor() {
    const nameSelectors = [
      '.author-wrapper .username',
      '.author .name',
      '[class*="username"]',
      '[class*="author"] [class*="name"]',
    ];
    const avatarSelectors = [
      '.author-avatar img',
      '.avatar-container img',
      '[class*="avatar"] img',
    ];

    let nickname = '';
    for (const sel of nameSelectors) {
      const el = q(sel);
      if (el) {
        nickname = el.textContent.trim();
        if (nickname) break;
      }
    }

    let avatar = '';
    for (const sel of avatarSelectors) {
      const el = q(sel);
      if (el) {
        avatar = el.src || '';
        if (avatar) break;
      }
    }

    return { nickname, avatar };
  }

  // ========== 发布时间 ==========

  function getPublishTime() {
    const selectors = [
      '[class*="date"]',
      '[class*="time"]',
      '.publish-time',
      'time',
    ];
    for (const sel of selectors) {
      const elements = qAll(sel);
      for (const el of elements) {
        const text = el.textContent.trim();
        if (text.length >= 4 && text.length <= 50 &&
          (text.includes('天') || text.includes('月') || text.includes('年') ||
            text.includes('小时') || text.includes('分钟') || text.includes('昨') ||
            /\d{4}/.test(text) || /\d+[:\/\-]\d+/.test(text))) {
          return text;
        }
      }
    }
    return '';
  }

  // ========== 视频检测 ==========

  function getVideo() {
    const video = q('video');
    if (video) {
      const source = video.querySelector('source');
      return {
        src: video.src || (source ? source.src : ''),
        poster: video.poster || '',
      };
    }
    return null;
  }

  // ========== 主抓取函数 ==========

  async function scrapeNote() {
    await new Promise(r => setTimeout(r, 1500));

    const noteId = getNoteId();
    const title = getTitle();
    const content = getContent();
    const tags = getTags();
    const metrics = getMetrics();
    const author = getAuthor();
    const publishTime = getPublishTime();
    const video = getVideo();
    const commentList = getComments();

    let images;
    try {
      images = await getAllImagesBySliding();
    } catch (e) {
      images = getImages();
    }
    if (images.length === 0) {
      images = getImages();
    }

    const result = {
      noteId,
      title,
      content,
      tags,
      images,
      imageCount: images.length,
      video,
      likes: metrics.likes,
      collects: metrics.collects,
      commentCount: metrics.comments,
      comments: commentList,
      author,
      publishTime,
      publishTimestamp: null, // 单篇 DOM 抓取暂无精确 timestamp，仅相对时间文本
      noteUrl: window.location.href,
      crawlTime: new Date().toLocaleString('zh-CN'),
    };

    // v2.8.2: 缓存封面图为 base64（在 content script 上下文中 Referer 合法）
    await cacheCoverImage(result);

    return result;
  }

  // 将封面图（首图）转为 base64 存入 note.coverBase64
  async function cacheCoverImage(note) {
    const url = note.images?.[0];
    if (!url) return;
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        setTimeout(reject, 5000);
      });
      const canvas = document.createElement('canvas');
      const MAX = 400;
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > MAX || h > MAX) {
        const ratio = Math.min(MAX / w, MAX / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      note.coverBase64 = canvas.toDataURL('image/jpeg', 0.7);
    } catch {
      // 静默失败，不影响主流程
    }
  }

  // ========== 用户主页笔记列表收集 ==========

  function getProfileUserId() {
    const match = window.location.pathname.match(/\/user\/profile\/([a-f0-9]+)/);
    return match ? match[1] : null;
  }

  function isProfilePage() {
    return !!getProfileUserId();
  }

  // ========== 博主主页统计数据（v2.7.0）==========

  function parseChineseNumber(str) {
    if (str == null) return null;
    const s = String(str).replace(/[,\s+]/g, '');
    if (!s) return null;
    let mult = 1;
    let num = s;
    if (s.endsWith('万') || s.endsWith('w') || s.endsWith('W')) {
      mult = 10000;
      num = s.slice(0, -1);
    } else if (s.endsWith('亿')) {
      mult = 100000000;
      num = s.slice(0, -1);
    } else if (s.endsWith('千') || s.endsWith('k') || s.endsWith('K')) {
      mult = 1000;
      num = s.slice(0, -1);
    }
    const f = parseFloat(num);
    return isNaN(f) ? null : Math.round(f * mult);
  }

  // 抓取博主主页的关注 / 粉丝 / 获赞与收藏 + 笔记总数
  function getProfileStats() {
    const stats = {
      followingCount: null,
      followerCount: null,
      likedAndCollectedCount: null,
      totalNoteCount: null,
      redId: null,
      desc: null,
      gender: null,
      ipLocation: null,
    };

    const setIfPresent = (key, value) => {
      if (value == null) return;
      const text = String(value).trim();
      if (!text) return;
      stats[key] = text;
    };

    // 策略 1: 从 __INITIAL_STATE__ 读取（最可靠）
    try {
      for (const script of document.querySelectorAll('script')) {
        const text = script.textContent || '';
        const match = text.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]+?\})\s*;?\s*$/);
        if (!match) continue;
        const raw = match[1].replace(/\bundefined\b/g, 'null');
        const state = JSON.parse(raw);
        const userInfo = state?.user?.userPageData?.basicInfo
          || state?.user?.userInfo
          || state?.user?.basicInfo;
        const interactions = state?.user?.userPageData?.interactions
          || state?.user?.interactions;
        if (userInfo) {
          if (typeof userInfo.fans === 'number') stats.followerCount = userInfo.fans;
          if (typeof userInfo.follows === 'number') stats.followingCount = userInfo.follows;
          // v2.7.1: 补充 profile 字段
          if (userInfo.redId) stats.redId = String(userInfo.redId);
          if (userInfo.desc) stats.desc = String(userInfo.desc);
          if (userInfo.gender != null) stats.gender = userInfo.gender; // 0=未知 1=男 2=女
          if (userInfo.ipLocation) stats.ipLocation = String(userInfo.ipLocation);
          else if (userInfo.fstatus) stats.ipLocation = String(userInfo.fstatus); // 部分版本用 fstatus
        }
        if (Array.isArray(interactions)) {
          for (const it of interactions) {
            const name = it?.name || it?.type || '';
            const count = parseChineseNumber(it?.count);
            if (count == null) continue;
            if (name.includes('关注')) stats.followingCount = count;
            else if (name.includes('粉丝')) stats.followerCount = count;
            else if (name.includes('获赞') || name.includes('收藏')) stats.likedAndCollectedCount = count;
          }
        }
        // 笔记总数
        const noteCount = state?.user?.userPageData?.notes?.length
          || state?.user?.notes?.length;
        if (typeof noteCount === 'number') stats.totalNoteCount = noteCount;
        break;
      }
    } catch {}

    // 策略 1.5: 从页面可见资料区兜底补齐简介 / 小红书号 / IP 属地
    try {
      const textNodes = Array.from(document.querySelectorAll('div, span, p'))
        .map(el => (el.textContent || '').trim())
        .filter(Boolean);

      if (!stats.redId) {
        const redIdText = textNodes.find(text => /小红书号[:：]/.test(text));
        if (redIdText) {
          const match = redIdText.match(/小红书号[:：]\s*([A-Za-z0-9_-]+)/);
          if (match) stats.redId = match[1];
        }
      }

      if (!stats.ipLocation) {
        const ipText = textNodes.find(text => /IP属地[:：]/.test(text));
        if (ipText) {
          const match = ipText.match(/IP属地[:：]\s*([^\s]+)/);
          if (match) stats.ipLocation = match[1];
        }
      }

      if (!stats.desc) {
        const descSelectors = [
          '.user-desc',
          '.user-bio',
          '[class*="user-desc"]',
          '[class*="userDesc"]',
          '[class*="user-bio"]',
          '[class*="desc"]',
          '[class*="bio"]',
        ];
        for (const sel of descSelectors) {
          const el = document.querySelector(sel);
          const text = (el?.textContent || '').trim();
          if (!text) continue;
          if (text.length < 4 || text.length > 200) continue;
          if (/关注|粉丝|获赞|收藏|笔记/.test(text)) continue;
          setIfPresent('desc', text);
          break;
        }
      }
    } catch {}

    // 策略 2: DOM 兜底 — 在常见容器中查找 "X 关注 / X 粉丝 / X 获赞" 文本
    if (stats.followerCount == null || stats.followingCount == null) {
      const containers = document.querySelectorAll(
        '.user-interactions, [class*="user-interaction"], [class*="userInteraction"], .user-info, [class*="user-info"]'
      );
      const seen = new Set();
      const probe = (el) => {
        if (!el || seen.has(el)) return;
        seen.add(el);
        const t = (el.textContent || '').trim();
        // 形如 "1.2万 粉丝" 或 "粉丝 1234"
        const m1 = t.match(/^(\d+(?:\.\d+)?[万亿千wWkK]?)\s*(关注|粉丝|获赞与收藏|获赞)$/);
        const m2 = t.match(/^(关注|粉丝|获赞与收藏|获赞)\s*(\d+(?:\.\d+)?[万亿千wWkK]?)$/);
        const m = m1 || m2;
        if (!m) return;
        const numStr = m1 ? m1[1] : m2[2];
        const label = m1 ? m1[2] : m2[1];
        const n = parseChineseNumber(numStr);
        if (n == null) return;
        if (label === '关注' && stats.followingCount == null) stats.followingCount = n;
        else if (label === '粉丝' && stats.followerCount == null) stats.followerCount = n;
        else if (label.includes('获赞') && stats.likedAndCollectedCount == null) stats.likedAndCollectedCount = n;
      };
      for (const c of containers) {
        c.querySelectorAll('div, span').forEach(probe);
      }
      // 全局兜底：直接找 label，取相邻兄弟
      if (stats.followerCount == null || stats.followingCount == null) {
        document.querySelectorAll('span, div').forEach(el => {
          const t = (el.textContent || '').trim();
          if (t.length > 6) return;
          if (!['关注', '粉丝', '获赞与收藏', '获赞'].includes(t)) return;
          const sibling = el.previousElementSibling || el.nextElementSibling;
          if (!sibling) return;
          const n = parseChineseNumber((sibling.textContent || '').trim());
          if (n == null) return;
          if (t === '关注' && stats.followingCount == null) stats.followingCount = n;
          else if (t === '粉丝' && stats.followerCount == null) stats.followerCount = n;
          else if (t.includes('获赞') && stats.likedAndCollectedCount == null) stats.likedAndCollectedCount = n;
        });
      }
    }

    return stats;
  }

  // 获取笔记列表的 feed 容器（排除推荐区域）
  function getFeedContainer() {
    const selectors = [
      '#userPosting',
      '.user-posting',
      '[class*="user-posting"]',
      '.feeds-container',
      '[class*="feeds-container"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.querySelectorAll('section.note-item').length > 0) return el;
    }
    return document;
  }

  // 收集当前页面上可见的所有笔记卡片（仅该用户的笔记）
  function collectNoteCards() {
    const userId = getProfileUserId();
    if (!userId) return [];

    const cards = [];
    const seen = new Set();
    const container = getFeedContainer();

    const items = container.querySelectorAll('section.note-item');
    for (const item of items) {
      const link = item.querySelector(`a[href*="/user/profile/${userId}/"]`) || item.querySelector('a.cover');
      if (!link) continue;

      const href = link.href || '';
      const match = href.match(new RegExp(`/user/profile/${userId}/([a-f0-9]+)`));
      if (!match) continue;

      const noteId = match[1];
      if (seen.has(noteId)) continue;
      seen.add(noteId);

      const titleEl = item.querySelector('.title span, .title, [class*="title"] span');
      const title = titleEl ? titleEl.textContent.trim() : '';

      const tokenMatch = href.match(/xsec_token=([^&]+)/);
      const token = tokenMatch ? tokenMatch[1] : '';

      cards.push({ noteId, title, originalUrl: href, token });
    }
    return cards;
  }

  // 滚动加载更多笔记
  async function scrollToLoadAll(maxScrolls) {
    const userId = getProfileUserId();
    const limit = maxScrolls || 50;
    let lastCount = 0;
    let noNewCount = 0;

    for (let i = 0; i < limit; i++) {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise(r => setTimeout(r, 1500 + Math.random() * 1000));

      const allItems = document.querySelectorAll('section.note-item');
      let currentCount = 0;
      for (const item of allItems) {
        const link = item.querySelector('a.cover, a[href*="/user/profile/"]');
        if (link && link.href && link.href.includes(`/user/profile/${userId}/`)) {
          currentCount++;
        }
      }

      if (currentCount === lastCount) {
        noNewCount++;
        if (noNewCount >= 3) break;
      } else {
        noNewCount = 0;
      }
      lastCount = currentCount;
    }

    return collectNoteCards();
  }

  // ========== 批量抓取：fetch HTML + 解析 meta 标签（零点击、零导航）==========

  let batchState = {
    isRunning: false,
    stopRequested: false,
    refreshExisting: false,
    results: [],
    errors: [],
    currentIndex: 0,
    totalCount: 0,
    // v3.2: 自适应节流 —— 近期错误窗口（只保留最近 5 个结果 'ok'|'err-<kind>'）
    recentResults: [],
    // 'normal' | 'slow'，由 recentResults 动态切换
    riskLevel: 'normal',
    consecutiveSuccesses: 0,
    // v3.2: 任务中心 —— 当前批次的 job id（跨 popup/sidepanel/notification 追踪）
    jobId: null,
    // 区分"用户手动停止"与"自然完成"
    userStopped: false,
  };

  // 记录一次笔记结果，更新风险等级；返回是否发生等级变化
  function _recordResultAndMaybeAdjustRisk(tag) {
    batchState.recentResults.push(tag);
    if (batchState.recentResults.length > 5) batchState.recentResults.shift();
    const retryableErrors = batchState.recentResults.filter(
      (t) => t === 'err-rate_limit' || t === 'err-network',
    ).length;
    const prev = batchState.riskLevel;
    if (tag === 'ok') {
      batchState.consecutiveSuccesses += 1;
      if (prev === 'slow' && batchState.consecutiveSuccesses >= 3) {
        batchState.riskLevel = 'normal';
      }
    } else {
      batchState.consecutiveSuccesses = 0;
      if (prev === 'normal' && retryableErrors >= 2) {
        batchState.riskLevel = 'slow';
      }
    }
    return batchState.riskLevel !== prev ? { from: prev, to: batchState.riskLevel } : null;
  }

  function _broadcastRiskChange(change) {
    chrome.runtime.sendMessage({
      type: 'batchRiskLevelChanged',
      level: change.to,
      from: change.from,
      reason: change.to === 'slow'
        ? '近期错误偏多，已自动放缓请求速度'
        : '请求恢复正常速度',
    }).catch(() => {});
  }

  // 写一条任务进度到 jobs_index；失败静默，不阻塞批抓主流程
  async function _jobsUpsert(patch) {
    if (typeof JOBS === 'undefined' || !batchState.jobId) return;
    try {
      await JOBS.upsert({ id: batchState.jobId, ...patch });
    } catch {}
  }

  // ========== 断点续传：chrome.storage.local 持久化 ==========

  function getBatchStorageKey() {
    const userId = getProfileUserId();
    return userId ? `batch_${userId}` : null;
  }

  async function saveBatchToStorage(allCards, meta = {}) {
    const key = getBatchStorageKey();
    if (!key) return;
    await chrome.storage.local.set({
      [key]: {
        completedNoteIds: batchState.results.map(r => r.noteId),
        results: batchState.results,
        errors: batchState.errors,
        totalCount: allCards.length,
        refreshExisting: !!meta.refreshExisting,
        updatedAt: Date.now(),
      },
    });
  }

  async function loadBatchFromStorage() {
    const key = getBatchStorageKey();
    if (!key) return null;
    const data = await chrome.storage.local.get(key);
    return data[key] || null;
  }

  async function clearBatchFromStorage() {
    const key = getBatchStorageKey();
    if (!key) return;
    await chrome.storage.local.remove(key);
  }

  // 单次 fetch + 解析；任何异常都抛 error 并附 _classifyInput 供外层分类
  async function _fetchNoteOnce(noteId, token) {
    const url = `https://www.xiaohongshu.com/explore/${noteId}` +
      (token ? `?xsec_token=${token}&xsec_source=pc_user` : '');

    let resp;
    try {
      resp = await fetch(url, {
        credentials: 'include',
        headers: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Referer': window.location.href,
        },
      });
    } catch (networkErr) {
      // fetch reject（DNS/断网/CORS 等）
      throw networkErr;
    }

    // 302 → 人机验证
    if (resp.redirected && resp.url.includes('/website-login/captcha')) {
      const err = new Error('CAPTCHA_REQUIRED');
      err._classifyInput = { resp };
      throw err;
    }

    // 非 2xx：先读 html 兜底识别特殊页面，否则按 HTTP 状态分类
    if (!resp.ok) {
      const err = new Error(`HTTP ${resp.status}`);
      err._classifyInput = { resp };
      throw err;
    }

    const html = await resp.text();

    // 兜底：某些情况下服务端直接返回验证页 HTML（没走 302）
    if (html.includes('/website-login/captcha') && html.includes('verifyUuid')) {
      const err = new Error('CAPTCHA_REQUIRED');
      err._classifyInput = { html };
      throw err;
    }

    // 笔记被限制/删除：交给分类器归类为 not_found 或 restricted
    if (html.includes('当前笔记暂时无法浏览') || html.includes('请打开小红书App扫码查看')) {
      const err = new Error('笔记被限制访问');
      err._classifyInput = { html };
      throw err;
    }

    const doc = new DOMParser().parseFromString(html, 'text/html');

    // 从 meta 标签提取
    const getMeta = (name) => {
      const el = doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return el ? el.getAttribute('content') || '' : '';
    };

    const title = getMeta('og:title').replace(/\s*-\s*小红书$/, '');
    const description = getMeta('description');
    const keywords = getMeta('keywords');

    // 图片（多个 og:image）
    const images = [];
    doc.querySelectorAll('meta[name="og:image"], meta[property="og:image"]').forEach(meta => {
      const imgUrl = meta.getAttribute('content');
      if (imgUrl) images.push(imgUrl.replace(/^http:\/\//, 'https://'));
    });

    // 互动数据
    const likes = parseInt(getMeta('og:xhs:note_like')) || 0;
    const collects = parseInt(getMeta('og:xhs:note_collect')) || 0;
    const commentCount = parseInt(getMeta('og:xhs:note_comment')) || 0;

    // 标签（从 keywords）
    const tags = keywords ? keywords.split(',').map(t => t.trim()).filter(Boolean) : [];

    // 正文（description 中 \t 分隔段落）
    const content = description.replace(/\t+/g, '\n').trim();

    // 尝试从 __INITIAL_STATE__ 提取更多数据（作者、评论等）
    let author = { nickname: '', avatar: '' };
    let publishTime = '';
    let publishTimestamp = null;  // v2.7.0: 精确到毫秒的 timestamp
    let commentList = [];

    try {
      const stateMatch = html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.+?\})\s*<\/script>/s);
      if (stateMatch) {
        const raw = stateMatch[1].replace(/\bundefined\b/g, 'null');
        const state = JSON.parse(raw);
        const noteMap = state?.note?.noteDetailMap || {};
        const noteData = noteMap[noteId]?.note || Object.values(noteMap)[0]?.note;
        if (noteData) {
          if (noteData.user) {
            author.nickname = noteData.user.nickname || '';
            author.avatar = noteData.user.avatar || '';
          }
          // noteData.time 是毫秒级 timestamp（XHS 内部格式）
          const rawTime = noteData.time || noteData.lastUpdateTime;
          if (typeof rawTime === 'number' && rawTime > 0) {
            publishTimestamp = rawTime;
            publishTime = new Date(rawTime).toLocaleString('zh-CN', {
              year: 'numeric', month: '2-digit', day: '2-digit',
              hour: '2-digit', minute: '2-digit',
            });
          } else if (rawTime) {
            publishTime = String(rawTime);
          }
        }
        // 评论
        const commentData = noteMap[noteId]?.comments || Object.values(noteMap)[0]?.comments;
        if (Array.isArray(commentData)) {
          commentList = commentData.map(c => ({
            id: c.id || '',
            author: c.userInfo?.nickname || '',
            isAuthor: false,
            content: c.content || '',
            time: c.createTime || '',
            picture: '',
          }));
        }
      }
    } catch (e) {
      // __INITIAL_STATE__ 解析失败不影响主流程
    }

    return {
      noteId,
      title: title || null, // null 表示提取失败
      content,
      tags,
      images,
      imageCount: images.length,
      video: null,
      likes,
      collects,
      commentCount,
      comments: commentList,
      author,
      publishTime,
      publishTimestamp,
      noteUrl: url,
      crawlTime: new Date().toLocaleString('zh-CN'),
    };
  }

  // fetch + 解析 + 按分类器自动重试。
  // onRetry({ attempt, waitMs, verdict }) 在重试前触发，调用方可用来更新 UI。
  // 抛出的 error 会带上：code / kind / userMessage / analyticsTag / captchaUrl?
  async function fetchAndParseNote(noteId, token, onRetry) {
    let attempt = 0;
    while (true) {
      try {
        return await _fetchNoteOnce(noteId, token);
      } catch (raw) {
        const input = raw && raw._classifyInput ? raw._classifyInput : { error: raw };
        const verdict = ERROR_CLASSIFIER.classify(input);

        // 不可重试 → 包装成带 kind 的结构化 error
        if (!verdict.retryable) {
          throw _wrapVerdictError(raw, verdict);
        }

        // 可重试：按计划等待后重试
        attempt += 1;
        const waitMs = ERROR_CLASSIFIER.waitMsFor(verdict.kind, attempt);
        if (waitMs <= 0) {
          // 重试次数用尽
          const err = _wrapVerdictError(raw, verdict);
          err.code = (verdict.kind.toUpperCase() + '_EXHAUSTED');
          err.analyticsTag = (verdict.analyticsTag || verdict.kind) + '_exhausted';
          throw err;
        }

        try {
          onRetry?.({ attempt, waitMs, verdict, noteId });
        } catch {}

        await new Promise((r) => setTimeout(r, waitMs));
        // 继续下一轮
      }
    }
  }

  function _wrapVerdictError(raw, verdict) {
    const err = new Error(verdict.userMessage || (raw && raw.message) || '抓取失败');
    err.kind = verdict.kind;
    err.userMessage = verdict.userMessage;
    err.analyticsTag = verdict.analyticsTag;
    if (verdict.kind === 'captcha') {
      err.code = 'CAPTCHA_REQUIRED';
      if (verdict.captchaUrl) err.captchaUrl = verdict.captchaUrl;
    } else {
      err.code = verdict.kind.toUpperCase();
    }
    return err;
  }

  // 批量抓取主循环（fetch 方式 + 分段冷却 + 断点续传）
  async function batchScrapeFromProfile(options) {
    const { cards, minDelay, maxDelay, chunkSize, refreshExisting } = options;
    const chunk = chunkSize || 20;
    const shouldRefreshExisting = !!refreshExisting;
    const profileUserId = getProfileUserId();
    const profileUrl = window.location.href.split('?')[0];
    const existingBlogger = profileUserId && typeof DATA_STORE !== 'undefined'
      ? await DATA_STORE.getBloggerData(profileUserId).catch(() => null)
      : null;
    const existingNotes = Array.isArray(existingBlogger?.notes) ? existingBlogger.notes : [];
    const existingNoteIds = new Set(
      shouldRefreshExisting
        ? []
        : existingNotes.map(note => DATA_STORE?.getNoteKey?.(note)).filter(Boolean)
    );

    // 加载已完成的进度（断点续传）
    const rawSaved = await loadBatchFromStorage();
    const saved = rawSaved?.refreshExisting === shouldRefreshExisting ? rawSaved : null;
    const completedIds = new Set(saved?.completedNoteIds || []);
    const targetCards = shouldRefreshExisting
      ? cards
      : cards.filter(card => !existingNoteIds.has(card.noteId));

    batchState.isRunning = true;
    batchState.stopRequested = false;
    batchState.userStopped = false;
    batchState.refreshExisting = shouldRefreshExisting;
    batchState.results = saved?.results || [];
    batchState.errors = saved?.errors || [];
    batchState.totalCount = targetCards.length;
    batchState.currentIndex = 0;

    // 任务中心：创建 / 更新 job 记录（只在有实际工作时创建，避免空任务刷屏）
    if (targetCards.length > 0 && typeof JOBS !== 'undefined') {
      batchState.jobId = JOBS.generateId();
      await _jobsUpsert({
        userId: profileUserId || null,
        profileUrl,
        nickname: existingBlogger?.nickname || '',
        avatar: existingBlogger?.avatar || '',
        status: JOBS.STATUS.RUNNING,
        total: targetCards.length,
        scraped: batchState.results.length,
        errorCount: batchState.errors.length,
        refreshExisting: shouldRefreshExisting,
      });
    } else {
      batchState.jobId = null;
    }

    let scrapedInChunk = 0;

    for (let i = 0; i < targetCards.length; i++) {
      if (batchState.stopRequested) break;

      const card = targetCards[i];

      // 跳过已完成的笔记
      if (completedIds.has(card.noteId)) continue;

      batchState.currentIndex = i;
      broadcastProgress(batchState.results.length + 1, targetCards.length,
        `正在抓取: ${card.title || card.noteId}`);

      try {
        const result = await fetchAndParseNote(card.noteId, card.token, (retryInfo) => {
          // 每次重试前通知 UI，避免用户以为进度卡住
          chrome.runtime.sendMessage({
            type: 'batchNoteRetrying',
            noteId: card.noteId,
            title: card.title,
            attempt: retryInfo.attempt,
            waitMs: retryInfo.waitMs,
            kind: retryInfo.verdict?.kind,
            reason: retryInfo.verdict?.userMessage,
          }).catch(() => {});
        });

        if (result && result.title) {
          batchState.results.push(result);
          completedIds.add(card.noteId);
          const change = _recordResultAndMaybeAdjustRisk('ok');
          if (change) _broadcastRiskChange(change);
        } else {
          batchState.errors.push({ index: i, title: card.title, error: '页面内容为空', noteId: card.noteId });
          trackSampledScrapeError('empty_content');
          const change = _recordResultAndMaybeAdjustRisk('err-fatal');
          if (change) _broadcastRiskChange(change);
        }
      } catch (e) {
        const kind = e?.kind || 'fatal';
        const analyticsTag = e?.analyticsTag || e?.message || 'unknown';

        // 1) 人机验证 → 暂停批次，等用户手动验证
        if (kind === 'captcha') {
          await saveBatchToStorage(targetCards, { refreshExisting: shouldRefreshExisting });
          batchState.stopRequested = true;
          batchState.isRunning = false;
          await _jobsUpsert({
            status: typeof JOBS !== 'undefined' ? JOBS.STATUS.CAPTCHA_WAIT : 'captcha_wait',
            scraped: batchState.results.length,
            errorCount: batchState.errors.length,
            lastErrorKind: 'captcha',
            captchaUrl: e.captchaUrl || null,
          });
          chrome.runtime.sendMessage({
            type: 'batchCaptchaRequired',
            captchaUrl: e.captchaUrl,
            scraped: batchState.results.length,
            total: targetCards.length,
            remaining: targetCards.filter(c => !completedIds.has(c.noteId)).length,
          }).catch(() => {});
          trackSampledScrapeError('captcha_required');
          return;
        }

        // 2) IP/账号被风控 → 硬停批次，保留进度
        if (kind === 'restricted') {
          await saveBatchToStorage(targetCards, { refreshExisting: shouldRefreshExisting });
          batchState.stopRequested = true;
          batchState.isRunning = false;
          await _jobsUpsert({
            status: typeof JOBS !== 'undefined' ? JOBS.STATUS.FAILED : 'failed',
            scraped: batchState.results.length,
            errorCount: batchState.errors.length,
            lastErrorKind: 'restricted',
            lastErrorMessage: e.userMessage || e.message,
          });
          chrome.runtime.sendMessage({
            type: 'batchRestricted',
            reason: e.userMessage || e.message,
            scraped: batchState.results.length,
            total: targetCards.length,
            remaining: targetCards.filter(c => !completedIds.has(c.noteId)).length,
          }).catch(() => {});
          trackSampledScrapeError('restricted_' + analyticsTag);
          return;
        }

        // 3) 笔记不存在/被删 → 静默跳过（不计入错误数）
        if (kind === 'not_found') {
          trackSampledScrapeError('not_found');
          // 标记为已处理，避免下次续传还会再抓一次
          completedIds.add(card.noteId);
          const change = _recordResultAndMaybeAdjustRisk('ok');
          if (change) _broadcastRiskChange(change);
        } else {
          // 4) 其他（fatal / 超过重试次数的 rate_limit / network）→ 记录错误、继续
          batchState.errors.push({
            index: i,
            title: card.title,
            error: e.userMessage || e.message,
            kind,
            noteId: card.noteId,
          });
          trackSampledScrapeError(analyticsTag);

          // rate_limit 耗尽 → 通知 UI，但不硬停
          if (kind === 'rate_limit') {
            await _jobsUpsert({
              status: typeof JOBS !== 'undefined' ? JOBS.STATUS.RATE_LIMITED : 'rate_limited',
              scraped: batchState.results.length,
              errorCount: batchState.errors.length,
              lastErrorKind: 'rate_limit',
              lastErrorMessage: e.userMessage || e.message,
            });
            chrome.runtime.sendMessage({
              type: 'batchRateLimited',
              scraped: batchState.results.length,
              total: targetCards.length,
              reason: e.userMessage || e.message,
            }).catch(() => {});
          }
          const change = _recordResultAndMaybeAdjustRisk('err-' + kind);
          if (change) _broadcastRiskChange(change);
        }
      }

      // 每篇抓完都保存进度
      await saveBatchToStorage(targetCards, { refreshExisting: shouldRefreshExisting });
      scrapedInChunk++;

      // 任务中心：每 5 篇或最后一篇时更新进度（避免每篇都写 storage 触发太多 onChanged）
      if ((i + 1) % 5 === 0 || i === targetCards.length - 1) {
        await _jobsUpsert({
          status: typeof JOBS !== 'undefined' ? JOBS.STATUS.RUNNING : 'running',
          scraped: batchState.results.length,
          errorCount: batchState.errors.length,
          nickname: batchState.results[0]?.author?.nickname || existingBlogger?.nickname || '',
          avatar: batchState.results[0]?.author?.avatar || existingBlogger?.avatar || '',
        });
      }

      // 检查是否还有剩余
      const remaining = targetCards.filter(c => !completedIds.has(c.noteId)).length;
      if (remaining === 0) break;

      if (batchState.stopRequested) break;

      // 分段冷却：每 chunkSize 篇后插入长休息
      if (scrapedInChunk >= chunk && remaining > 0) {
        const cooldownSec = 120 + Math.floor(Math.random() * 120); // 2-4 分钟
        const cooldownUntil = Date.now() + cooldownSec * 1000;
        broadcastProgress(batchState.results.length, targetCards.length, '');

        await _jobsUpsert({
          status: typeof JOBS !== 'undefined' ? JOBS.STATUS.PAUSED_COOLDOWN : 'paused_cooldown',
          scraped: batchState.results.length,
          errorCount: batchState.errors.length,
          chunkCooldownUntil: cooldownUntil,
        });

        chrome.runtime.sendMessage({
          type: 'batchChunkPause',
          scraped: batchState.results.length,
          total: targetCards.length,
          remaining,
          cooldownSec,
        }).catch(() => {});

        // 倒计时冷却
        for (let sec = cooldownSec; sec > 0; sec--) {
          if (batchState.stopRequested) break;
          broadcastProgress(batchState.results.length, targetCards.length,
            `防封冷却中 ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
          await new Promise(r => setTimeout(r, 1000));
        }

        // 冷却结束 → 回到 RUNNING
        await _jobsUpsert({
          status: typeof JOBS !== 'undefined' ? JOBS.STATUS.RUNNING : 'running',
          chunkCooldownUntil: null,
        });

        scrapedInChunk = 0;
        if (batchState.stopRequested) break;
      } else {
        // 普通随机延时（在用户设定的 min~max 区间内）
        // 10% 概率插入一次稍长的暂停（maxDelay 的 2~3 倍），模拟真人不规则操作
        const isLongPause = Math.random() < 0.1;
        let delayMs = isLongPause
          ? maxDelay * 2 + Math.random() * maxDelay
          : minDelay + Math.random() * (maxDelay - minDelay);

        // 自适应节流：近期错误偏多 → 延时翻倍
        const riskMultiplier = batchState.riskLevel === 'slow' ? 2 : 1;
        delayMs *= riskMultiplier;

        const labelBase = isLongPause ? '防检测暂停' : '等待';
        const label = riskMultiplier > 1 ? `${labelBase}（放缓）` : labelBase;
        broadcastProgress(batchState.results.length, targetCards.length,
          `${label} ${(delayMs / 1000).toFixed(0)}s...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }

    batchState.isRunning = false;
    const finalResults = typeof DATA_STORE !== 'undefined'
      ? DATA_STORE.mergeNotes(existingNotes, batchState.results, true)
      : [...existingNotes, ...batchState.results];

    // 全部完成则清除存储
    const allDone = targetCards.every(c => completedIds.has(c.noteId));
    if (allDone || batchState.stopRequested) {
      // 完成或手动停止都保留记录供下载，但标记完成
    }

    // 直接落盘到 blogger_${userId}（不依赖 popup 是否打开）
    // 修复：之前仅由 popup 的 batchComplete 监听器保存，
    // 若 popup 在 chunk 冷却期间关闭则数据丢失
    const nickname = finalResults[0]?.author?.nickname || existingBlogger?.nickname || '';
    const avatar = finalResults[0]?.author?.avatar || existingBlogger?.avatar || '';
    // v2.7.0: 抓取博主主页统计数据
    const profileStats = getProfileStats();
    if (profileUserId && finalResults.length > 0 && typeof DATA_STORE !== 'undefined') {
      try {
        await DATA_STORE.saveBlogger(
          profileUserId, nickname, avatar, profileUrl, finalResults, profileStats
        );
      } catch (e) {
        console.warn('[XHS] saveBlogger from content script failed:', e);
      }
    }

    // 任务中心：收尾（自然完成 → DONE；用户点了停止 → CANCELLED）
    if (typeof JOBS !== 'undefined' && batchState.jobId) {
      await _jobsUpsert({
        status: batchState.userStopped ? JOBS.STATUS.CANCELLED : JOBS.STATUS.DONE,
        scraped: batchState.results.length,
        errorCount: batchState.errors.length,
        nickname,
        avatar,
        chunkCooldownUntil: null,
      });
    }

    chrome.runtime.sendMessage({
      type: 'batchComplete',
      results: finalResults,
      newResults: batchState.results,
      errors: batchState.errors,
      total: targetCards.length,
      localTotal: finalResults.length,
      skippedExistingCount: Math.max(cards.length - targetCards.length, 0),
      refreshExisting: shouldRefreshExisting,
      jobId: batchState.jobId,
      userStopped: batchState.userStopped,
      blogger: {
        userId: profileUserId,
        profileUrl,
        nickname,
        avatar,
        stats: profileStats,
      },
    }).catch(() => {});
  }

  function broadcastProgress(current, total, waitMsg) {
    chrome.runtime.sendMessage({
      type: 'batchProgress',
      current,
      total,
      scraped: batchState.results.length,
      errors: batchState.errors.length,
      waitMsg: waitMsg || '',
    }).catch(() => {});
  }

  // ========== 消息监听 ==========

  let cachedResult = null;

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'getProfileInfo': {
        sendResponse({
          userId: getProfileUserId(),
          profileUrl: window.location.href.split('?')[0],
          stats: getProfileStats(),
        });
        break;
      }
      case 'getStatus': {
        const noteId = getNoteId();
        const isProfile = isProfilePage();
        const noteCards = isProfile ? collectNoteCards() : [];

        sendResponse({
          pageType: isProfile ? 'profile' : (noteId ? 'note' : 'unknown'),
          isNotePage: !!noteId,
          isProfilePage: isProfile,
          noteId,
          noteCount: noteCards.length,
          hasCachedResult: !!cachedResult,
        });
        break;
      }

      case 'collectNotes': {
        const batchLimit = message.batchLimit;
        const currentCards = collectNoteCards();

        // 如果当前可见的笔记已够数，不需要滚动
        if (batchLimit && currentCards.length >= batchLimit) {
          sendResponse({ cards: currentCards.slice(0, batchLimit) });
        } else {
          scrollToLoadAll(message.maxScrolls).then(cards => {
            sendResponse({ cards: batchLimit ? cards.slice(0, batchLimit) : cards });
          });
          return true; // async
        }
        break;
      }

      case 'startBatchScrape': {
        if (batchState.isRunning) {
          sendResponse({ success: false, reason: '批量抓取正在进行中' });
          return;
        }
        sendResponse({ success: true, total: message.cards.length });
        batchScrapeFromProfile({
          cards: message.cards,
          minDelay: message.minDelay || 3000,
          maxDelay: message.maxDelay || 8000,
          chunkSize: message.chunkSize || 20,
          refreshExisting: !!message.refreshExisting,
        });
        return true;
      }

      case 'stopBatchScrape':
        batchState.stopRequested = true;
        batchState.userStopped = true;
        sendResponse({ success: true });
        break;

      case 'getBatchStatus':
        sendResponse({
          isRunning: batchState.isRunning,
          refreshExisting: batchState.refreshExisting,
          currentIndex: batchState.currentIndex,
          totalCount: batchState.totalCount,
          scraped: batchState.results.length,
          errors: batchState.errors.length,
          results: batchState.results,
          errorDetails: batchState.errors,
        });
        break;

      case 'getSavedBatch':
        loadBatchFromStorage().then(saved => {
          sendResponse(saved);
        });
        return true;

      case 'clearSavedBatch':
        clearBatchFromStorage().then(() => {
          batchState.results = [];
          batchState.errors = [];
          sendResponse({ success: true });
        });
        return true;

      case 'scrapeNote':
        scrapeNote().then(result => {
          cachedResult = result;
          sendResponse(result);
        });
        return true;

      case 'getResults':
        sendResponse({ notes: cachedResult ? [cachedResult] : [], isCrawling: false });
        break;

      default:
        sendResponse({ error: 'unknown action' });
    }
    return true;
  });
})();
