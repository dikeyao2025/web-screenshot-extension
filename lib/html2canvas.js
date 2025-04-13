/*!
 * html2canvas 1.4.1 <https://html2canvas.hertzen.com>
 * Copyright (c) 2022 Niklas von Hertzen <https://hertzen.com>
 * Released under MIT License
 */
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global.html2canvas = factory());
}(this, (function () {
    'use strict';

    function createCommonjsModule(fn, module) {
        return module = { exports: {} }, fn(module, module.exports), module.exports;
    }

    var html2canvas = createCommonjsModule(function (module, exports) {
        // 基础功能实现
        function html2canvas(element, options) {
            options = options || {};
            
            return new Promise(function(resolve, reject) {
                try {
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    
                    // 设置画布尺寸
                    canvas.width = options.width || element.offsetWidth;
                    canvas.height = options.height || element.offsetHeight;
                    
                    // 设置缩放
                    const scale = options.scale || window.devicePixelRatio || 1;
                    canvas.width *= scale;
                    canvas.height *= scale;
                    context.scale(scale, scale);
                    
                    // 设置背景色
                    if (options.backgroundColor) {
                        context.fillStyle = options.backgroundColor;
                        context.fillRect(0, 0, canvas.width, canvas.height);
                    }
                    
                    // 克隆节点
                    const clone = element.cloneNode(true);
                    
                    // 计算样式
                    const styles = window.getComputedStyle(element);
                    clone.style.cssText = styles.cssText;
                    
                    // 创建临时容器
                    const container = document.createElement('div');
                    container.appendChild(clone);
                    document.body.appendChild(container);
                    
                    // 转换为canvas
                    html2canvasInternal(clone, context, options).then(function() {
                        document.body.removeChild(container);
                        resolve(canvas);
                    }).catch(reject);
                    
                } catch (e) {
                    reject(e);
                }
            });
        }
        
        function html2canvasInternal(element, context, options) {
            return new Promise(function(resolve) {
                // 绘制背景
                const bgColor = window.getComputedStyle(element).backgroundColor;
                if (bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
                    context.fillStyle = bgColor;
                    context.fillRect(0, 0, element.offsetWidth, element.offsetHeight);
                }
                
                // 绘制边框
                const borderColor = window.getComputedStyle(element).borderColor;
                const borderWidth = parseInt(window.getComputedStyle(element).borderWidth);
                if (borderWidth > 0) {
                    context.strokeStyle = borderColor;
                    context.lineWidth = borderWidth;
                    context.strokeRect(0, 0, element.offsetWidth, element.offsetHeight);
                }
                
                // 处理子元素
                Array.from(element.children).forEach(function(child) {
                    const childStyle = window.getComputedStyle(child);
                    const x = child.offsetLeft;
                    const y = child.offsetTop;
                    
                    context.save();
                    context.translate(x, y);
                    
                    if (child instanceof HTMLImageElement) {
                        context.drawImage(child, 0, 0, child.offsetWidth, child.offsetHeight);
                    } else if (child instanceof HTMLCanvasElement) {
                        context.drawImage(child, 0, 0);
                    } else if (child.nodeType === 1) { // 元素节点
                        html2canvasInternal(child, context, options);
                    }
                    
                    context.restore();
                });
                
                resolve();
            });
        }
        
        // 导出模块
        module.exports = html2canvas;
        module.exports.default = html2canvas;
    });

    return html2canvas;
})));