// 内容脚本
console.log('[网页截图] 内容脚本已初始化');

class ScreenshotContent {
  constructor() {
    this.html2canvas = null;
    this.previewUI = null;
    this.isCapturing = false;
    this.selectedArea = null;
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
      await this.loadScript(chrome.runtime.getURL('lib/html2canvas.min.js'));
      console.log('[网页截图] html2canvas本地加载成功');
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
          await this.loadScript(cdnUrl);
          console.log('[网页截图] html2canvas从CDN加载成功:', cdnUrl);
          break;
        } catch (cdnError) {
          console.warn(`[网页截图] CDN ${cdnUrl} 加载失败:`, cdnError);
          continue;
        }
      }
    }

    // 验证html2canvas是否正确加载
    if (typeof window.html2canvas !== 'function') {
      throw new Error('html2canvas加载失败');
    }
    this.html2canvas = window.html2canvas;
  }

  // 加载脚本
  loadScript(url) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = url;
      
      const timeout = setTimeout(() => {
        reject(new Error('加载超时'));
      }, 10000);

      script.onload = () => {
        clearTimeout(timeout);
        // 等待一小段时间确保脚本完全初始化
        setTimeout(() => {
          if (typeof window.html2canvas === 'function') {
            resolve();
          } else {
            reject(new Error('脚本加载成功但未正确初始化'));
          }
        }, 100);
      };

      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('脚本加载失败'));
      };

      document.head.appendChild(script);
    });
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
    const options = {
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      scale: window.devicePixelRatio,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight
    };

    const canvas = await this.html2canvas(document.documentElement, options);
    return canvas.toDataURL('image/png');
  }

  // 截取整个页面
  async captureFull() {
    // 保存原始滚动位置
    const originalScrollPos = {
      x: window.scrollX,
      y: window.scrollY
    };

    // 获取页面完整尺寸
    const fullHeight = Math.max(
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight,
      document.documentElement.clientHeight
    );
    const fullWidth = Math.max(
      document.documentElement.scrollWidth,
      document.documentElement.offsetWidth,
      document.documentElement.clientWidth
    );

    const options = {
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      scale: window.devicePixelRatio,
      width: fullWidth,
      height: fullHeight,
      scrollX: 0,
      scrollY: 0,
      windowWidth: fullWidth,
      windowHeight: fullHeight,
      x: 0,
      y: 0
    };

    try {
      // 临时修改body样式以防止滚动
      const originalStyle = document.body.style.cssText;
      document.body.style.overflow = 'hidden';
      document.body.style.height = '${fullHeight}px';

      const canvas = await this.html2canvas(document.documentElement, options);
      
      // 恢复原始样式
      document.body.style.cssText = originalStyle;
      
      // 恢复滚动位置
      window.scrollTo(originalScrollPos.x, originalScrollPos.y);

      return canvas.toDataURL('image/png');
    } catch (error) {
      // 确保在出错时也恢复原始状态
      document.body.style.cssText = originalStyle;
      window.scrollTo(originalScrollPos.x, originalScrollPos.y);
      throw error;
    }
  }

  // 截取选定区域
  async captureArea(area) {
    if (!area || !area.width || !area.height) {
      throw new Error('无效的截图区域');
    }

    // 计算实际的滚动位置和区域大小
    const scale = window.devicePixelRatio;
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;

    const options = {
      logging: false,
      useCORS: true,
      allowTaint: true,
      backgroundColor: null,
      scale: scale,
      scrollX: scrollX,
      scrollY: scrollY,
      width: area.width,
      height: area.height,
      x: area.left + scrollX,
      y: area.top + scrollY,
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight
    };

    const canvas = await this.html2canvas(document.documentElement, options);
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

  async show(dataUrl) {
    return new Promise((resolve, reject) => {
      this.image.onload = () => {
        this.container.style.display = 'flex';
        setTimeout(() => {
          this.container.style.opacity = '1';
          resolve();
        }, 0);
      };
      
      this.image.onerror = () => {
        reject(new Error('图片加载失败'));
      };
      
      this.image.src = dataUrl;
    });
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
      height: rect.height + 'px',
      display: 'block'
    });
  }

  updateSizeInfo(rect) {
    this.sizeInfo.textContent = `${rect.width} × ${rect.height}`;
    
    const infoLeft = rect.left + rect.width + 10;
    const infoTop = rect.top;
    
    Object.assign(this.sizeInfo.style, {
      left: infoLeft + 'px',
      top: infoTop + 'px',
      display: 'block'
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