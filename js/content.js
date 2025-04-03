// 内容脚本 - 处理页面上的视频元素
(function() {
  // 存储翻译状态
  let translationActive = false;

  // 存储原始视频音量
  let originalVolumes = new Map();
  
  // 脚本注入状态
  let speechProcessorInjected = false;

  // 监听来自后台脚本的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('内容脚本收到消息:', message);
    
    if (message.action === 'translationStarted') {
      console.log('收到开始翻译消息，启动UI');
      startTranslationUI();
      
      // 尝试注入简化版语音处理器
      if (!speechProcessorInjected) {
        injectSimpleSpeechProcessor();
      }
      
      sendResponse({ success: true });
    } else if (message.action === 'translationStopped') {
      console.log('收到停止翻译消息，停止UI');
      
      // 触发强制停止事件
      try {
        const stopEvent = new CustomEvent('vvt-force-stop-translation', {
          detail: { timestamp: message.timestamp, forceStop: !!message.forceStop }
        });
        document.dispatchEvent(stopEvent);
        console.log('已触发强制停止事件');
      } catch (e) {
        console.error('触发停止事件时出错:', e);
      }
      
      // 停止UI处理
      stopTranslationUI();
      
      // 确保响应发送成功
      sendResponse({ success: true, status: 'UI已停止' });
    } else if (message.action === 'startTranslation') {
      startTranslation(message);
      sendResponse({success: true});
    } else if (message.action === 'stopTranslation') {
      console.log('收到停止翻译消息，停止UI');
      stopTranslation(message);
      sendResponse({success: true});
    } else if (message.action === 'updateTtsSettings') {
      // 接收TTS设置更新
      console.log('收到TTS设置更新:', message.ttsSettings);
      
      // 将设置传递给页面中的speech_processor_simple.js
      window.postMessage({
        type: 'updateTtsSettings',
        ttsService: message.ttsSettings.ttsService, 
        ttsSettings: message.ttsSettings
      }, '*');
      
      // 确认收到
      sendResponse({success: true, message: 'TTS设置已更新'});
    }
    
    // 返回true以保持消息通道开放，允许异步响应
    return true;
  });

  // 监听来自speech_processor的自定义事件
  document.addEventListener('vvt-translation-started', () => {
    startTranslationUI();
  });

  document.addEventListener('vvt-translation-stopped', () => {
    stopTranslationUI();
  });

  // 监听页面中speech_processor脚本发来的消息
  window.addEventListener('message', function(event) {
    // 确保消息来自同一页面
    if (event.source !== window) return;
    
    if (event.data && event.data.type === 'ttsSettingsStatus') {
      // 将状态消息转发回扩展界面
      chrome.runtime.sendMessage({
        action: 'ttsSettingsStatus',
        status: event.data.status,
        currentService: event.data.currentService
      });
    }
  });

  // 开始翻译时的UI处理
  function startTranslationUI() {
    translationActive = true;
    
    // 查找页面上所有视频元素
    const videoElements = document.querySelectorAll('video');
    
    // 处理每个视频元素
    videoElements.forEach((video, index) => {
      // 存储原始音量
      originalVolumes.set(index, video.volume);
      
      // 将视频静音（原始音频将由我们的翻译系统处理）
      video.volume = 0;
      
      // 添加翻译指示器
      addTranslationIndicator(video);
    });
    
    // 监听新添加的视频元素
    setupVideoElementObserver();
  }

  // 停止翻译时的UI处理
  function stopTranslationUI() {
    translationActive = false;
    
    // 查找页面上所有视频元素
    const videoElements = document.querySelectorAll('video');
    
    // 处理每个视频元素
    videoElements.forEach((video, index) => {
      // 恢复原始音量
      if (originalVolumes.has(index)) {
        video.volume = originalVolumes.get(index);
      }
      
      // 移除翻译指示器
      removeTranslationIndicator(video);
    });
    
    // 清除存储的音量
    originalVolumes.clear();
    
    // 移除视频元素观察器
    disconnectVideoElementObserver();
    
    // 重置注入状态
    speechProcessorInjected = false;
  }

  // 添加翻译指示器到视频元素
  function addTranslationIndicator(videoElement) {
    // 检查视频元素是否有父元素
    if (!videoElement.parentElement) return;
    
    // 检查是否已经有指示器
    if (videoElement.parentElement.querySelector('.vvt-translation-indicator')) {
      return;
    }
    
    // 创建指示器元素
    const indicator = document.createElement('div');
    indicator.className = 'vvt-translation-indicator';
    indicator.textContent = '🔊 翻译中';
    
    // 设置样式
    Object.assign(indicator.style, {
      position: 'absolute',
      top: '10px',
      right: '10px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: 'white',
      padding: '5px 10px',
      borderRadius: '4px',
      fontSize: '14px',
      fontWeight: 'bold',
      zIndex: '9999',
      pointerEvents: 'none'
    });
    
    // 确保视频容器是相对定位的
    if (getComputedStyle(videoElement.parentElement).position === 'static') {
      videoElement.parentElement.style.position = 'relative';
    }
    
    // 添加指示器到视频容器
    videoElement.parentElement.appendChild(indicator);
  }

  // 移除翻译指示器
  function removeTranslationIndicator(videoElement) {
    // 检查视频元素是否有父元素
    if (!videoElement.parentElement) return;
    
    const indicator = videoElement.parentElement.querySelector('.vvt-translation-indicator');
    if (indicator) {
      indicator.remove();
    }
  }

  // 设置视频元素观察器，监听新添加的视频
  let videoObserver = null;

  function setupVideoElementObserver() {
    if (videoObserver) {
      return;
    }
    
    videoObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            // 检查添加的节点是否是视频元素
            if (node.nodeName === 'VIDEO') {
              handleNewVideoElement(node);
            }
            
            // 检查添加的节点内部是否包含视频元素
            if (node.querySelectorAll) {
              const videos = node.querySelectorAll('video');
              videos.forEach(video => handleNewVideoElement(video));
            }
          });
        }
      });
    });
    
    // 开始观察整个文档
    videoObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // 处理新添加的视频元素
  function handleNewVideoElement(videoElement) {
    if (!translationActive) {
      return;
    }
    
    // 存储原始音量
    const index = originalVolumes.size;
    originalVolumes.set(index, videoElement.volume);
    
    // 将视频静音
    videoElement.volume = 0;
    
    // 添加翻译指示器
    addTranslationIndicator(videoElement);
  }

  // 断开视频元素观察器
  function disconnectVideoElementObserver() {
    if (videoObserver) {
      videoObserver.disconnect();
      videoObserver = null;
    }
  }

  // 注入CSS样式
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .vvt-translation-indicator {
        animation: vvt-pulse 2s infinite;
      }
      
      @keyframes vvt-pulse {
        0% { opacity: 1; }
        50% { opacity: 0.7; }
        100% { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }

  // 检查当前翻译状态并初始化
  async function checkTranslationStatus() {
    try {
      // 向background.js请求当前翻译状态
      chrome.runtime.sendMessage({ action: 'getTranslationStatus' }, (response) => {
        if (chrome.runtime.lastError) {
          console.error('获取翻译状态时出错:', chrome.runtime.lastError);
          return;
        }
        
        // 如果翻译处于活动状态，则启动UI
        if (response && response.isTranslating) {
          startTranslationUI();
        }
      });
    } catch (error) {
      console.error('检查翻译状态时出错:', error);
    }
  }

  // 注入简化版语音处理器脚本
  function injectSimpleSpeechProcessor() {
    try {
      // 移除之前可能存在的script标签
      const existingScript = document.getElementById('vvt-speech-processor');
      if (existingScript) {
        existingScript.remove();
      }
      
      // 创建新的script标签
      const script = document.createElement('script');
      script.id = 'vvt-speech-processor';
      script.src = chrome.runtime.getURL('js/speech_processor_simple.js');
      
      script.onload = function() {
        console.log('简化版语音处理器脚本已加载');
        speechProcessorInjected = true;
      };
      
      script.onerror = function(error) {
        console.error('加载简化版语音处理器脚本失败:', error);
        speechProcessorInjected = false;
      };
      
      // 添加到页面
      (document.head || document.documentElement).appendChild(script);
      console.log('注入简化版语音处理器脚本');
    } catch (error) {
      console.error('注入简化版语音处理器脚本时出错:', error);
    }
  }

  // 初始化
  injectStyles();
  checkTranslationStatus();
  
  console.log('视频声音翻译器内容脚本已加载');
})();
