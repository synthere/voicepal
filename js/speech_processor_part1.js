// 语音处理器 - 在内容脚本环境中运行
(function() {
  // 存储翻译设置
  let translationSettings = {
    enabled: true,
    sourceLanguage: 'auto',
    targetLanguage: 'zh-CN',
    captureInterval: 3000,
    minAudioSize: 100,
    subtitleToSpeech: true // 新增：是否将字幕转为语音
  };

  // 存储音频处理状态
  let audioProcessing = {
    active: false,
    videoElements: [],
    subtitleObserver: null,
    lastSubtitleText: "",
    lastProcessTime: 0
  };

  // 调试模式
  const DEBUG = true;
  
  // 调试日志
  function log(...args) {
    if (DEBUG) {
      console.log('[VoicePal]', ...args);
    }
  }
  
  // 增强调试日志 - 显示在控制台中更明显
  function debugLog(area, ...args) {
    if (DEBUG) {
      console.log(`%c[VoicePal调试-${area}]`, 'background: #ff5722; color: white; padding: 2px 5px; border-radius: 3px;', ...args);
    }
  }

  // 监听来自background.js的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    debugLog('消息监听', '收到消息:', message);
    if (message.action === 'translationStarted') {
      if (message.settings) {
        translationSettings = message.settings;
        debugLog('设置', '已更新翻译设置:', translationSettings);
      }
      log('收到开始翻译消息', translationSettings);
      startAudioProcessing();
      showTranslationOverlay("视频声音翻译已启动，正在监听视频字幕...");
      sendResponse({ success: true });
    } else if (message.action === 'translationStopped') {
      log('收到停止翻译消息');
      debugLog('停止流程', '收到停止翻译消息，准备停止音频处理');
      
      // 立即尝试停止任何正在播放的语音
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
        debugLog('停止流程', '立即取消语音合成');
      }
      
      if (currentAudio) {
        try {
          currentAudio.pause();
          currentAudio.currentTime = 0;
          debugLog('停止流程', '立即暂停当前音频');
        } catch (e) {
          debugLog('停止流程', '暂停音频时出错:', e);
        }
      }
      
      // 调用完整的停止处理函数
      stopAudioProcessing();
      
      debugLog('停止流程', '停止处理完成，发送响应');
      sendResponse({ success: true });
    }
  });
  
  // 监听来自content.js的强制停止事件
  document.addEventListener('vvt-force-stop-translation', (event) => {
    debugLog('强制停止', '收到强制停止事件:', event.detail);
    
    // 立即停止所有语音处理
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      debugLog('强制停止', '已取消所有语音合成');
    }
    
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        currentAudio = null;
        debugLog('强制停止', '已停止当前音频播放');
      } catch (e) {
        debugLog('强制停止', '停止音频时出错:', e);
      }
    }
    
    // 清空队列
    speechQueue.length = 0;
    isSpeaking = false;
    
    if (processingTimer) {
      clearTimeout(processingTimer);
      processingTimer = null;
      debugLog('强制停止', '已清除处理定时器');
    }
    
    // 调用完整的停止处理函数
    stopAudioProcessing();
    
    // 显示停止通知
    showTranslationOverlay("字幕转语音已停止");
    
    debugLog('强制停止', '所有语音处理已强制停止');
  });

  // 显示翻译文本覆盖层
  function showTranslationOverlay(text) {
    log('显示翻译文本覆盖层:', text);
    
    let overlay = document.getElementById('vvt-translation-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'vvt-translation-overlay';
      overlay.style.position = 'fixed';
      overlay.style.bottom = '80px';
      overlay.style.left = '50%';
      overlay.style.transform = 'translateX(-50%)';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      overlay.style.color = 'white';
      overlay.style.padding = '15px 25px';
      overlay.style.borderRadius = '8px';
      overlay.style.fontSize = '20px';
      overlay.style.fontWeight = 'bold';
      overlay.style.maxWidth = '80%';
      overlay.style.textAlign = 'center';
      overlay.style.zIndex = '9999';
      overlay.style.transition = 'opacity 0.5s';
      overlay.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
      overlay.style.pointerEvents = 'none';
      document.body.appendChild(overlay);
    }
    
    overlay.textContent = text;
    overlay.style.opacity = '1';
    
    // 避免重复添加
    if (!overlay.parentNode) {
      document.body.appendChild(overlay);
    }
    
    // 减少显示时间，避免长时间遮挡
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 500);
    }, 5000);
  }

  // 语音合成队列和状态
  const speechQueue = [];
  let isSpeaking = false;
  let lastProcessedText = "";
  let processingTimer = null;
  let lastSubtitleTime = 0;
  let subtitleHistory = [];
  const MAX_HISTORY_SIZE = 10;
  let currentSpeechRate = 1.5; // 提高默认语速到1.5
  let recentSubtitles = []; // 存储最近处理的字幕，用于检测重复
  const MAX_RECENT_SUBTITLES = 5; // 最多存储5条最近的字幕
  
  // 防抖函数，用于减少重复调用
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }
  
  // 计算自适应语音速率
  function calculateAdaptiveSpeechRate() {
    if (subtitleHistory.length < 2) {
      return 1.5; // 提高默认语速到1.5
    }
    
    let totalInterval = 0;
    for (let i = 1; i < subtitleHistory.length; i++) {
      totalInterval += subtitleHistory[i].time - subtitleHistory[i-1].time;
    }
    const avgInterval = totalInterval / (subtitleHistory.length - 1);
    
    const totalLength = subtitleHistory.reduce((sum, item) => sum + item.text.length, 0);
    const avgLength = totalLength / subtitleHistory.length;
    
    let rate;
    if (avgInterval < 2000) {
      if (avgLength > 20) {
        rate = 1.6; // 提高语速
      } else {
        rate = 1.4; // 提高语速
      }
    } else if (avgInterval < 4000) {
      if (avgLength > 20) {
        rate = 1.4; // 提高语速
      } else {
        rate = 1.3; // 提高语速
      }
    } else {
      if (avgLength > 30) {
        rate = 1.3; // 提高语速
      } else {
        rate = 1.2; // 提高语速
      }
    }
    
    currentSpeechRate = currentSpeechRate * 0.7 + rate * 0.3;
    currentSpeechRate = Math.max(1.0, Math.min(2.0, currentSpeechRate)); // 提高语速范围
    
    return currentSpeechRate;
  }
  
  // 从新字幕中提取增量内容
  function extractIncrementalContent(newText, oldText) {
    // 如果没有旧文本，直接返回新文本
    if (!oldText) {
      return newText;
    }
    
    // 如果新文本与旧文本相同，返回空字符串
    if (newText === oldText) {
      return '';
    }
    
    // 如果新文本包含旧文本，提取增量部分
    if (newText.includes(oldText)) {
      // 找到旧文本在新文本中的位置
      const index = newText.indexOf(oldText);
      
      // 提取前缀和后缀
      const prefix = newText.substring(0, index);
      const suffix = newText.substring(index + oldText.length);
      
      // 如果前缀和后缀都不为空，选择较长的那个
      if (prefix && suffix) {
        return prefix.length > suffix.length ? prefix : suffix;
      }
      
      // 返回非空的部分
      return prefix || suffix;
    }
    
    // 如果旧文本包含新文本，返回空字符串（这种情况不应该播放）
    if (oldText.includes(newText)) {
      return '';
    }
    
    // 尝试找到最长的公共子串
    let longestCommonSubstring = '';
    for (let i = 0; i < oldText.length; i++) {
      for (let j = i + 1; j <= oldText.length; j++) {
        const substring = oldText.substring(i, j);
        if (newText.includes(substring) && substring.length > longestCommonSubstring.length) {
          longestCommonSubstring = substring;
        }
      }
    }
    
    // 如果找到了公共子串，并且长度超过旧文本的一半
    if (longestCommonSubstring && longestCommonSubstring.length > oldText.length / 2) {
      // 找到公共子串在新文本中的位置
      const index = newText.indexOf(longestCommonSubstring);
      
      // 提取前缀和后缀
      const prefix = newText.substring(0, index);
      const suffix = newText.substring(index + longestCommonSubstring.length);
      
      // 如果前缀和后缀都不为空，选择较长的那个
      if (prefix && suffix) {
        return prefix.length > suffix.length ? prefix : suffix;
      }
      
      // 返回非空的部分
      return prefix || suffix;
    }
    
    // 如果没有找到明显的增量部分，返回完整的新文本
    return newText;
  }
