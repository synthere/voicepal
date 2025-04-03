// 检查现有字幕
  function checkExistingSubtitles() {
    const currentSubtitles = new Set();
    
    const youtubeSubtitles = document.querySelectorAll('.ytp-caption-segment');
    if (youtubeSubtitles.length > 0) {
      youtubeSubtitles.forEach(subtitle => {
        if (subtitle.textContent && subtitle.textContent.trim().length > 0) {
          currentSubtitles.add(subtitle.textContent.trim());
        }
      });
    } else {
      const captionWindow = document.querySelector('.caption-window');
      if (captionWindow && captionWindow.textContent && captionWindow.textContent.trim().length > 0) {
        currentSubtitles.add(captionWindow.textContent.trim());
      }
    }
    
    if (currentSubtitles.size > 0) {
      const combinedText = Array.from(currentSubtitles).join(' ');
      processSubtitleText(combinedText);
    }
    
    const videoElements = audioProcessing.videoElements;
    videoElements.forEach(video => {
      const tracks = video.textTracks;
      if (tracks && tracks.length > 0) {
        for (let i = 0; i < tracks.length; i++) {
          const track = tracks[i];
          if (track.kind === 'subtitles' || track.kind === 'captions') {
            track.mode = 'showing';
            
            track.addEventListener('cuechange', debounce(() => {
              const activeCues = track.activeCues;
              if (activeCues && activeCues.length > 0) {
                const cueTexts = new Set();
                for (let j = 0; j < activeCues.length; j++) {
                  const cue = activeCues[j];
                  if (cue.text && cue.text.trim().length > 0) {
                    cueTexts.add(cue.text.trim());
                  }
                }
                
                if (cueTexts.size > 0) {
                  const combinedText = Array.from(cueTexts).join(' ');
                  processSubtitleText(combinedText);
                }
              }
            }, 300));
          }
        }
      }
    });
  }
  
  // 设置视频时间更新监听器
  function setupVideoTimeUpdateListeners() {
    const debouncedCheckSubtitles = debounce(() => {
      if (audioProcessing.active) {
        checkExistingSubtitles();
      }
    }, 500);
    
    audioProcessing.videoElements.forEach((video, index) => {
      video.addEventListener('timeupdate', () => {
        if (Math.floor(video.currentTime * 2) % 2 === 0 && video.currentTime > 0 && !video.paused) {
          debouncedCheckSubtitles();
        }
      });
      
      if (video.textTracks) {
        video.textTracks.addEventListener('change', () => {
          log('检测到textTracks变化事件');
          debouncedCheckSubtitles();
        });
      }
      
      log(`已为视频 ${index} 设置监听器`);
    });
    
    setInterval(() => {
      if (audioProcessing.active) {
        debouncedCheckSubtitles();
      }
    }, 2000);
  }
  
  // 停止音频处理
  function stopAudioProcessing() {
    if (!audioProcessing.active) return;
    
    log('停止音频处理');
    
    if (audioProcessing.subtitleObserver) {
      audioProcessing.subtitleObserver.disconnect();
      audioProcessing.subtitleObserver = null;
      log('字幕观察器已停止');
    }
    
    if (processingTimer) {
      clearTimeout(processingTimer);
      processingTimer = null;
    }
    
    speechQueue.length = 0;
    subtitleHistory.length = 0;
    recentSubtitles.length = 0;
    isSpeaking = false;
    currentSpeechRate = 1.5; // 重置为更高的默认语速1.5
    
    // 停止当前播放的音频
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
      log('音频已停止');
    }
    
    // 停止浏览器内置语音合成
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      log('浏览器语音合成已停止');
    }
    
    audioProcessing.videoElements.forEach(video => {
      if (video._originalVolume !== undefined) {
        if (video.muted) {
          video.muted = false;
        }
        video.volume = video._originalVolume;
        log(`已恢复视频音量: ${video._originalVolume}`);
        delete video._originalVolume;
      }
    });
    
    const overlay = document.getElementById('vvt-translation-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
      log('翻译覆盖层已移除');
    }
    
    audioProcessing = {
      active: false,
      videoElements: [],
      subtitleObserver: null,
      lastSubtitleText: "",
      lastProcessTime: 0
    };
    
    log('音频处理已停止');
    
    try {
      document.dispatchEvent(new CustomEvent('vvt-translation-stopped'));
      log('已发送翻译停止事件');
    } catch (e) {
      console.error('发送事件通知时出错:', e);
    }
  }
})();
