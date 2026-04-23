// Service Worker - 文件下载处理 + 埋点上报 + 任务完成通知

try {
  importScripts('../lib/license.js', '../lib/analytics.js', '../lib/jobs-registry.js');
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

// ========== 任务完成通知 ==========

const NOTIFY_SETTING_KEY = 'notifyOnComplete';
const NOTIFY_ID_PREFIX = 'jobs-notify-';

async function shouldNotify() {
  try {
    const data = await chrome.storage.local.get(NOTIFY_SETTING_KEY);
    // 默认开启；用户可以在偏好里关掉（key !== false 视为开启）
    return data[NOTIFY_SETTING_KEY] !== false;
  } catch {
    return true;
  }
}

// 某任务是否"刚刚"从活动态变为终态
function _jobJustFinished(oldJob, newJob) {
  if (!newJob) return false;
  const wasActive = oldJob && typeof JOBS !== 'undefined' && JOBS.isActive(oldJob.status);
  const nowTerminal = typeof JOBS !== 'undefined' && !JOBS.isActive(newJob.status);
  return wasActive && nowTerminal;
}

async function _notifyForJob(job) {
  if (typeof JOBS === 'undefined') return;
  if (!(await shouldNotify())) return;

  const scraped = job.scraped || 0;
  const total = job.total || 0;
  const errorCount = job.errorCount || 0;
  const nickname = job.nickname || '未命名博主';

  let title;
  let message;
  if (job.status === JOBS.STATUS.DONE) {
    title = `@${nickname} 抓取完成`;
    message = `成功 ${scraped}/${total}${errorCount ? ` · ${errorCount} 个错误` : ''}`;
  } else if (job.status === JOBS.STATUS.FAILED) {
    title = `@${nickname} 抓取中断`;
    message = job.lastErrorMessage || '访问被拒绝，请稍后重试';
  } else if (job.status === JOBS.STATUS.CANCELLED) {
    // 用户主动取消不发通知（避免嘈杂）
    return;
  } else {
    return;
  }

  try {
    await chrome.notifications.create(NOTIFY_ID_PREFIX + job.id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title,
      message,
      priority: 0,
    });
  } catch (e) {
    // notifications 权限可能被用户关闭；静默失败
  }
}

// 订阅 jobs_index 变更，对每个刚完成的 job 发通知
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local') return;
  if (typeof JOBS === 'undefined') return;
  const change = changes[JOBS.STORAGE_KEY];
  if (!change) return;
  const oldList = Array.isArray(change.oldValue) ? change.oldValue : [];
  const newList = Array.isArray(change.newValue) ? change.newValue : [];
  const oldById = new Map(oldList.map((j) => [j.id, j]));
  for (const newJob of newList) {
    const oldJob = oldById.get(newJob.id);
    if (_jobJustFinished(oldJob, newJob)) {
      _notifyForJob(newJob);
    }
  }
});

// 点击通知 → 打开对应博主的分析页
chrome.notifications?.onClicked?.addListener(async (notificationId) => {
  if (!notificationId.startsWith(NOTIFY_ID_PREFIX)) return;
  const jobId = notificationId.slice(NOTIFY_ID_PREFIX.length);
  try {
    if (typeof JOBS === 'undefined') return;
    const job = await JOBS.get(jobId);
    if (!job) return;
    const url = job.userId
      ? chrome.runtime.getURL(`analysis/analysis.html?userId=${encodeURIComponent(job.userId)}`)
      : (job.profileUrl || chrome.runtime.getURL('analysis/analysis.html'));
    chrome.tabs.create({ url });
    chrome.notifications.clear(notificationId);
  } catch {}
});
