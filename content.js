// 内容脚本
console.log('[网页截图] 内容脚本已初始化');

class ScreenshotContent {
  constructor() {
    this.html2canvas = null;
    this.previewUI = null;
    this.isCapturing = false;
    this.selectedArea = null;
    this.initMessageListener();
    this.initHtml2Canvas().catch(error => {
      console.error('[网页截图] 初始化失败:', error);
    });
  }

  // 初始化消息监听
  initMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[网页截图] 收到消息:', message);
      
      if (message.action === 'ping') {
        sendResponse({ status: 'ok' });
        return true;
      }

      // 确保异步响应
      this.handleMessage(message).then(response => {
        sendResponse(response);
      }).catch(error => {
        console.error('[网页截图] 消息处理错误:', error);
        sendResponse({ error: error.message });
      });

      return true; // 保持消息通道开放
    });
  }

  // 处理消息
  async handleMessage(message) {
    console.log('[网页截图] 处理消息:', message.action);

    try {
      if (!this.html2canvas) {
        await this.initHtml2Canvas();
      }

      switch(message.action) {
        case 'capture':
          return await this.handleCapture(message.mode);
        case 'preview':
          return await this.showPreview(message.dataUrl);
        case 'startSelection':
          return await this.startAreaSelection();
        default:
          throw new Error('未知的操作类型');
      }
    } catch (error) {
      console.error('[网页截图] 操作失败:', error);
      this.showToast(error.message || '操作失败，请重试', 'error');
      throw error;
    }
  }

  // 初始化html2canvas
  async initHtml2Canvas() {
    if (this.html2canvas) {
      console.log('[网页截图] html2canvas已初始化');
      return this.html2canvas;
    }

    console.log('[网页截图] 开始初始化html2canvas');

    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('lib/html2canvas.js');
      
      const timeout = setTimeout(() => {
        reject(new Error('html2canvas加载超时'));
      }, 10000);

      script.onload = () => {
        clearTimeout(timeout);
        // 等待html2canvas真正初始化完成
        const checkInterval = setInterval(() => {
          if (typeof window.html2canvas === 'function') {
            clearInterval(checkInterval);
            console.log('[网页截图] html2canvas初始化成功');
            this.html2canvas = window.html2canvas;
            resolve(this.html2canvas);
          }
        }, 100);

        // 设置检查超时
        setTimeout(() => {
          clearInterval(checkInterval);
          if (!this.html2canvas) {
            reject(new Error('html2canvas初始化超时'));
          }
        }, 5000);
      };
      
      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('html2canvas加载失败'));
      };

      document.head.appendChild(script);
    });
  }

  // 获取基础配置
  getBaseOptions(mode) {
    const baseOptions = {
      logging: true,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      scale: window.devicePixelRatio || 1,
      removeContainer: true,
      imageTimeout: 15000,
      ignoreElements: (element) => {
        return element.classList.contains('screenshot-overlay') ||
               element.classList.contains('screenshot-selection') ||
               element.classList.contains('screenshot-toast');
      }
    };

    // 根据不同模式添加特定配置
    switch (mode) {
      case 'full':
        return {
          ...baseOptions,
          windowWidth: document.documentElement.scrollWidth,
          windowHeight: document.documentElement.scrollHeight,
          width: document.documentElement.scrollWidth,
          height: document.documentElement.scrollHeight,
          scrollX: 0,
          scrollY: 0,
          x: 0,
          y: 0
        };
      case 'visible':
        return {
          ...baseOptions,
          windowWidth: window.innerWidth,
          windowHeight: window.innerHeight,
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          x: window.scrollX,
          y: window.scrollY
        };
      default:
        return baseOptions;
    }
  }

  // 处理截图请求
  async handleCapture(mode) {
    if (this.isCapturing) {
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
      this.hideProgress();
      throw error;
    } finally {
      this.isCapturing = false;
    }
  }

  // 截取可视区域
  async captureVisible() {
    console.log('[网页截图] 开始捕获可视区域');
    const options = this.getBaseOptions('visible');
    
    try {
      const canvas = await this.html2canvas(document.documentElement, options);
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('[网页截图] 可视区域捕获失败:', error);
      throw new Error('可视区域截图失败');
    }
  }

  // 截取整个页面
  async captureFull() {
    console.log('[网页截图] 开始捕获完整页面');
    
    // 保存原始状态
    const originalScroll = {
      x: window.scrollX,
      y: window.scrollY
    };
    const originalStyle = document.documentElement.style.cssText;

    try {
      // 禁用滚动和设置完整高度
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.height = '100%';
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100%';

      const options = this.getBaseOptions('full');
      const canvas = await this.html2canvas(document.documentElement, options);

      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('[网页截图] 完整页面捕获失败:', error);
      throw new Error('完整页面截图失败');
    } finally {
      // 恢复原始状态
      document.documentElement.style.cssText = originalStyle;
      document.body.style.cssText = '';
      window.scrollTo(originalScroll.x, originalScroll.y);
    }
  }

  // 截取选定区域
  async captureArea(area) {
    if (!area || !area.width || !area.height) {
      throw new Error('无效的截图区域');
    }

    console.log('[网页截图] 开始捕获选定区域:', area);
    
    const options = {
      ...this.getBaseOptions(),
      width: area.width,
      height: area.height,
      x: area.left,
      y: area.top,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight
    };

    try {
      const canvas = await this.html2canvas(document.documentElement, options);
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('[网页截图] 选定区域捕获失败:', error);
      throw new Error('选定区域截图失败');
    }
  }

  // 显示进度提示
  showProgress(message) {
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
    if (this.progressElement) {
      this.progressElement.remove();
      this.progressElement = null;
    }
  }

  // 显示提示信息
  showToast(message, type = 'info') {
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
const screenshotContent = new ScreenshotContent();