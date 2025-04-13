// 内容脚本
console.log('[网页截图] 内容脚本已初始化');

class ScreenshotContent {
  constructor() {
    this.html2canvas = null;
    this.previewUI = null;
    this.isCapturing = false;
    this.initMessageListener();
    this.loadHtml2Canvas();
  }

  // 初始化消息监听
  initMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('[Content Debug] 收到消息: \n', message);
      console.log('[Content Debug] 开始处理消息');
      
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
        case 'ping':
          sendResponse({ status: 'ok' });
          break;
      }
      return true;
    });
  }

  // 加载html2canvas库
  async loadHtml2Canvas() {
    try {
      // 首先尝试加载本地文件
      const localScript = document.createElement('script');
      localScript.src = chrome.runtime.getURL('lib/html2canvas.min.js');
      
      const loadPromise = new Promise((resolve, reject) => {
        localScript.onload = () => {
          if (typeof window.html2canvas === 'function') {
            console.log('[网页截图] html2canvas本地加载成功');
            this.html2canvas = window.html2canvas;
            resolve();
          } else {
            reject(new Error('本地html2canvas加载成功但未正确初始化'));
          }
        };
        localScript.onerror = () => reject(new Error('本地html2canvas加载失败'));
      });

      document.head.appendChild(localScript);
      await loadPromise;
    } catch (error) {
      console.warn('[网页截图] 本地加载失败，尝试从CDN加载:', error);
      
      // CDN列表
      const cdnUrls = [
        'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
        'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
        'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'
      ];

      for (const cdnUrl of cdnUrls) {
        try {
          const script = document.createElement('script');
          script.src = cdnUrl;
          
          const cdnLoadPromise = new Promise((resolve, reject) => {
            script.onload = () => {
              if (typeof window.html2canvas === 'function') {
                console.log('[网页截图] html2canvas从CDN加载成功:', cdnUrl);
                this.html2canvas = window.html2canvas;
                resolve();
              } else {
                reject(new Error('CDN html2canvas加载成功但未正确初始化'));
              }
            };
            script.onerror = () => reject(new Error(`CDN ${cdnUrl} 加载失败`));
          });

          document.head.appendChild(script);
          await cdnLoadPromise;
          break; // 成功加载后退出循环
        } catch (cdnError) {
          console.warn(`[网页截图] CDN ${cdnUrl} 加载失败:`, cdnError);
          continue;
        }
      }
    }
  }

  // 处理截图请求
  async handleCapture(mode) {
    if (this.isCapturing) {
      this.showToast('正在截图中，请稍候...', 'info');
      return;
    }

    if (!this.html2canvas) {
      this.showToast('截图组件未就绪，请刷新页面重试', 'error');
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
      this.showPreview(imageData);
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
    const options = {
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null
    };

    const canvas = await this.html2canvas(document.documentElement, options);
    return canvas.toDataURL();
  }

  // 截取整个页面
  async captureFull() {
    const options = {
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      height: Math.max(
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight
      ),
      windowHeight: Math.max(
        document.documentElement.clientHeight,
        document.documentElement.scrollHeight
      )
    };

    const canvas = await this.html2canvas(document.documentElement, options);
    return canvas.toDataURL();
  }

  // 截取选定区域
  async captureArea(area) {
    if (!area || !area.width || !area.height) {
      throw new Error('无效的截图区域');
    }

    const options = {
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      x: area.left,
      y: area.top,
      width: area.width,
      height: area.height
    };

    const canvas = await this.html2canvas(document.documentElement, options);
    return canvas.toDataURL();
  }

  // 显示预览
  showPreview(dataUrl) {
    if (!this.previewUI) {
      this.previewUI = new PreviewUI();
    }
    this.previewUI.show(dataUrl);
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

// 预览UI类
class PreviewUI {
  constructor() {
    this.container = null;
    this.image = null;
    this.initUI();
  }

  initUI() {
    this.container = document.createElement('div');
    this.container.className = 'screenshot-preview';
    
    const previewBox = document.createElement('div');
    previewBox.className = 'preview-box';
    
    this.image = document.createElement('img');
    this.image.className = 'preview-image';
    
    const toolbar = document.createElement('div');
    toolbar.className = 'toolbar';
    
    const copyButton = document.createElement('button');
    copyButton.className = 'toolbar-button primary';
    copyButton.textContent = '复制到剪贴板';
    copyButton.onclick = () => this.copyToClipboard();
    
    const saveButton = document.createElement('button');
    saveButton.className = 'toolbar-button primary';
    saveButton.textContent = '保存到本地';
    saveButton.onclick = () => this.saveImage();
    
    const closeButton = document.createElement('button');
    closeButton.className = 'toolbar-button secondary';
    closeButton.textContent = '关闭预览';
    closeButton.onclick = () => this.hide();
    
    toolbar.appendChild(copyButton);
    toolbar.appendChild(saveButton);
    toolbar.appendChild(closeButton);
    
    previewBox.appendChild(this.image);
    previewBox.appendChild(toolbar);
    this.container.appendChild(previewBox);
    
    document.body.appendChild(this.container);
  }

  show(dataUrl) {
    this.image.src = dataUrl;
    this.container.style.display = 'flex';
    setTimeout(() => {
      this.container.style.opacity = '1';
    }, 0);
  }

  hide() {
    this.container.style.opacity = '0';
    setTimeout(() => {
      this.container.style.display = 'none';
    }, 300);
  }

  async copyToClipboard() {
    try {
      const blob = await fetch(this.image.src).then(r => r.blob());
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      this.showToast('已复制到剪贴板');
    } catch (error) {
      console.error('复制失败:', error);
      this.showToast('复制失败，请重试', 'error');
    }
  }

  saveImage() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `截图_${timestamp}.png`;
    
    const link = document.createElement('a');
    link.download = filename;
    link.href = this.image.src;
    link.click();
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `screenshot-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

// 区域选择器类
class AreaSelector {
  constructor(options) {
    this.onSelected = options.onSelected;
    this.startX = 0;
    this.startY = 0;
    this.isSelecting = false;
    this.overlay = null;
    this.selection = null;
    this.sizeInfo = null;
  }

  start() {
    this.createOverlay();
    this.bindEvents();
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'screenshot-overlay';
    
    this.selection = document.createElement('div');
    this.selection.className = 'screenshot-selection';
    
    this.sizeInfo = document.createElement('div');
    this.sizeInfo.className = 'screenshot-size-info';
    
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.selection);
    document.body.appendChild(this.sizeInfo);
  }

  bindEvents() {
    this.overlay.onmousedown = (e) => {
      this.isSelecting = true;
      this.startX = e.clientX;
      this.startY = e.clientY;
      this.selection.style.display = 'block';
      this.sizeInfo.style.display = 'block';
    };

    document.onmousemove = (e) => {
      if (!this.isSelecting) return;

      const rect = this.calculateRect(e);
      this.updateSelection(rect);
      this.updateSizeInfo(rect);
    };

    document.onmouseup = (e) => {
      if (!this.isSelecting) return;
      
      const rect = this.calculateRect(e);
      if (rect.width < 10 || rect.height < 10) {
        this.showToast('选择的区域太小，请重新选择', 'error');
      } else {
        this.onSelected(rect);
      }
      
      this.cleanup();
    };

    document.onkeydown = (e) => {
      if (e.key === 'Escape') {
        this.cleanup();
      }
    };
  }

  calculateRect(e) {
    const left = Math.min(this.startX, e.clientX);
    const top = Math.min(this.startY, e.clientY);
    const width = Math.abs(e.clientX - this.startX);
    const height = Math.abs(e.clientY - this.startY);
    
    return { left, top, width, height };
  }

  updateSelection(rect) {
    Object.assign(this.selection.style, {
      left: rect.left + 'px',
      top: rect.top + 'px',
      width: rect.width + 'px',
      height: rect.height + 'px'
    });
  }

  updateSizeInfo(rect) {
    this.sizeInfo.textContent = `${rect.width} × ${rect.height}`;
    
    const infoLeft = rect.left + rect.width + 10;
    const infoTop = rect.top;
    
    Object.assign(this.sizeInfo.style, {
      left: infoLeft + 'px',
      top: infoTop + 'px'
    });
  }

  cleanup() {
    this.isSelecting = false;
    document.onmousemove = null;
    document.onmouseup = null;
    document.onkeydown = null;
    
    this.overlay.remove();
    this.selection.remove();
    this.sizeInfo.remove();
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `screenshot-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.remove();
    }, 3000);
  }
}

// 初始化内容脚本
new ScreenshotContent();