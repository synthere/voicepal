// 语音处理器 - 主文件
(function() {
  // 确保SpeechUtils已定义
  if (typeof SpeechUtils === 'undefined') {
    console.error('[VoicePal] SpeechUtils未定义，无法继续执行');
    return;
  }
  
  // 确保SpeechCore已定义
  if (typeof SpeechCore === 'undefined') {
    console.error('[VoicePal] SpeechCore未定义，无法继续执行');
    return;
  }
  
  // 确保SpeechTTS已定义
  if (typeof SpeechTTS === 'undefined') {
    console.error('[VoicePal] SpeechTTS未定义，无法继续执行');
    return;
  }
  
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
    lastProcessTime: 0,
    originalVolumes: {}, // 存储视频原始音量
    isSpeaking: false,
    lastProcessedText: "",
    processingTimer: null,
    lastSubtitleTime: 0,
    subtitleHistory: [],
    currentSpeechRate: 1.5, // 提高默认语速到1.5
    recentSubtitles: [], // 存储最近处理的字幕，用于检测重复
    translationSettings: translationSettings
  };

  // 语音合成队列
  const speechQueue = [];

  // 确保chrome.runtime可用
  if (typeof chrome === 'undefined' || !chrome.runtime) {
    console.error('[VoicePal] chrome.runtime未定义，无法监听消息');
    return;
  }

  // 监听来自background.js的消息
  try {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      SpeechUtils.debugLog('消息监听', '收到消息:', message);
      if (message.action === 'translationStarted') {
        if (message.settings) {
          translationSettings = message.settings;
          audioProcessing.translationSettings = translationSettings;
          SpeechUtils.debugLog('设置', '已更新翻译设置:', translationSettings);
        }
        SpeechUtils.log('收到开始翻译消息', translationSettings);
        SpeechCore.startAudioProcessing(audioProcessing, translationSettings, speechQueue);
        SpeechUtils.showTranslationOverlay("视频声音翻译已启动，正在监听视频字幕...");
        sendResponse({ success: true });
      } else if (message.action === 'translationStopped') {
        SpeechUtils.log('收到停止翻译消息');
        SpeechUtils.debugLog('停止流程', '收到停止翻译消息，准备停止音频处理');
        
        // 立即尝试停止任何正在播放的语音
        if (window.speechSynthesis) {
          window.speechSynthesis.cancel();
          SpeechUtils.debugLog('停止流程', '立即取消语音合成');
        }
        
        const currentAudio = SpeechTTS.getCurrentAudio();
        if (currentAudio) {
          try {
            currentAudio.pause();
            currentAudio.currentTime = 0;
            SpeechUtils.debugLog('停止流程', '立即暂停当前音频');
          } catch (e) {
            SpeechUtils.debugLog('停止流程', '暂停音频时出错:', e);
          }
        }
        
        // 调用完整的停止处理函数
        SpeechCore.stopAudioProcessing(audioProcessing);
        
        SpeechUtils.debugLog('停止流程', '停止处理完成，发送响应');
        sendResponse({ success: true });
      }
      return true; // 保持消息通道开放
    });
  } catch (error) {
    console.error('[VoicePal] 设置消息监听器时出错:', error);
  }
  
  // 监听来自content.js的强制停止事件
  document.addEventListener('vvt-force-stop-translation', (event) => {
    SpeechUtils.debugLog('强制停止', '收到强制停止事件:', event.detail);
    
    // 立即停止所有语音处理
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      SpeechUtils.debugLog('强制停止', '已取消所有语音合成');
    }
    
    const currentAudio = SpeechTTS.getCurrentAudio();
    if (currentAudio) {
      try {
        currentAudio.pause();
        currentAudio.currentTime = 0;
        SpeechTTS.setCurrentAudio(null);
        SpeechUtils.debugLog('强制停止', '已停止当前音频播放');
      } catch (e) {
        SpeechUtils.debugLog('强制停止', '停止音频时出错:', e);
      }
    }
    
    // 清空队列
    speechQueue.length = 0;
    audioProcessing.isSpeaking = false;
    
    if (audioProcessing.processingTimer) {
      clearTimeout(audioProcessing.processingTimer);
      audioProcessing.processingTimer = null;
      SpeechUtils.debugLog('强制停止', '已清除处理定时器');
    }
    
    // 调用完整的停止处理函数
    SpeechCore.stopAudioProcessing(audioProcessing);
    
    // 显示停止通知
    SpeechUtils.showTranslationOverlay("字幕转语音已停止");
    
    SpeechUtils.debugLog('强制停止', '所有语音处理已强制停止');
  });
})();
