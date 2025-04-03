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

  // 监听来自background.js的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'translationStarted') {
      if (message.settings) {
        translationSettings = message.settings;
      }
      log('收到开始翻译消息', translationSettings);
      startAudioProcessing();
      showTranslationOverlay("视频声音翻译已启动，正在监听视频字幕...");
      sendResponse({ success: true });
    } else if (message.action === 'translationStopped') {
      log('收到停止翻译消息');
      stopAudioProcessing();
      sendResponse({ success: true });
    }
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
  
  // 检查文本是否与最近的字幕相似
  function isSimilarToRecentSubtitles(text) {
    for (const recentText of recentSubtitles) {
      // 完全相同
      if (text === recentText) {
        return true;
      }
      
      // 一个文本包含另一个文本
      if (text.includes(recentText) || recentText.includes(text)) {
        // 如果长度差异不大，认为是相似的
        const lengthDiff = Math.abs(text.length - recentText.length);
        if (lengthDiff < text.length * 0.3) { // 长度差异小于30%
          return true;
        }
      }
      
      // 计算相似度（简单实现）
      let commonChars = 0;
      for (let i = 0; i < text.length; i++) {
        if (recentText.includes(text[i])) {
          commonChars++;
        }
      }
      const similarity = commonChars / text.length;
      if (similarity > 0.7) { // 相似度大于70%
        return true;
      }
    }
    return false;
  }
  
  // 处理语音合成队列
  function processSpeechQueue() {
    if (processingTimer) {
      clearTimeout(processingTimer);
      processingTimer = null;
    }
    
    if (speechQueue.length === 0) {
      return;
    }
    
    const now = Date.now();
    if (isSpeaking && speechQueue.length > 0 && (now - lastSubtitleTime) > 2000) {
      log('检测到新字幕，取消当前播放');
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      window.speechSynthesis.cancel();
      isSpeaking = false;
    }
    
    if (isSpeaking) {
      return;
    }
    
    const { text, isTranslated } = speechQueue.shift();
    
    // 增强重复检测
    if (text === lastProcessedText || isSimilarToRecentSubtitles(text)) {
      log(`跳过重复或相似文本: "${text}"`);
      processingTimer = setTimeout(processSpeechQueue, 50);
      return;
    }
    
    // 添加到最近处理的字幕列表
    recentSubtitles.push(text);
    if (recentSubtitles.length > MAX_RECENT_SUBTITLES) {
      recentSubtitles.shift(); // 移除最旧的字幕
    }
    
    lastProcessedText = text;
    isSpeaking = true;
    
    try {
      // 根据选择的TTS服务处理
      switch (translationSettings.ttsService) {
        case 'elevenlabs':
          // 使用ElevenLabs API
          if (translationSettings.elevenLabsApiKey && translationSettings.elevenLabsVoiceId) {
            playWithElevenLabs(text, isTranslated);
          } else {
            log('ElevenLabs API密钥或语音ID未设置，回退到浏览器内置语音合成');
            playWithBrowserTTS(text, isTranslated);
          }
          break;
          
        case 'customapi':
          // 使用自定义API
          if (translationSettings.customApiUrl) {
            playWithCustomApi(text, isTranslated);
          } else {
            log('自定义API服务器地址未设置，回退到浏览器内置语音合成');
            playWithBrowserTTS(text, isTranslated);
          }
          break;
          
        case 'browser':
        default:
          // 使用浏览器内置语音合成
          playWithBrowserTTS(text, isTranslated);
          break;
      }
    } catch (error) {
      console.error('播放语音失败:', error);
      isSpeaking = false;
      processingTimer = setTimeout(processSpeechQueue, 100);
    }
  }
  
  // 使用浏览器内置语音合成
  function playWithBrowserTTS(text, isTranslated) {
    if (window.speechSynthesis) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      utterance.lang = isTranslated ? translationSettings.targetLanguage : 
                      (translationSettings.sourceLanguage !== 'auto' ? translationSettings.sourceLanguage : 'zh-CN');
      
      utterance.volume = 1.0;
      utterance.rate = calculateAdaptiveSpeechRate();
      utterance.pitch = 1.0;
      
      const actionType = isTranslated ? '翻译' : '原始';
      
      utterance.onstart = () => {
        log(`开始播放${actionType}语音: "${text}"`);
      };
      
      utterance.onend = () => {
        log(`${actionType}语音播放结束: "${text}"`);
        isSpeaking = false;
        processSpeechQueue();
      };
      
      utterance.onerror = (e) => {
        console.error(`${actionType}语音播放错误:`, e);
        isSpeaking = false;
        processingTimer = setTimeout(processSpeechQueue, 100);
      };
      
      window.speechSynthesis.speak(utterance);
      log(`${actionType}语音合成请求已发送`);
    } else {
      log('浏览器不支持语音合成API');
      isSpeaking = false;
      processingTimer = setTimeout(processSpeechQueue, 100);
    }
  }
  
  // 存储当前播放的音频元素
  let currentAudio = null;
  
  // 使用ElevenLabs API播放语音
  async function playWithElevenLabs(text, isTranslated) {
    try {
      const actionType = isTranslated ? '翻译' : '原始';
      log(`使用ElevenLabs播放${actionType}语音: "${text}"`);
      
      // 准备请求参数
      const voiceId = translationSettings.elevenLabsVoiceId;
      const apiKey = translationSettings.elevenLabsApiKey;
      
      // 设置语音参数
      const voiceSettings = {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true
      };
      
      // 发送请求到ElevenLabs API
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: voiceSettings
        })
      });
      
      if (!response.ok) {
        throw new Error(`ElevenLabs API请求失败: ${response.status}`);
      }
      
      // 获取音频数据
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // 创建音频元素并播放
      const audio = new Audio(audioUrl);
      currentAudio = audio;
      
      audio.onended = () => {
        log(`ElevenLabs ${actionType}语音播放结束: "${text}"`);
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        isSpeaking = false;
        processSpeechQueue();
      };
      
      audio.onerror = (e) => {
        console.error(`ElevenLabs ${actionType}语音播放错误:`, e);
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        isSpeaking = false;
        processingTimer = setTimeout(processSpeechQueue, 100);
      };
      
      audio.playbackRate = calculateAdaptiveSpeechRate();
      await audio.play();
      log(`ElevenLabs ${actionType}语音开始播放`);
      
    } catch (error) {
      console.error('ElevenLabs语音合成失败:', error);
      log(`ElevenLabs语音合成失败: ${error.message}，尝试使用浏览器内置语音合成`);
      
      // 如果ElevenLabs失败，回退到浏览器内置语音合成
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = isTranslated ? translationSettings.targetLanguage : 
                        (translationSettings.sourceLanguage !== 'auto' ? translationSettings.sourceLanguage : 'zh-CN');
        utterance.volume = 1.0;
        utterance.rate = calculateAdaptiveSpeechRate();
        utterance.pitch = 1.0;
        
        utterance.onend = () => {
          isSpeaking = false;
          processSpeechQueue();
        };
        
        utterance.onerror = () => {
          isSpeaking = false;
          processingTimer = setTimeout(processSpeechQueue, 100);
        };
        
        window.speechSynthesis.speak(utterance);
      } else {
        isSpeaking = false;
        processingTimer = setTimeout(processSpeechQueue, 100);
      }
    }
  }
  
  // 使用自定义API进行语音合成
  async function playWithCustomApi(text, isTranslated) {
    try {
      const actionType = isTranslated ? '翻译' : '原始';
      log(`使用自定义API播放${actionType}语音: "${text}"`);
      
      // 准备请求参数
      const apiUrl = translationSettings.customApiUrl;
      
      // 构建请求体
      const requestBody = {
        text: text,
        emphasize: 0, // 默认不强调
        denoise: 0 // 默认不降噪
      };
      
      // 如果有参考音频，添加到请求体
      if (translationSettings.customApiRefAudio) {
        requestBody.ref_audio = translationSettings.customApiRefAudio;
      }
      
      // 发送请求到自定义API
      const response = await fetch(`${apiUrl}/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`API请求失败: ${response.status}`);
      }
      
      // 直接获取音频Blob
      const audioBlob = await response.blob();
      
      // 创建音频URL并播放
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudio = audio;
      
      audio.onended = () => {
        log(`自定义API ${actionType}语音播放结束: "${text}"`);
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        isSpeaking = false;
        processSpeechQueue();
      };
      
      audio.onerror = (e) => {
        console.error(`自定义API ${actionType}语音播放错误:`, e);
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        isSpeaking = false;
        processingTimer = setTimeout(processSpeechQueue, 100);
      };
      
      audio.playbackRate = calculateAdaptiveSpeechRate();
      await audio.play();
      log(`自定义API ${actionType}语音开始播放`);
      
    } catch (error) {
      console.error('自定义API语音合成失败:', error);
      log(`自定义API语音合成失败: ${error.message}，回退到浏览器内置语音合成`);
      
      // 如果自定义API失败，回退到浏览器内置语音合成
      playWithBrowserTTS(text, isTranslated);
    }
  }
  
  // 使用音频元素播放文本
  function playTextWithAudio(text, isTranslated = true) {
    if (isTranslated) {
      log(`播放翻译文本: "${text}"`);
    } else {
      log(`播放原始字幕文本: "${text}"`);
    }
    
    // 不再显示字幕覆盖层，因为原视频已经显示字幕
    // showTranslationOverlay(text);
    
    speechQueue.push({ text, isTranslated });
    processSpeechQueue();
  }
  
  // 兼容原有函数
  function playTranslatedTextWithAudio(text) {
    playTextWithAudio(text, true);
  }

  // 处理字幕文本
  function processSubtitleText(text) {
    if (!text || text.trim().length === 0) return;
    
    const cleanText = text.trim();
    
    if (cleanText === audioProcessing.lastSubtitleText) {
      return;
    }
    
    if (cleanText.length < 2) {
      log(`字幕太短，跳过: "${cleanText}"`);
      return;
    }
    
    if (cleanText.includes('{') && cleanText.includes('}')) {
      log(`疑似JSON或脚本内容，跳过: "${cleanText.substring(0, 50)}..."`);
      return;
    }
    
    if (cleanText.includes('<') && cleanText.includes('>')) {
      log(`疑似HTML内容，跳过: "${cleanText.substring(0, 50)}..."`);
      return;
    }
    
    if (cleanText.length > 300) {
      log(`文本过长，可能不是字幕，跳过: "${cleanText.substring(0, 50)}..."`);
      return;
    }
    
    // 增强过滤，排除YouTube字幕设置界面的文本
    if (cleanText.includes('>>') || 
        cleanText.includes('查看设置') || 
        cleanText.includes('点击') ||
        cleanText.includes('运行时完成答案') ||
        (cleanText.includes('英语') && cleanText.includes('中文'))) {
      log(`排除非字幕UI元素: "${cleanText}"`);
      return;
    }
    
    const now = Date.now();
    if (now - audioProcessing.lastProcessTime < 500) {
      log(`处理间隔太短，跳过: "${cleanText}"`);
      return;
    }
    
    // 检查是否与最近的字幕相似
    if (isSimilarToRecentSubtitles(cleanText)) {
      log(`检测到相似字幕，跳过: "${cleanText}"`);
      return;
    }
    
    // 添加到最近字幕列表
    recentSubtitles.push(cleanText);
    if (recentSubtitles.length > MAX_RECENT_SUBTITLES) {
      recentSubtitles.shift(); // 移除最旧的字幕
    }
    
    log(`检测到字幕: "${cleanText}"`);
    audioProcessing.lastSubtitleText = cleanText;
    audioProcessing.lastProcessTime = now;
    lastSubtitleTime = now;
    
    subtitleHistory.push({ text: cleanText, time: now });
    if (subtitleHistory.length > MAX_HISTORY_SIZE) {
      subtitleHistory.shift();
    }
    
    log('播放原始字幕');
    
    audioProcessing.videoElements.forEach(video => {
      if (!video.muted && video.volume > 0.4) {
        video._originalVolume = video.volume;
        video.volume = 0.4; // 将原视频音量设置为0.4
        log(`已降低视频音量至0.4，原音量为${video._originalVolume}`);
      }
    });
    
    // 不再显示字幕覆盖层，因为原视频已经显示字幕
    // showTranslationOverlay(cleanText);
    
    if (speechQueue.length > 2) {
      log(`队列中已有${speechQueue.length}个项目，清空队列以避免延迟`);
      speechQueue.length = 0;
    }
    
    playTextWithAudio(cleanText, false);
  }

  // 开始音频处理
  async function startAudioProcessing() {
    try {
      stopAudioProcessing();
      
      const isYouTube = window.location.hostname.includes('youtube.com');
      log(`当前网站: ${window.location.hostname}, 是否YouTube: ${isYouTube}`);
      
      if (isYouTube && translationSettings.subtitleToSpeech) {
        showTranslationOverlay("YouTube字幕转语音已启动，正在监听字幕...");
        setTimeout(() => {
          showTranslationOverlay("请确保视频已打开字幕，以便我们能够转换字幕为语音");
        }, 3000);
      }
      
      const videoElements = document.querySelectorAll('video');
      if (videoElements.length === 0) {
        throw new Error('页面上没有找到视频元素');
      }
      
      log(`找到 ${videoElements.length} 个视频元素`);
      
      const validVideoElements = Array.from(videoElements).filter(video => {
        const isVisible = video.offsetWidth > 0 && video.offsetHeight > 0;
        const hasAudio = video.mozHasAudio !== undefined ? video.mozHasAudio : true;
        const isInIframe = window !== window.top;
        
        if (isYouTube) {
          const isMainPlayer = video.classList.contains('html5-main-video') || 
                              video.id === 'movie_player' || 
                              video.closest('#movie_player') !== null;
          return isVisible && hasAudio && isMainPlayer;
        }
        
        return isVisible && hasAudio && (!isInIframe || document.domain === document.domain.top);
      });
      
      log(`过滤后有 ${validVideoElements.length} 个有效视频元素`);
      
      if (validVideoElements.length === 0) {
        throw new Error('没有找到有效的视频元素');
      }
      
      audioProcessing.videoElements = validVideoElements;
      audioProcessing.active = true;
      
      setupSubtitleObserver();
      
      try {
        document.dispatchEvent(new CustomEvent('vvt-translation-started'));
        log('已发送翻译开始事件');
      } catch (e) {
        console.error('发送事件通知时出错:', e);
      }
      
      if (isYouTube && translationSettings.subtitleToSpeech) {
        try {
          const subtitleButton = document.querySelector('.ytp-subtitles-button');
          if (subtitleButton) {
            const isSubtitleOn = subtitleButton.getAttribute('aria-pressed') === 'true';
            if (!isSubtitleOn) {
              log('尝试自动打开字幕');
              subtitleButton.click();
              showTranslationOverlay("已自动尝试打开字幕");
            } else {
              log('字幕已经开启');
            }
          }
        } catch (e) {
          log('自动打开字幕失败:', e);
        }
      } else if (!isYouTube) {
        showTranslationOverlay("视频声音翻译已启动，正在监听视频字幕...");
      }
      
      setupVideoTimeUpdateListeners();
      
    } catch (error) {
      console.error('启动音频处理时出错:', error);
      showTranslationOverlay(`启动音频处理时出错: ${error.message}`);
      
      try {
        chrome.runtime.sendMessage({ 
          action: 'processingError', 
          error: error.message 
        });
      } catch (e) {
        console.error('发送事件通知时出错:', e);
      }
    }
  }

  // 设置字幕监听器
  function setupSubtitleObserver() {
    log('设置字幕监听器');
    
    if (audioProcessing.subtitleObserver) {
      audioProcessing.subtitleObserver.disconnect();
    }
    
    const observer = new MutationObserver(debounce((mutations) => {
      if (!audioProcessing.active) return;
      
      const subtitleTexts = new Set();
      
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const text = getSubtitleTextFromElement(node);
            if (text) subtitleTexts.add(text);
          }
        }
        
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          const text = getSubtitleTextFromElement(mutation.target);
          if (text) subtitleTexts.add(text);
        }
      }
      
      if (subtitleTexts.size > 0) {
        const combinedText = Array.from(subtitleTexts).join(' ');
        processSubtitleText(combinedText);
      }
    }, 300));
    
    const observerConfig = {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    };
    
    observer.observe(document.body, observerConfig);
    audioProcessing.subtitleObserver = observer;
    
    log('字幕监听器已设置');
    checkExistingSubtitles();
  }
  
  // 从元素中获取字幕文本
  function getSubtitleTextFromElement(element) {
    if (!element) return null;
    
    let subtitleText = '';
    
    if (element.nodeType === Node.TEXT_NODE) {
      const parent = element.parentElement;
      if (parent && parent.classList && (
          parent.classList.contains('ytp-caption-segment') || 
          parent.classList.contains('captions-text'))) {
        subtitleText = element.textContent;
      }
    } else {
      if (element.classList && (
          element.classList.contains('ytp-caption-segment') || 
          element.classList.contains('captions-text'))) {
        subtitleText = element.textContent;
      }
    }
    
    // 过滤掉不是字幕的内容
    if (subtitleText) {
      // 排除YouTube字幕设置界面的文本
      if (subtitleText.includes('>>') || 
          subtitleText.includes('查看设置') || 
          subtitleText.includes('点击') ||
          subtitleText.includes('运行时完成答案') ||
          (subtitleText.includes('英语') && subtitleText.includes('中文'))) {
        log(`排除非字幕UI元素:
