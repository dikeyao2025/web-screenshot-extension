// 内容脚本
console.log('[网页截图] 内容脚本开始加载');

class ScreenshotContent {
  constructor() {
    console.log('[网页截图] 开始初始化ScreenshotContent类');
    this.html2canvas = null;
    this.previewUI = null;
    this.isCapturing = false;
    this.selectedArea = null;
    this.initMessageListener();
    
    // 等待DOM完全加载后再初始化html2canvas
    if (document.readyState === 'complete') {
      console.log('[网页截图] DOM已完全加载，直接初始化html2canvas');
      this.initHtml2Canvas();
    } else {
      console.log('[网页截图] 等待DOM加载完成');
      document.addEventListener('DOMContentLoaded', () => {
        console.log('[网页截图] DOM加载完成事件触发');
        this.initHtml2Canvas();
      });
    }
  }

  // 初始化消息监听
  initMessageListener() {
    console.log('[网页截图] 初始化消息监听器');
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[网页截图] 收到消息:', message);
      
      if (message.action === 'ping') {
        console.log('[网页截图] 响应ping消息');
        sendResponse({ status: 'ok' });
        return true;
      }

      // 确保异步响应
      this.handleMessage(message).then(response => {
        console.log('[网页截图] 消息处理完成，返回结果:', response);
        sendResponse(response);
      }).catch(error => {
        console.error('[网页截图] 消息处理错误:', error);
        sendResponse({ error: error.message });
      });

      return true;
    });
  }

  // 初始化html2canvas
  async initHtml2Canvas() {
    console.log('[网页截图] 开始初始化html2canvas');
    
    try {
      // 检查是否已经加载
      if (window.html2canvas) {
        console.log('[网页截图] html2canvas已存在于window对象');
        this.html2canvas = window.html2canvas;
        return;
      }

      // 创建script标签
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('lib/html2canvas.min.js');
      console.log('[网页截图] 创建script标签，src:', script.src);
      
      // 等待脚本加载完成
      await new Promise((resolve, reject) => {
        script.onload = () => {
          console.log('[网页截图] html2canvas脚本加载完成');
          if (window.html2canvas) {
            console.log('[网页截图] html2canvas成功初始化');
            this.html2canvas = window.html2canvas;
            resolve();
          } else {
            console.error('[网页截图] html2canvas加载后未找到');
            reject(new Error('html2canvas加载后未找到'));
          }
        };
        
        script.onerror = (error) => {
          console.error('[网页截图] html2canvas脚本加载失败:', error);
          reject(new Error('html2canvas脚本加载失败'));
        };

        document.head.appendChild(script);
        console.log('[网页截图] script标签已添加到head');
      });

      console.log('[网页截图] html2canvas初始化成功');
    } catch (error) {
      console.error('[网页截图] html2canvas初始化失败:', error);
      throw error;
    }
  }

  // 处理消息
  async handleMessage(message) {
    console.log('[网页截图] 开始处理消息:', message.action);

    try {
      // 确保html2canvas已加载
      if (!this.html2canvas) {
        console.log('[网页截图] html2canvas未初始化，尝试初始化');
        await this.initHtml2Canvas();
      }

      switch(message.action) {
        case 'capture':
          console.log('[网页截图] 处理截图请求，模式:', message.mode);
          return await this.handleCapture(message.mode);
        case 'preview':
          console.log('[网页截图] 处理预览请求');
          return await this.showPreview(message.dataUrl);
        case 'startSelection':
          console.log('[网页截图] 处理区域选择请求');
          return await this.startAreaSelection();
        default:
          console.error('[网页截图] 未知的操作类型:', message.action);
          throw new Error('未知的操作类型');
      }
    } catch (error) {
      console.error('[网页截图] 操作失败:', error);
      this.showToast(error.message || '操作失败，请重试', 'error');
      throw error;
    }
  }

  // 处理截图请求
  async handleCapture(mode) {
    if (this.isCapturing) {
      console.log('[网页截图] 正在截图中，忽略新请求');
      throw new Error('正在截图中，请稍候...');
    }

    console.log('[网页截图] 开始截图，模式:', mode);
    this.isCapturing = true;
    this.showProgress('正在准备截图...');

    try {
      let imageData;
      switch (mode) {
        case 'visible':
          imageData = await this.captureVisible();
          break;
        case 'full':
          imageData = await this.captureFull();
          break;
        case 'area':
          if (!this.selectedArea) {
            throw new Error('请先选择截图区域');
          }
          imageData = await this.captureArea(this.selectedArea);
          break;
        default:
          throw new Error('未知的截图模式');
      }

      this.hideProgress();
      await this.showPreview(imageData);
      return { success: true, data: imageData };
    } catch (error) {
      console.error('[网页截图] 截图失败:', error);
      this.hideProgress();
      throw error;
    } finally {
      this.isCapturing = false;
    }
  }

  // 截取可视区域
  async captureVisible() {
    console.log('[网页截图] 开始捕获可视区域');
    const options = {
      logging: true,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      scale: window.devicePixelRatio || 1,
      width: window.innerWidth,
      height: window.innerHeight,
      x: window.scrollX,
      y: window.scrollY,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight
    };
    
    try {
      console.log('[网页截图] 调用html2canvas，配置:', options);
      const canvas = await this.html2canvas(document.documentElement, options);
      console.log('[网页截图] 可视区域捕获成功');
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('[网页截图] 可视区域捕获失败:', error);
      throw new Error('可视区域截图失败');
    }
  }

  // 显示进度提示
  showProgress(message) {
    console.log('[网页截图] 显示进度:', message);
    if (!this.progressElement) {
      this.progressElement = document.createElement('div');
      this.progressElement.className = 'screenshot-progress';
      this.progressElement.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 15px 30px;
        border-radius: 5px;
        z-index: 999999;
        font-family: system-ui;
      `;
      document.body.appendChild(this.progressElement);
    }
    this.progressElement.textContent = message;
  }

  // 隐藏进度提示
  hideProgress() {
    console.log('[网页截图] 隐藏进度提示');
    if (this.progressElement) {
      this.progressElement.remove();
      this.progressElement = null;
    }
  }

  // 显示提示信息
  showToast(message, type = 'info') {
    console.log('[网页截图] 显示提示:', message, '类型:', type);
    if (!this.toastElement) {
      this.toastElement = document.createElement('div');
      this.toastElement.className = 'screenshot-toast';
      this.toastElement.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        padding: 10px 20px;
        border-radius: 4px;
        color: white;
        font-family: system-ui;
        z-index: 999999;
        transition: opacity 0.3s;
      `;
      document.body.appendChild(this.toastElement);
    }

    this.toastElement.style.background = type === 'error' ? '#ff4444' : '#333';
    this.toastElement.textContent = message;

    clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => {
      if (this.toastElement) {
        this.toastElement.remove();
        this.toastElement = null;
      }
    }, 3000);
  }
}

// 初始化内容脚本
console.log('[网页截图] 创建ScreenshotContent实例');
const screenshotContent = new ScreenshotContent();
console.log('[网页截图] 内容脚本加载完成');