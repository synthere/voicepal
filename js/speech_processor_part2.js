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
