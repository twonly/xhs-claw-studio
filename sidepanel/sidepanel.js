// sidepanel.js — 薄壳，只处理侧边栏特有的交互
// 所有业务逻辑由 popup.js 提供（先于此文件加载）

(async function initSidepanel() {
  const PREF_KEY = 'sidepanel_default';

  // 1. 关闭按钮 — 关闭侧边栏（回退到 popup 模式）
  document.getElementById('btn-close-sidepanel')?.addEventListener('click', () => {
    // 侧边栏无法 programmatically 关闭自身，只能提示用户
    // Chrome 没有 chrome.sidePanel.close() API，但可以用 window.close()
    // 在侧边栏里 window.close() 会关闭面板
    window.close();
  });

  // 2. "默认入口" 切换
  const toggle = document.getElementById('sp-default-toggle');
  if (toggle && chrome.sidePanel?.setPanelBehavior) {
    // 读取当前偏好
    const data = await chrome.storage.local.get(PREF_KEY);
    toggle.checked = data[PREF_KEY] === true;

    toggle.addEventListener('change', async () => {
      const wantSidepanel = toggle.checked;
      await chrome.storage.local.set({ [PREF_KEY]: wantSidepanel });
      try {
        await chrome.sidePanel.setPanelBehavior({
          openPanelOnActionClick: wantSidepanel,
        });
      } catch (e) {
        console.warn('[SidePanel] setPanelBehavior failed:', e);
      }
    });
  } else if (toggle) {
    // 浏览器不支持 sidePanel.setPanelBehavior，隐藏此选项
    toggle.closest('.setting-row')?.classList.add('hidden');
  }

  // 3. 从 storage 同步 behavior（确保 service worker 重启后也生效）
  if (chrome.sidePanel?.setPanelBehavior) {
    const data = await chrome.storage.local.get(PREF_KEY);
    if (data[PREF_KEY] === true) {
      chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
    }
  }
})();
