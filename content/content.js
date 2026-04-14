// 小红书创作服务平台 - 数据抓取 Content Script
// 基于 browser-script.js 改造，通过 Chrome Extension 消息机制通信

(function () {
  // 防止重复注入
  if (window.__xhsCreatorScraper) return;
  window.__xhsCreatorScraper = true;

  let allNotes = [];
  let isCrawling = false;
  let stopCrawling = false;

  // ========== 核心抓取函数（复用自 browser-script.js）==========

  // 获取总页数 - 多种选择器尝试
  function getTotalPages() {
    // 方法 1: 从小红书分页组件获取
    const pageOptions = document.querySelectorAll('.d-pagination-page-option');
    if (pageOptions.length > 0) {
      const maxPage = Math.max(...Array.from(pageOptions)
        .map(opt => parseInt(opt.textContent.trim()))
        .filter(n => n > 0 && n <= 100));
      if (maxPage > 1) return maxPage;
    }

    // 方法 2: 查找页码按钮
    const selectors = [
      '.d-pagination-page',
      '.page-num',
      'button.page-num',
      '.pagination .page-num',
      '.pagination button',
    ];

    for (const selector of selectors) {
      const pageBtns = document.querySelectorAll(selector);
      if (pageBtns.length > 0) {
        for (let i = pageBtns.length - 1; i >= 0; i--) {
          const text = pageBtns[i].textContent.trim();
          if (/^\d+$/.test(text)) {
            const num = parseInt(text);
            if (num > 1) return num;
          }
        }
      }
    }

    // 方法 3: 查找下拉菜单选项
    const dropdownOptions = document.querySelectorAll('.d-pagination-page-option');
    if (dropdownOptions.length > 0) {
      const pages = Array.from(dropdownOptions)
        .map(opt => parseInt(opt.textContent.trim()))
        .filter(n => n > 0);
      if (pages.length > 0) return Math.max(...pages);
    }

    return 1;
  }

  // 解析单行数据
  function parseNoteRow(row) {
    const cells = row.querySelectorAll('td');
    if (cells.length < 7) return null;

    const firstCell = cells[0].textContent.trim();
    const lines = firstCell.split('\n');
    const title = lines[0]?.trim() || '';

    let publishTime = '';
    for (const line of lines) {
      if (line.includes('发布于') || line.includes('发表于')) {
        publishTime = line.trim();
        break;
      }
    }

    const img = cells[0].querySelector('img');
    const coverUrl = img ? img.src : '';

    const parseNumber = (text) => {
      text = text?.trim() || '';
      if (!text || text === '-') return 0;
      if (text.includes('%')) return 0;
      const num = parseInt(text.replace(/,/g, ''));
      return isNaN(num) ? 0 : num;
    };

    const parsePercentage = (text) => {
      text = text?.trim() || '';
      if (!text || text === '-') return 0;
      const num = parseFloat(text.replace('%', ''));
      return isNaN(num) ? 0 : num;
    };

    return {
      title: title,
      publish_time: publishTime,
      cover_url: coverUrl,
      exposure: parseNumber(cells[1]?.textContent),
      views: parseNumber(cells[2]?.textContent),
      click_rate: parsePercentage(cells[3]?.textContent),
      likes: parseNumber(cells[4]?.textContent),
      comments: parseNumber(cells[5]?.textContent),
      collects: parseNumber(cells[6]?.textContent),
      followers: parseNumber(cells[7]?.textContent),
      crawl_time: new Date().toLocaleString('zh-CN')
    };
  }

  // 解析当前页数据
  function parseCurrentPage() {
    const rows = document.querySelectorAll('table tbody tr');
    const notes = [];
    const seenTitles = new Set(allNotes.map(n => n.title));

    for (const row of rows) {
      const note = parseNoteRow(row);
      if (note && note.title && !seenTitles.has(note.title)) {
        seenTitles.add(note.title);
        notes.push(note);
      }
    }
    return notes;
  }

  // 翻页到下一页
  function goToNextPage(currentPageNum) {
    const nextPageNum = currentPageNum + 1;

    // 方法 1: 查找直接可见的页码（1-5 和 31）
    const pageContents = document.querySelectorAll('.d-pagination-page-content');
    for (const pc of pageContents) {
      const text = pc.textContent.trim().replace(/<!---->/g, '');
      if (text === String(nextPageNum)) {
        const container = pc.closest('.d-pagination-page');
        if (container && !container.classList.contains('disabled')) {
          container.click();
          return Promise.resolve(true);
        }
      }
    }

    // 方法 2: 如果下一页是 6-25，需要先打开下拉菜单
    if (nextPageNum >= 6 && nextPageNum <= 25) {
      const dropdown = document.querySelector('.d-pagination-page-options');
      if (dropdown) {
        dropdown.click();
        return new Promise(resolve => {
          setTimeout(() => {
            const options = document.querySelectorAll('.d-pagination-page-option');
            for (const opt of options) {
              const text = opt.textContent.trim();
              if (text === String(nextPageNum)) {
                opt.click();
                resolve(true);
                return;
              }
            }
            resolve(false);
          }, 500);
        });
      }
    }

    // 方法 3: 查找下一页按钮（右箭头 SVG）
    const allSvgPaths = document.querySelectorAll('svg path');
    for (const path of allSvgPaths) {
      const d = path.getAttribute('d');
      if (d && d.includes('M19 12L31 24')) {
        const btn = path.closest('button, .d-clickable, [role="button"]');
        if (btn && !btn.classList.contains('disabled')) {
          btn.click();
          return Promise.resolve(true);
        }
      }
    }

    // 方法 4: 超过 25 页，点击 31 再找
    if (nextPageNum > 25) {
      const page31 = Array.from(document.querySelectorAll('.d-pagination-page-content'))
        .find(el => el.textContent.trim().replace(/<!---->/g, '') === '31');
      if (page31) {
        const container = page31.closest('.d-pagination-page');
        if (container) {
          container.click();
          return Promise.resolve(true);
        }
      }
    }

    return Promise.resolve(false);
  }

  // 等待表格数据变化
  function waitForTableChange() {
    const table = document.querySelector('table tbody');
    if (!table) return Promise.resolve();

    return new Promise(resolve => {
      let resolved = false;
      const observer = new MutationObserver(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          resolve();
        }
      });
      observer.observe(table, { childList: true, subtree: true });
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          observer.disconnect();
          resolve();
        }
      }, 5000);
    });
  }

  // ========== Chrome Extension 通信 ==========

  function sendProgress(currentPage, totalPages) {
    chrome.runtime.sendMessage({
      type: 'progress',
      currentPage,
      totalPages,
      noteCount: allNotes.length
    });
  }

  function sendComplete() {
    chrome.runtime.sendMessage({
      type: 'complete',
      notes: allNotes,
      stats: {
        total: allNotes.length,
        totalViews: allNotes.reduce((s, n) => s + (n.views || 0), 0),
        totalLikes: allNotes.reduce((s, n) => s + (n.likes || 0), 0),
        totalCollects: allNotes.reduce((s, n) => s + (n.collects || 0), 0),
        totalFollowers: allNotes.reduce((s, n) => s + (n.followers || 0), 0),
      }
    });
  }

  function sendError(message) {
    chrome.runtime.sendMessage({ type: 'error', message });
  }

  // 检测页面状态
  function getPageStatus() {
    const isCorrectPage = window.location.href.includes('creator.xiaohongshu.com/statistics');
    const tableRows = document.querySelectorAll('table tbody tr');
    const hasData = tableRows.length > 0;

    // 检查是否有登录相关元素（无数据时可能未登录）
    let loggedIn = hasData;
    if (!hasData) {
      const loginElements = document.querySelectorAll('[class*="login"], [class*="qrcode"]');
      loggedIn = loginElements.length === 0;
    }

    const detectedPages = getTotalPages();

    return { isCorrectPage, hasData, loggedIn, detectedPages, isCrawling, noteCount: allNotes.length };
  }

  // 主抓取循环
  async function crawlAllPages(maxPages) {
    if (isCrawling) return;

    isCrawling = true;
    stopCrawling = false;
    allNotes = [];

    try {
      let totalPages = getTotalPages();
      if (maxPages && maxPages > 0) {
        totalPages = Math.min(maxPages, totalPages > 1 ? totalPages : maxPages);
      }
      const pagesToCrawl = Math.min(totalPages, 31);

      for (let currentPage = 1; currentPage <= pagesToCrawl; currentPage++) {
        if (stopCrawling) {
          sendProgress(currentPage, pagesToCrawl);
          break;
        }

        sendProgress(currentPage, pagesToCrawl);

        // 等待表格稳定
        await new Promise(resolve => setTimeout(resolve, 1000));

        const notes = parseCurrentPage();
        allNotes.push(...notes);

        if (currentPage < pagesToCrawl && !stopCrawling) {
          const success = await goToNextPage(currentPage);
          if (!success) {
            sendError(`无法翻到第 ${currentPage + 1} 页，已停止`);
            break;
          }
          await waitForTableChange();
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      sendComplete();
    } catch (error) {
      sendError(error.message || '抓取过程出错');
    } finally {
      isCrawling = false;
    }
  }

  // 监听来自 popup/background 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.action) {
      case 'getStatus':
        sendResponse(getPageStatus());
        break;

      case 'startCrawl':
        if (isCrawling) {
          sendResponse({ success: false, reason: '正在抓取中' });
        } else {
          sendResponse({ success: true });
          crawlAllPages(message.maxPages);
        }
        break;

      case 'stopCrawl':
        stopCrawling = true;
        sendResponse({ success: true });
        break;

      case 'getResults':
        sendResponse({ notes: allNotes, isCrawling });
        break;

      default:
        sendResponse({ error: 'unknown action' });
    }
    return true; // keep message channel open for async
  });
})();
