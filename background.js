// 扩展初始化
console.log('[网页截图] 后台服务已启动');

// 创建右键菜单
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'screenshot',
    title: '网页截图',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'capture-visible',
    title: '截取可见区域',
    parentId: 'screenshot',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'capture-full',
    title: '截取整个页面',
    parentId: 'screenshot',
    contexts: ['page']
  });

  chrome.contextMenus.create({
    id: 'capture-area',
    title: '截取选定区域',
    parentId: 'screenshot',
    contexts: ['page']
  });
});

// 处理右键菜单点击
chrome.contextMenus.onClicked.addListener((info, tab) => {
  switch (info.menuItemId) {
    case 'capture-visible':
      captureTab(tab.id, 'visible');
      break;
    case 'capture-full':
      captureTab(tab.id, 'full');
      break;
    case 'capture-area':
      captureTab(tab.id, 'area');
      break;
  }
});

// 处理工具栏图标点击
chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { action: 'showMenu' });
});

// 截图处理函数
async function captureTab(tabId, mode) {
  try {
    await chrome.tabs.sendMessage(tabId, { 
      action: 'capture',
      mode: mode
    });
  } catch (error) {
    console.error('[网页截图] 截图失败:', error);
    // 通知用户错误
    chrome.tabs.sendMessage(tabId, {
      action: 'showError',
      error: '截图失败，请刷新页面后重试'
    });
  }
}

// 监听来自content script的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'saveScreenshot') {
    chrome.downloads.download({
      url: message.dataUrl,
      filename: message.filename || '截图.png',
      saveAs: true
    });
  }
  return true;
});