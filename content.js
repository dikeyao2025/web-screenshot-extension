// 内容脚本
console.log('[网页截图] 内容脚本已初始化');

class ScreenshotContent {
  constructor() {
    this.html2canvas = null;
    this.previewUI = null;
    this.isCapturing = false;
    this.selectedArea = null;
    this.initMessageListener();
    this.initHtml2Canvas();
  }

  // 初始化消息监听
  initMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[Content Debug] 收到消息: \n', message);
      console.log('[Content Debug] 开始处理消息');
      
      if (message.action === 'ping') {
        sendResponse({ status: 'ok' });
        return true;
      }

      this.handleMessage(message);
      return true;
    });
  }

  // 处理消息
  async handleMessage(message) {
    if (!this.html2canvas && message.action !== 'preview') {
      try {
        await this.initHtml2Canvas();
      } catch (error) {
        console.error('[网页截图] 初始化失败:', error);
        this.showToast('截图组件初始化失败，请刷新页面重试', 'error');
        return;
      }
    }

    switch(message.action) {
      case 'capture':
        this.handleCapture(message.mode);
        break;
      case 'preview':
        this.showPreview(message.dataUrl);
        break;
      case 'startSelection':
        this.startAreaSelection();
        break;
    }
  }

  // 初始化html2canvas
  async initHtml2Canvas() {
    if (this.html2canvas) {
      return this.html2canvas;
    }

    console.log('[网页截图] 开始初始化html2canvas');

    try {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('lib/html2canvas.js');
      
      await new Promise((resolve, reject) => {
        script.onload = () => {
          if (typeof window.html2canvas === 'function') {
            console.log('[网页截图] html2canvas加载成功');
            this.html2canvas = window.html2canvas;
            resolve();
          } else {
            reject(new Error('html2canvas未正确初始化'));
          }
        };
        
        script.onerror = () => reject(new Error('html2canvas加载失败'));
        document.head.appendChild(script);
      });
      
      return this.html2canvas;
    } catch (error) {
      console.error('[网页截图] html2canvas加载失败:', error);
      throw error;
    }
  }

  // 获取基础配置
  getBaseOptions() {
    return {
      // 基础设置
      logging: true, // 启用日志以便调试
      useCORS: true, // 允许跨域图片
      allowTaint: true, // 允许跨域图片
      backgroundColor: '#ffffff', // 设置白色背景
      
      // 渲染设置
      scale: window.devicePixelRatio, // 设备像素比
      foreignObjectRendering: false, // 禁用foreignObject渲染
      removeContainer: true, // 移除临时容器
      
      // 图像设置
      imageTimeout: 15000, // 图片加载超时时间
      ignoreElements: (element) => {
        // 忽略特定元素
        return element.classList.contains('screenshot-overlay') ||
               element.classList.contains('screenshot-selection') ||
               element.classList.contains('screenshot-toast') ||
               element.classList.contains('screenshot-progress');
      },
      
      // 特性开关
      onclone: (clonedDoc) => {
        // 处理克隆的文档
        Array.from(clonedDoc.getElementsByTagName('iframe')).forEach(iframe => {
          iframe.remove();
        });
        return Promise.resolve();
      }
    };
  }

  // 处理截图请求
  async handleCapture(mode) {
    if (this.isCapturing) {
      this.showToast('正在截图中，请稍候...', 'info');
      return;
    }

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
    } catch (error) {
      console.error('[截图] 截图失败:', error);
      this.hideProgress();
      this.showToast(error.message || '截图失败，请重试', 'error');
    } finally {
      this.isCapturing = false;
    }
  }

  // 截取可视区域
  async captureVisible() {
    console.log('[网页截图] 开始捕获可视区域');
    
    const options = {
      ...this.getBaseOptions(),
      width: window.innerWidth,
      height: window.innerHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      x: window.scrollX,
      y: window.scrollY,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    };

    try {
      const canvas = await this.html2canvas(document.documentElement, options);
      console.log('[网页截图] 可视区域捕获完成');
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('[网页截图] 可视区域捕获失败:', error);
      throw error;
    }
  }

  // 截取整个页面
  async captureFull() {
    console.log('[网页截图] 开始捕获完整页面');
    
    // 保存原始滚动位置
    const originalScrollPos = {
      x: window.scrollX,
      y: window.scrollY
    };

    // 获取完整页面尺寸
    const fullWidth = Math.max(
      document.documentElement.scrollWidth,
      document.documentElement.offsetWidth,
      document.documentElement.clientWidth,
      window.innerWidth
    );
    
    const fullHeight = Math.max(
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight,
      document.documentElement.clientHeight,
      window.innerHeight
    );

    const options = {
      ...this.getBaseOptions(),
      width: fullWidth,
      height: fullHeight,
      windowWidth: fullWidth,
      windowHeight: fullHeight,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0
    };

    try {
      // 临时禁用滚动
      const originalStyle = document.body.style.cssText;
      document.body.style.overflow = 'hidden';
      document.body.style.height = `${fullHeight}px`;

      const canvas = await this.html2canvas(document.documentElement, options);
      
      // 恢复原始状态
      document.body.style.cssText = originalStyle;
      window.scrollTo(originalScrollPos.x, originalScrollPos.y);

      console.log('[网页截图] 完整页面捕获完成');
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('[网页截图] 完整页面捕获失败:', error);
      throw error;
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
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
      x: area.left,
      y: area.top,
      scrollX: window.scrollX,
      scrollY: window.scrollY
    };

    try {
      const canvas = await this.html2canvas(document.documentElement, options);
      console.log('[网页截图] 选定区域捕获完成');
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('[网页截图] 选定区域捕获失败:', error);
      throw error;
    }
  }

  // 其他方法保持不变...
}

// PreviewUI类和AreaSelector类的代码保持不变...

// 初始化内容脚本
new ScreenshotContent();