// 语音处理器 - 语音合成
const SpeechTTS = (() => {
  // 存储当前播放的音频元素
  let currentAudio = null;
  
  // 检查文本是否与最近的字幕相似
  function isSimilarToRecentSubtitles(text, recentSubtitles) {
    // 如果字幕列表为空，直接返回false
    if (recentSubtitles.length === 0) {
      return false;
    }
    
    // 调试日志
    SpeechUtils.debugLog('字幕相似度', `检查字幕相似度: "${text}"`);
    SpeechUtils.debugLog('字幕相似度', `最近字幕列表:`, recentSubtitles);
    
    // 检查所有最近的字幕，不仅仅是最后一个
    for (let i = 0; i < recentSubtitles.length; i++) {
      const subtitle = recentSubtitles[i];
      
      // 完全相同
      if (text === subtitle) {
        SpeechUtils.debugLog('字幕相似度', `完全相同: "${text}" === "${subtitle}"`);
        return true;
      }
      
      // 如果字幕长度小于5个字符，仍然检查是否完全包含在最近字幕中
      if (text.length < 5) {
        if (subtitle.includes(text)) {
          SpeechUtils.debugLog('字幕相似度', `短字幕被包含在最近字幕中: "${text}" 在 "${subtitle}" 中`);
          return true;
        }
      } else {
        // 一个文本完全包含另一个文本，且长度差异不大
        if ((text.includes(subtitle) || subtitle.includes(text)) && 
            Math.abs(text.length - subtitle.length) < 5) {
          SpeechUtils.debugLog('字幕相似度', `文本包含关系且长度差异小: "${text}" 和 "${subtitle}"`);
          return true;
        }
        
        // 计算相似度 - 使用更精确的方法
        const longerText = text.length > subtitle.length ? text : subtitle;
        const shorterText = text.length > subtitle.length ? subtitle : text;
        
        // 检查是否有大量重叠字符
        let commonChars = 0;
        for (let j = 0; j < shorterText.length; j++) {
          if (longerText.includes(shorterText[j])) {
            commonChars++;
          }
        }
        
        const similarity = commonChars / shorterText.length;
        SpeechUtils.debugLog('字幕相似度', `相似度: ${similarity} (${commonChars}/${shorterText.length})`);
        
        // 提高相似度阈值到95%，更严格地过滤相似内容
        if (similarity > 0.95) {
          SpeechUtils.debugLog('字幕相似度', `相似度过高: ${similarity}`);
          return true;
        }
      }
    }
    
    SpeechUtils.debugLog('字幕相似度', `字幕不相似，允许播放`);
    return false;
  }
  
  // 计算自适应语音速率
  function calculateAdaptiveSpeechRate(subtitleHistory, currentSpeechRate) {
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
    
    const newRate = currentSpeechRate * 0.7 + rate * 0.3;
    return Math.max(1.0, Math.min(2.0, newRate)); // 提高语速范围
  }
  
  // 降低视频音量
  function lowerVideoVolume(audioProcessing) {
    const videoElements = document.querySelectorAll('video');
    videoElements.forEach((video, index) => {
      // 存储原始音量
      if (audioProcessing.originalVolumes[index] === undefined) {
        audioProcessing.originalVolumes[index] = video.volume;
      }
      // 降低音量到原来的30%
      video.volume = Math.max(0.3, audioProcessing.originalVolumes[index] * 0.3);
      SpeechUtils.debugLog('音量控制', `降低视频音量: ${audioProcessing.originalVolumes[index]} -> ${video.volume}`);
    });
  }
  
  // 恢复视频音量
  function restoreVideoVolume(audioProcessing) {
    const videoElements = document.querySelectorAll('video');
    videoElements.forEach((video, index) => {
      // 恢复原始音量
      if (audioProcessing.originalVolumes[index] !== undefined) {
        video.volume = audioProcessing.originalVolumes[index];
        SpeechUtils.debugLog('音量控制', `恢复视频音量: ${video.volume}`);
      }
    });
  }
  
  // 使用浏览器内置语音合成
  function playWithBrowserTTS(text, isTranslated, translationSettings, audioProcessing, isSpeaking, processSpeechQueue) {
    SpeechUtils.debugLog('语音合成', '尝试使用浏览器TTS播放文本:', text);
    
    if (window.speechSynthesis) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
        SpeechUtils.debugLog('语音合成', '恢复已暂停的语音合成');
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      utterance.lang = isTranslated ? translationSettings.targetLanguage : 
                      (translationSettings.sourceLanguage !== 'auto' ? translationSettings.sourceLanguage : 'zh-CN');
      
      utterance.volume = 1.0;
      utterance.rate = calculateAdaptiveSpeechRate(audioProcessing.subtitleHistory, audioProcessing.currentSpeechRate);
      audioProcessing.currentSpeechRate = utterance.rate; // 更新当前语速
      utterance.pitch = 1.0;
      
      SpeechUtils.debugLog('语音合成', '语音参数设置:', {
        lang: utterance.lang,
        volume: utterance.volume,
        rate: utterance.rate,
        pitch: utterance.pitch
      });
      
      // 获取可用的语音列表
      const voices = window.speechSynthesis.getVoices();
      SpeechUtils.debugLog('语音合成', `可用语音列表: ${voices.length}个语音`);
      if (voices.length > 0) {
        const matchingVoices = voices.filter(voice => voice.lang.includes(utterance.lang.split('-')[0]));
        SpeechUtils.debugLog('语音合成', `匹配当前语言的语音: ${matchingVoices.length}个`);
        if (matchingVoices.length > 0) {
          utterance.voice = matchingVoices[0];
          SpeechUtils.debugLog('语音合成', `已选择语音: ${utterance.voice.name} (${utterance.voice.lang})`);
        }
      }
      
      const actionType = isTranslated ? '翻译' : '原始';
      
      utterance.onstart = () => {
        SpeechUtils.log(`开始播放${actionType}语音: "${text}"`);
        SpeechUtils.debugLog('语音合成', `开始播放${actionType}语音`);
        // 降低视频音量
        lowerVideoVolume(audioProcessing);
      };
      
      utterance.onend = () => {
        SpeechUtils.log(`${actionType}语音播放结束: "${text}"`);
        SpeechUtils.debugLog('语音合成', `${actionType}语音播放结束`);
        // 恢复视频音量
        restoreVideoVolume(audioProcessing);
        audioProcessing.isSpeaking = false;
        processSpeechQueue();
      };
      
      utterance.onerror = (e) => {
        console.error(`${actionType}语音播放错误:`, e);
        SpeechUtils.debugLog('语音合成', `${actionType}语音播放错误:`, e);
        audioProcessing.isSpeaking = false;
        audioProcessing.processingTimer = setTimeout(processSpeechQueue, 100);
      };
      
      window.speechSynthesis.speak(utterance);
      SpeechUtils.log(`${actionType}语音合成请求已发送`);
    } else {
      SpeechUtils.log('浏览器不支持语音合成API');
      SpeechUtils.debugLog('语音合成', '浏览器不支持语音合成API');
      audioProcessing.isSpeaking = false;
      audioProcessing.processingTimer = setTimeout(processSpeechQueue, 100);
    }
  }
  
  return {
    isSimilarToRecentSubtitles,
    calculateAdaptiveSpeechRate,
    lowerVideoVolume,
    restoreVideoVolume,
    playWithBrowserTTS,
    getCurrentAudio: () => currentAudio,
    setCurrentAudio: (audio) => { currentAudio = audio; }
  };
})();

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpeechTTS;
}
