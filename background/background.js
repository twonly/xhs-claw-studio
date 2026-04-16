// Service Worker - 文件下载处理 + 埋点上报

try {
  importScripts('../lib/license.js', '../lib/analytics.js');
} catch (e) {
  // importScripts 失败不影响主业务
}

// 侧边栏偏好恢复 — service worker 重启时同步 openPanelOnActionClick
async function restoreSidePanelPref() {
  try {
    if (!chrome.sidePanel?.setPanelBehavior) return;
    const data = await chrome.storage.local.get('sidepanel_default');
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: data.sidepanel_default === true,
    });
  } catch {}
}
restoreSidePanelPref();

// 首次安装埋点
chrome.runtime.onInstalled.addListener(async (details) => {
  try {
    if (typeof ANALYTICS === 'undefined') return;
    await ANALYTICS.init();
    if (details.reason === 'install') {
      ANALYTICS.track('extension_install', {
        install_date: new Date().toISOString().slice(0, 10),
      });
    } else if (details.reason === 'update') {
      ANALYTICS.track('extension_update', {
        previous_version: details.previousVersion || 'unknown',
      });
    }
  } catch {}
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 文件下载
  if (message.action === 'download') {
    const blob = new Blob([message.content], { type: message.mimeType || 'text/csv' });
    const reader = new FileReader();
    reader.onloadend = () => {
      chrome.downloads.download({
        url: reader.result, filename: message.filename, saveAs: true
      }, (downloadId) => sendResponse({ success: true, downloadId }));
    };
    reader.readAsDataURL(blob);
    return true;
  }

  // content script → background → Mixpanel 中转
  if (message.action === 'analytics_track') {
    try {
      if (typeof ANALYTICS !== 'undefined') {
        ANALYTICS.track(message.eventName, message.props || {});
      }
    } catch {}
    // 无需回包
    return false;
  }
});
