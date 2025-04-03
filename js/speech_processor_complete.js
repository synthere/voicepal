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
  
  // 检查文本是否与最近的字幕相似
  function isSimilarToRecentSubtitles(text) {
    // 如果字幕列表为空，直接返回false
    if (recentSubtitles.length === 0) {
      return false;
    }
    
    // 调试日志
    debugLog('字幕相似度', `检查字幕相似度: "${text}"`);
    debugLog('字幕相似度', `最近字幕列表:`, recentSubtitles);
    
    // 只检查最后一个字幕，减少误判
    const lastSubtitle = recentSubtitles[recentSubtitles.length - 1];
    
    // 完全相同
    if (text === lastSubtitle) {
      debugLog('字幕相似度', `完全相同: "${text}" === "${lastSubtitle}"`);
      return true;
    }
    
    // 如果字幕长度小于5个字符，不进行相似度检查，直接播放
    if (text.length < 5) {
      debugLog('字幕相似度', `字幕太短，不进行相似度检查: "${text}"`);
      return false;
    }
    
    // 一个文本完全包含另一个文本，且长度差异很小
    if ((text.includes(lastSubtitle) || lastSubtitle.includes(text)) && 
        Math.abs(text.length - lastSubtitle.length) < 3) {
      debugLog('字幕相似度', `文本包含关系且长度差异小: "${text}" 和 "${lastSubtitle}"`);
      return true;
    }
    
    // 计算相似度（简单实现）- 降低相似度阈值
    let commonChars = 0;
    for (let i = 0; i < text.length; i++) {
      if (lastSubtitle.includes(text[i])) {
        commonChars++;
      }
    }
    const similarity = commonChars / text.length;
    debugLog('字幕相似度', `相似度: ${similarity} (${commonChars}/${text.length})`);
    
    // 降低相似度阈值到90%，确保更多字幕能被播放
    if (similarity > 0.9) {
      debugLog('字幕相似度', `相似度过高: ${similarity}`);
      return true;
    }
    
    debugLog('字幕相似度', `字幕不相似，允许播放`);
    return false;
  }
  
  // 处理语音合成队列
  function processSpeechQueue() {
    debugLog('语音队列', '处理语音队列', {
      queueLength: speechQueue.length,
      isSpeaking: isSpeaking,
      lastSubtitleTime: new Date(lastSubtitleTime).toISOString()
    });
    
    if (processingTimer) {
      clearTimeout(processingTimer);
      processingTimer = null;
      debugLog('语音队列', '清除处理定时器');
    }
    
    if (speechQueue.length === 0) {
      debugLog('语音队列', '队列为空，无需处理');
      return;
    }
    
    const now = Date.now();
    if (isSpeaking && speechQueue.length > 0 && (now - lastSubtitleTime) > 2000) {
      log('检测到新字幕，取消当前播放');
      debugLog('语音队列', '检测到新字幕，取消当前播放', {
        timeSinceLastSubtitle: now - lastSubtitleTime
      });
      
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
        debugLog('语音队列', '已暂停当前音频元素');
      }
      
      window.speechSynthesis.cancel();
      debugLog('语音队列', '已取消语音合成');
      
      isSpeaking = false;
    }
    
    if (isSpeaking) {
      debugLog('语音队列', '当前正在播放语音，跳过处理');
      return;
    }
    
    const { text: originalText, isTranslated } = speechQueue.shift();
    
    // 检查是否需要提取增量内容
    let text = originalText;
    let isIncremental = false;
    
    if (lastProcessedText) {
      // 检查新字幕是否包含旧字幕
      if (originalText.includes(lastProcessedText) || lastProcessedText.includes(originalText)) {
        // 提取增量内容
        const incrementalText = extractIncrementalContent(originalText, lastProcessedText);
        
        // 如果提取出了增量内容，使用增量内容
        if (incrementalText && incrementalText !== originalText) {
          text = incrementalText;
          isIncremental = true;
          debugLog('字幕增量', `提取增量内容: "${incrementalText}" (原文: "${originalText}", 上一条: "${lastProcessedText}")`);
        }
      }
    }
    
    // 如果是增量内容，但内容为空，跳过处理
    if (isIncremental && text.trim().length === 0) {
      debugLog('字幕增量', '增量内容为空，跳过处理');
      processingTimer = setTimeout(processSpeechQueue, 50);
      return;
    }
    
    // 如果不是增量内容，检查是否与最近处理的文本相同或相似
    if (!isIncremental && (text === lastProcessedText || isSimilarToRecentSubtitles(text))) {
      log(`检测到重复或相似文本，但仍继续处理: "${text}"`);
      // 继续处理，不返回
    }
    
    // 添加到最近处理的字幕列表
    recentSubtitles.push(originalText);
    if (recentSubtitles.length > MAX_RECENT_SUBTITLES) {
      recentSubtitles.shift(); // 移除最旧的字幕
    }
    
    lastProcessedText = originalText;
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
    debugLog('语音合成', '尝试使用浏览器TTS播放文本:', text);
    debugLog('语音合成', '当前TTS设置:', {
      isTranslated: isTranslated,
      targetLanguage: translationSettings.targetLanguage,
      sourceLanguage: translationSettings.sourceLanguage
    });
    
    if (window.speechSynthesis) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        debugLog('语音合成', '恢复已暂停的语音合成');
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      utterance.lang = isTranslated ? translationSettings.targetLanguage : 
                      (translationSettings.sourceLanguage !== 'auto' ? translationSettings.sourceLanguage : 'zh-CN');
      
      utterance.volume = 1.0;
      utterance.rate = calculateAdaptiveSpeechRate();
      utterance.pitch = 1.0;
      
      debugLog('语音合成', '语音参数设置:', {
        lang: utterance.lang,
        volume: utterance.volume,
        rate: utterance.rate,
        pitch: utterance.pitch
      });
      
      // 获取可用的语音列表
      const voices = window.speechSynthesis.getVoices();
      debugLog('语音合成', `可用语音列表: ${voices.length}个语音`);
      if (voices.length > 0) {
        const matchingVoices = voices.filter(voice => voice.lang.includes(utterance.lang.split('-')[0]));
        debugLog('语音合成', `匹配当前语言的语音: ${matchingVoices.length}个`);
        if (matchingVoices.length > 0) {
          utterance.voice = matchingVoices[0];
          debugLog('语音合成', `已选择语音: ${utterance.voice.name} (${utterance.voice.lang})`);
        }
      }
      
      const actionType = isTranslated ? '翻译' : '原始';
      
      utterance.onstart = () => {
        log(`开始播放${actionType}语音: "${text}"`);
        debugLog('语音合成', `开始播放${actionType}语音`);
      };
      
      utterance.onend = () => {
        log(`${actionType}语音播放结束: "${text}"`);
        debugLog('语音合成', `${actionType}语音播放结束`);
        isSpeaking = false;
        processSpeechQueue();
      };
      
      utterance.onerror = (e) => {
        console.error(`${actionType}语音播放错误:`, e);
        debugLog('语音合成', `${actionType}语音播放错误:`, e);
        isSpeaking = false;
        processingTimer = setTimeout(processSpeechQueue, 100);
      };
      
      window.speechSynthesis.speak(utterance);
      log(`${actionType}语音合成请求已发送`);
    } else {
      log('浏览器不支持语音合成API');
      debugLog('语音合成', '浏览器不支持语音合成API');
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
      
    } catch (error
