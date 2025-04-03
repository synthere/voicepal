// 语音处理器 - 字幕处理
const SubtitleProcessor = (() => {
  // 从字幕元素中获取文本
  function getSubtitleTextFromElement(element) {
    if (!element) return "";
    
    // 获取元素的文本内容
    let text = element.textContent || "";
    
    // 如果是YouTube的字幕容器，可能需要特殊处理
    if (element.classList.contains('ytp-caption-segment')) {
      // 已经是单个字幕片段，直接使用文本内容
    } else if (element.querySelectorAll('.ytp-caption-segment').length > 0) {
      // 如果是字幕容器，合并所有字幕片段
      const segments = element.querySelectorAll('.ytp-caption-segment');
      text = Array.from(segments).map(seg => seg.textContent || "").join(' ');
    }
    
    return text.trim();
  }
  
  // 检查现有字幕
  function checkExistingSubtitles(audioProcessing, processSubtitleText) {
    SpeechUtils.debugLog('字幕检查', '检查现有字幕');
    
    // 检查YouTube字幕
    const ytSubtitles = document.querySelectorAll('.ytp-caption-segment');
    if (ytSubtitles.length > 0) {
      const subtitleText = Array.from(ytSubtitles).map(el => el.textContent || "").join(' ').trim();
      if (subtitleText && subtitleText !== audioProcessing.lastSubtitleText) {
        audioProcessing.lastSubtitleText = subtitleText;
        processSubtitleText(subtitleText);
      }
    }
  }
  
  // 设置字幕观察器
  function setupSubtitleObserver(audioProcessing, processSubtitleText) {
    SpeechUtils.debugLog('字幕观察', '设置字幕观察器');
    
    // 如果已经有观察器，先断开连接
    if (audioProcessing.subtitleObserver) {
      audioProcessing.subtitleObserver.disconnect();
    }
    
    // 创建新的观察器
    audioProcessing.subtitleObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // 检查是否有新的字幕节点添加
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // 检查添加的节点是否包含字幕文本
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const subtitleText = getSubtitleTextFromElement(node);
              if (subtitleText && subtitleText !== audioProcessing.lastSubtitleText) {
                audioProcessing.lastSubtitleText = subtitleText;
                processSubtitleText(subtitleText);
              }
            }
          }
        } else if (mutation.type === 'characterData') {
          // 字幕文本内容变化
          const subtitleText = getSubtitleTextFromElement(mutation.target.parentNode);
          if (subtitleText && subtitleText !== audioProcessing.lastSubtitleText) {
            audioProcessing.lastSubtitleText = subtitleText;
            processSubtitleText(subtitleText);
          }
        }
      }
    });
    
    // 观察YouTube字幕容器
    const ytSubtitleContainer = document.querySelector('.ytp-caption-window-container');
    if (ytSubtitleContainer) {
      audioProcessing.subtitleObserver.observe(ytSubtitleContainer, {
        childList: true,
        subtree: true,
        characterData: true
      });
      SpeechUtils.debugLog('字幕观察', '已观察YouTube字幕容器');
    }
  }
  
  // 设置视频时间更新监听器
  function setupVideoTimeUpdateListeners(audioProcessing, translationSettings, checkExistingSubtitles) {
    SpeechUtils.debugLog('视频监听', '设置视频时间更新监听器');
    
    // 查找所有视频元素
    const videoElements = document.querySelectorAll('video');
    
    videoElements.forEach(video => {
      // 避免重复添加监听器
      if (!audioProcessing.videoElements.includes(video)) {
        audioProcessing.videoElements.push(video);
        
        // 添加时间更新监听器
        video.addEventListener('timeupdate', SpeechUtils.debounce(() => {
          // 每隔一段时间检查字幕
          const now = Date.now();
          if (now - audioProcessing.lastProcessTime > translationSettings.captureInterval) {
            audioProcessing.lastProcessTime = now;
            checkExistingSubtitles();
          }
        }, 500));
        
        SpeechUtils.debugLog('视频监听', '已添加视频时间更新监听器');
      }
    });
  }
  
  return {
    getSubtitleTextFromElement,
    checkExistingSubtitles,
    setupSubtitleObserver,
    setupVideoTimeUpdateListeners
  };
})();

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SubtitleProcessor;
}
