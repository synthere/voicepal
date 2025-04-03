// 语音处理器 - 核心功能
const SpeechCore = (() => {
  // 语音合成队列和状态
  const MAX_HISTORY_SIZE = 10;
  const MAX_RECENT_SUBTITLES = 5; // 最多存储5条最近的字幕
  
  // 处理字幕文本
  function processSubtitleText(text, audioProcessing, speechQueue) {
    if (!text || text.trim().length === 0) {
      return;
    }
    
    SpeechUtils.debugLog('字幕处理', `处理字幕文本: "${text}"`);
    
    // 记录字幕时间
    audioProcessing.lastSubtitleTime = Date.now();
    
    // 添加到字幕历史
    audioProcessing.subtitleHistory.push({
      text: text,
      time: audioProcessing.lastSubtitleTime
    });
    
    // 保持历史记录在限定大小内
    if (audioProcessing.subtitleHistory.length > MAX_HISTORY_SIZE) {
      audioProcessing.subtitleHistory.shift();
    }
    
    // 将字幕添加到语音队列
    speechQueue.push({
      text: text,
      isTranslated: false
    });
    
    // 处理队列
    processSpeechQueue(audioProcessing, speechQueue);
  }
  
  // 处理语音合成队列
  function processSpeechQueue(audioProcessing, speechQueue) {
    SpeechUtils.debugLog('语音队列', '处理语音队列', {
      queueLength: speechQueue.length,
      isSpeaking: audioProcessing.isSpeaking,
      lastSubtitleTime: new Date(audioProcessing.lastSubtitleTime).toISOString()
    });
    
    if (audioProcessing.processingTimer) {
      clearTimeout(audioProcessing.processingTimer);
      audioProcessing.processingTimer = null;
      SpeechUtils.debugLog('语音队列', '清除处理定时器');
    }
    
    if (speechQueue.length === 0) {
      SpeechUtils.debugLog('语音队列', '队列为空，无需处理');
      return;
    }
    
    const now = Date.now();
    if (audioProcessing.isSpeaking && speechQueue.length > 0 && (now - audioProcessing.lastSubtitleTime) > 2000) {
      SpeechUtils.log('检测到新字幕，取消当前播放');
      SpeechUtils.debugLog('语音队列', '检测到新字幕，取消当前播放', {
        timeSinceLastSubtitle: now - audioProcessing.lastSubtitleTime
      });
      
      const currentAudio = SpeechTTS.getCurrentAudio();
      if (currentAudio) {
        currentAudio.pause();
        SpeechTTS.setCurrentAudio(null);
        SpeechUtils.debugLog('语音队列', '已暂停当前音频元素');
      }
      
      window.speechSynthesis.cancel();
      SpeechUtils.debugLog('语音队列', '已取消语音合成');
      
      audioProcessing.isSpeaking = false;
    }
    
    if (audioProcessing.isSpeaking) {
      SpeechUtils.debugLog('语音队列', '当前正在播放语音，跳过处理');
      return;
    }
    
    const { text: originalText, isTranslated } = speechQueue.shift();
    
    // 首先检查是否与最近处理的文本相同或相似
    if (SpeechTTS.isSimilarToRecentSubtitles(originalText, audioProcessing.recentSubtitles)) {
      SpeechUtils.log(`检测到重复或相似文本，跳过处理: "${originalText}"`);
      audioProcessing.processingTimer = setTimeout(() => processSpeechQueue(audioProcessing, speechQueue), 50);
      return;
    }
    
    // 检查是否需要提取增量内容
    let text = originalText;
    let isIncremental = false;
    
    if (audioProcessing.lastProcessedText) {
      // 检查新字幕是否包含旧字幕
      if (originalText.includes(audioProcessing.lastProcessedText) || audioProcessing.lastProcessedText.includes(originalText)) {
        // 提取增量内容
        const incrementalText = SpeechUtils.extractIncrementalContent(originalText, audioProcessing.lastProcessedText);
        
        // 如果提取出了增量内容，使用增量内容
        if (incrementalText && incrementalText !== originalText) {
          // 再次检查增量内容是否与最近处理的文本相似
          if (SpeechTTS.isSimilarToRecentSubtitles(incrementalText, audioProcessing.recentSubtitles)) {
            SpeechUtils.log(`检测到增量内容与最近文本相似，跳过处理: "${incrementalText}"`);
            audioProcessing.processingTimer = setTimeout(() => processSpeechQueue(audioProcessing, speechQueue), 50);
            return;
          }
          
          text = incrementalText;
          isIncremental = true;
          SpeechUtils.debugLog('字幕增量', `提取增量内容: "${incrementalText}" (原文: "${originalText}", 上一条: "${audioProcessing.lastProcessedText}")`);
        }
      }
    }
    
    // 如果是增量内容，但内容为空，跳过处理
    if (isIncremental && text.trim().length === 0) {
      SpeechUtils.debugLog('字幕增量', '增量内容为空，跳过处理');
      audioProcessing.processingTimer = setTimeout(() => processSpeechQueue(audioProcessing, speechQueue), 50);
      return;
    }
    
    // 添加到最近处理的字幕列表
    audioProcessing.recentSubtitles.push(originalText);
    if (audioProcessing.recentSubtitles.length > MAX_RECENT_SUBTITLES) {
      audioProcessing.recentSubtitles.shift(); // 移除最旧的字幕
    }
    
    audioProcessing.lastProcessedText = originalText;
    audioProcessing.isSpeaking = true;
    
    try {
      // 使用浏览器内置语音合成播放字幕
      SpeechTTS.playWithBrowserTTS(
        text, 
        isTranslated, 
        audioProcessing.translationSettings, 
        audioProcessing, 
        audioProcessing.isSpeaking, 
        () => processSpeechQueue(audioProcessing, speechQueue)
      );
    } catch (error) {
      console.error('播放语音失败:', error);
      audioProcessing.isSpeaking = false;
      audioProcessing.processingTimer = setTimeout(() => processSpeechQueue(audioProcessing, speechQueue), 100);
    }
  }
  
  // 启动音频处理
  function startAudioProcessing(audioProcessing, translationSettings, speechQueue) {
    SpeechUtils.debugLog('启动', '启动音频处理');
    
    if (audioProcessing.active) {
      SpeechUtils.debugLog('启动', '音频处理已经在运行中');
      return;
    }
    
    audioProcessing.active = true;
    audioProcessing.lastProcessTime = Date.now();
    audioProcessing.originalVolumes = {}; // 重置原始音量存储
    
    // 设置字幕观察器
    SubtitleProcessor.setupSubtitleObserver(
      audioProcessing, 
      (text) => processSubtitleText(text, audioProcessing, speechQueue)
    );
    
    // 设置视频时间更新监听器
    SubtitleProcessor.setupVideoTimeUpdateListeners(
      audioProcessing, 
      translationSettings, 
      () => SubtitleProcessor.checkExistingSubtitles(
        audioProcessing, 
        (text) => processSubtitleText(text, audioProcessing, speechQueue)
      )
    );
    
    // 立即检查现有字幕
    SubtitleProcessor.checkExistingSubtitles(
      audioProcessing, 
      (text) => processSubtitleText(text, audioProcessing, speechQueue)
    );
    
    SpeechUtils.debugLog('启动', '音频处理已启动');
  }
  
  // 停止音频处理
  function stopAudioProcessing(audioProcessing) {
    SpeechUtils.debugLog('停止', '停止音频处理');
    
    if (!audioProcessing.active) {
      SpeechUtils.debugLog('停止', '音频处理已经停止');
      return;
    }
    
    // 恢复所有视频的原始音量
    SpeechTTS.restoreVideoVolume(audioProcessing);
    
    // 断开字幕观察器
    if (audioProcessing.subtitleObserver) {
      audioProcessing.subtitleObserver.disconnect();
      audioProcessing.subtitleObserver = null;
      SpeechUtils.debugLog('停止', '已断开字幕观察器');
    }
    
    // 清空视频元素列表
    audioProcessing.videoElements = [];
    
    // 重置状态
    audioProcessing.active = false;
    audioProcessing.lastSubtitleText = "";
    audioProcessing.lastProcessTime = 0;
    audioProcessing.originalVolumes = {};
    
    // 清空字幕历史
    audioProcessing.subtitleHistory.length = 0;
    
    // 清空最近字幕列表
    audioProcessing.recentSubtitles.length = 0;
    
    SpeechUtils.debugLog('停止', '音频处理已停止');
  }
  
  return {
    processSubtitleText,
    processSpeechQueue,
    startAudioProcessing,
    stopAudioProcessing,
    MAX_HISTORY_SIZE,
    MAX_RECENT_SUBTITLES
  };
})();

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpeechCore;
}
