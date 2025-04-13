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

      // 确保html2canvas已经初始化
      if (!this.html2canvas && message.action !== 'preview') {
        this.showToast('截图组件正在初始化，请稍候...', 'info');
        this.initHtml2Canvas().then(() => {
          this.handleMessage(message);
        }).catch(error => {
          console.error('[网页截图] 初始化失败:', error);
          this.showToast('截图组件初始化失败，请刷新页面重试', 'error');
        });
        return true;
      }

      this.handleMessage(message);
      return true;
    });
  }

  // 处理消息
  handleMessage(message) {
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

    // 首先尝试从window对象获取（可能已经被其他脚本加载）
    if (typeof window.html2canvas === 'function') {
      console.log('[网页截图] 发现已加载的html2canvas');
      this.html2canvas = window.html2canvas;
      return this.html2canvas;
    }

    // 定义所有可能的CDN源
    const sources = [
      chrome.runtime.getURL('lib/html2canvas.min.js'),
      'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
      'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js',
      'https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'
    ];

    // 尝试加载每个源
    for (const source of sources) {
      try {
        console.log('[网页截图] 尝试加载:', source);
        await this.loadScript(source);
        
        // 验证加载结果
        if (typeof window.html2canvas === 'function') {
          console.log('[网页截图] 成功加载html2canvas');
          this.html2canvas = window.html2canvas;
          return this.html2canvas;
        }
        console.warn('[网页截图] 脚本加载但未找到html2canvas函数');
      } catch (error) {
        console.warn('[网页截图] 加载失败:', source, error);
      }
    }

    throw new Error('无法加载html2canvas');
  }

  // 加载脚本
  loadScript(url) {
    return new Promise((resolve, reject) => {
      // 检查是否已存在相同的脚本
      const existingScript = document.querySelector(`script[src="${url}"]`);
      if (existingScript) {
        console.log('[网页截图] 脚本已存在:', url);
        return resolve();
      }

      const script = document.createElement('script');
      script.type = 'text/javascript';
      script.src = url;

      // 设置超时
      const timeout = setTimeout(() => {
        reject(new Error('加载超时'));
        script.remove();
      }, 10000);

      script.onload = () => {
        clearTimeout(timeout);
        // 给脚本一点时间初始化
        setTimeout(() => {
          if (typeof window.html2canvas === 'function') {
            resolve();
          } else {
            reject(new Error('脚本加载但未初始化'));
          }
        }, 200);
      };

      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('加载失败'));
        script.remove();
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
      try {
        await this.initHtml2Canvas();
      } catch (error) {
        this.showToast('截图组件未就绪，请刷新页面重试', 'error');
        return;
      }
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

    try {
      console.log('[网页截图] 开始捕获可视区域');
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
      console.log('[网页截图] 开始捕获完整页面');
      // 临时修改body样式以防止滚动
      const originalStyle = document.body.style.cssText;
      document.body.style.overflow = 'hidden';
      document.body.style.height = `${fullHeight}px`;

      const canvas = await this.html2canvas(document.documentElement, options);
      
      // 恢复原始样式
      document.body.style.cssText = originalStyle;
      
      // 恢复滚动位置
      window.scrollTo(originalScrollPos.x, originalScrollPos.y);

      console.log('[网页截图] 完整页面捕获完成');
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('[网页截图] 完整页面捕获失败:', error);
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

    try {
      console.log('[网页截图] 开始捕获选定区域:', area);
      const canvas = await this.html2canvas(document.documentElement, options);
      console.log('[网页截图] 选定区域捕获完成');
      return canvas.toDataURL('image/png');
    } catch (error) {
      console.error('[网页截图] 选定区域捕获失败:', error);
      throw error;
    }
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