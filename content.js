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
    // 确保html2canvas已经初始化
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
      // 加载本地版本
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('lib/html2canvas.js');
      
      await new Promise((resolve, reject) => {
        script.onload = () => {
          // 给脚本一点时间初始化
          setTimeout(() => {
            if (typeof window.html2canvas === 'function') {
              console.log('[网页截图] html2canvas加载成功');
              this.html2canvas = window.html2canvas;
              resolve();
            } else {
              reject(new Error('html2canvas未正确初始化'));
            }
          }, 100);
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
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      scale: window.devicePixelRatio,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight
    };

    const canvas = await this.html2canvas(document.documentElement, options);
    console.log('[网页截图] 可视区域捕获完成');
    return canvas.toDataURL('image/png');
  }

  // 截取整个页面
  async captureFull() {
    console.log('[网页截图] 开始捕获完整页面');
    
    const options = {
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      scale: window.devicePixelRatio,
      width: Math.max(
        document.documentElement.scrollWidth,
        document.documentElement.offsetWidth,
        document.documentElement.clientWidth
      ),
      height: Math.max(
        document.documentElement.scrollHeight,
        document.documentElement.offsetHeight,
        document.documentElement.clientHeight
      )
    };

    const canvas = await this.html2canvas(document.documentElement, options);
    console.log('[网页截图] 完整页面捕获完成');
    return canvas.toDataURL('image/png');
  }

  // 截取选定区域
  async captureArea(area) {
    if (!area || !area.width || !area.height) {
      throw new Error('无效的截图区域');
    }

    console.log('[网页截图] 开始捕获选定区域:', area);
    
    const options = {
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      scale: window.devicePixelRatio,
      width: area.width,
      height: area.height,
      x: area.left,
      y: area.top
    };

    const canvas = await this.html2canvas(document.documentElement, options);
    console.log('[网页截图] 选定区域捕获完成');
    return canvas.toDataURL('image/png');
  }

  // 显示预览
  async showPreview(dataUrl) {
    if (!this.previewUI) {
      this.previewUI = new PreviewUI();
    }
    await this.previewUI.show(dataUrl);
  }

  // 开始区域选择
  startAreaSelection() {
    if (this.isCapturing) {
      this.showToast('正在截图中，请稍候...', 'info');
      return;
    }

    if (!this.areaSelector) {
      this.areaSelector = new AreaSelector({
        onSelected: (area) => {
          this.selectedArea = area;
          this.handleCapture('area');
        }
      });
    }

    this.areaSelector.start();
  }

  // 显示Toast提示
  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `screenshot-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }

  // 显示进度提示
  showProgress(message) {
    if (!this.progressElement) {
      this.progressElement = document.createElement('div');
      this.progressElement.className = 'screenshot-progress';
      this.progressElement.innerHTML = `
        <div class="progress-spinner"></div>
        <div class="progress-message"></div>
      `;
      document.body.appendChild(this.progressElement);
    }
    
    this.progressElement.querySelector('.progress-message').textContent = message;
    this.progressElement.style.display = 'flex';
  }

  // 隐藏进度提示
  hideProgress() {
    if (this.progressElement) {
      this.progressElement.style.display = 'none';
    }
  }
}

// PreviewUI类和AreaSelector类的代码保持不变...

// 初始化内容脚本
new ScreenshotContent();