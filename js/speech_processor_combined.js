// 语音处理器 - 合并文件
(function() {
  try {
    // 处理YouTube跨域问题和其他错误
    if (window.location.hostname.includes('youtube.com')) {
      try {
        // 安全地添加事件监听器，捕获并修正postMessage错误
        window.addEventListener('error', function(event) {
          if (event && event.message && event.message.includes('postMessage') && 
              event.message.includes('does not match the recipient window')) {
            console.log('[VoicePal] 捕获到postMessage错误，已忽略');
            event.preventDefault();
            event.stopPropagation();
            return true;
          }
        }, true);
        
        // 处理storage权限问题
        window.addEventListener('error', function(event) {
          if (event && event.message && event.message.includes('requestStorageAccessFor')) {
            console.log('[VoicePal] 捕获到storage权限错误，已忽略');
            event.preventDefault();
            event.stopPropagation();
            return true;
          }
        }, true);
        
        // 处理资源加载失败错误
        window.addEventListener('error', function(event) {
          if (event.target && (event.target.tagName === 'IMG' || event.target.tagName === 'SCRIPT' || 
                              event.target.tagName === 'LINK' || event.target.tagName === 'VIDEO')) {
            console.log('[VoicePal] 捕获到资源加载失败错误，已忽略:', event.target.src || event.target.href);
            event.preventDefault();
            event.stopPropagation();
            return true;
          }
        }, true);
        
        // 捕获所有未处理的请求错误
        window.addEventListener('unhandledrejection', function(event) {
          if (event.reason && event.reason.toString().includes('Failed to fetch')) {
            console.log('[VoicePal] 捕获到未处理的请求错误，已忽略:', event.reason);
            event.preventDefault();
            event.stopPropagation();
            return true;
          }
        });
        
        console.log('[VoicePal] 已添加YouTube跨域和错误处理');
      } catch (e) {
        console.error('[VoicePal] 添加错误处理时出错:', e);
      }
    }

    // ===== 工具函数 =====
    const SpeechUtils = {
      // 调试模式
      debugMode: true,
      
      // 普通日志
      log: function(message, data) {
        console.log('[VoicePal]', message, data || '');
      },
      
      // 调试日志
      debugLog: function(category, message, data) {
        if (this.debugMode) {
          console.debug('[VoicePal调试-' + category + ']', message, data || '');
        }
      },
      
      // 防抖函数
      debounce: function(func, wait) {
        let timeout;
        return function() {
          const context = this;
          const args = arguments;
          clearTimeout(timeout);
          timeout = setTimeout(() => func.apply(context, args), wait);
        };
      },
      
      // 提取增量内容
      extractIncrementalContent: function(newText, oldText) {
        if (!oldText || oldText.trim().length === 0) {
          return newText;
        }
        
        // 如果新文本包含旧文本，提取新增部分
        if (newText.includes(oldText)) {
          const index = newText.indexOf(oldText);
          if (index === 0) {
            // 旧文本在开头，返回后面的部分
            return newText.substring(oldText.length).trim();
          } else {
            // 旧文本在中间或结尾，返回前面的部分
            return newText.substring(0, index).trim();
          }
        }
        
        // 如果旧文本包含新文本，返回空字符串
        if (oldText.includes(newText)) {
          return '';
        }
        
        // 如果两者没有包含关系，返回原文本
        return newText;
      },
      
      // 显示翻译覆盖层
      showTranslationOverlay: function(message, duration = 3000) {
        // 检查是否已存在覆盖层
        let overlay = document.getElementById('vvt-translation-overlay');
        
        if (!overlay) {
          // 创建覆盖层
          overlay = document.createElement('div');
          overlay.id = 'vvt-translation-overlay';
          
          // 设置样式
          Object.assign(overlay.style, {
            position: 'fixed',
            top: '10%',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            color: 'white',
            padding: '10px 20px',
            borderRadius: '8px',
            fontSize: '16px',
            fontWeight: 'bold',
            zIndex: '10000',
            transition: 'opacity 0.3s ease-in-out',
            textAlign: 'center',
            maxWidth: '80%',
            boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)'
          });
          
          document.body.appendChild(overlay);
        }
        
        // 更新消息
        overlay.textContent = message;
        overlay.style.opacity = '1';
        
        // 设置定时器，在指定时间后隐藏覆盖层
        setTimeout(() => {
          overlay.style.opacity = '0';
        }, duration);
      }
    };

    // ===== 语音合成 =====
    const SpeechTTS = {
      // 存储当前播放的音频元素
      currentAudio: null,
      
      // 检查文本是否与最近的字幕相似
      isSimilarToRecentSubtitles: function(text, recentSubtitles) {
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
      },
      
      // 计算自适应语音速率
      calculateAdaptiveSpeechRate: function(subtitleHistory, currentSpeechRate) {
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
      },
      
      // 降低视频音量
      lowerVideoVolume: function(audioProcessing) {
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
      },
      
      // 恢复视频音量
      restoreVideoVolume: function(audioProcessing) {
        const videoElements = document.querySelectorAll('video');
        videoElements.forEach((video, index) => {
          // 恢复原始音量
          if (audioProcessing.originalVolumes[index] !== undefined) {
            video.volume = audioProcessing.originalVolumes[index];
            SpeechUtils.debugLog('音量控制', `恢复视频音量: ${video.volume}`);
          }
        });
      },
      
      // 使用浏览器内置语音合成
      playWithBrowserTTS: function(text, isTranslated, translationSettings, audioProcessing, isSpeaking, processSpeechQueue) {
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
          utterance.rate = this.calculateAdaptiveSpeechRate(audioProcessing.subtitleHistory, audioProcessing.currentSpeechRate);
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
            this.lowerVideoVolume(audioProcessing);
          };
          
          utterance.onend = () => {
            SpeechUtils.log(`${actionType}语音播放结束: "${text}"`);
            SpeechUtils.debugLog('语音合成', `${actionType}语音播放结束`);
            // 恢复视频音量
            this.restoreVideoVolume(audioProcessing);
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
      },
      
      // 获取当前音频
      getCurrentAudio: function() {
        return this.currentAudio;
      },
      
      // 设置当前音频
      setCurrentAudio: function(audio) {
        this.currentAudio = audio;
      }
    };

    // ===== 字幕处理 =====
    const SubtitleProcessor = {
      // 设置字幕观察器
      setupSubtitleObserver: function(audioProcessing, processSubtitleText) {
        // 断开现有的观察器
        if (audioProcessing.subtitleObserver) {
          audioProcessing.subtitleObserver.disconnect();
          audioProcessing.subtitleObserver = null;
          SpeechUtils.debugLog('字幕观察器', '已断开现有字幕观察器');
        }
        
        // 创建新的观察器
        audioProcessing.subtitleObserver = new MutationObserver((mutations) => {
          mutations.forEach((mutation) => {
            if (mutation.type === 'childList' || mutation.type === 'characterData') {
              const subtitleElement = mutation.target.closest('.ytp-caption-segment');
              if (subtitleElement) {
                const subtitleText = subtitleElement.textContent.trim();
                if (subtitleText && subtitleText !== audioProcessing.lastSubtitleText) {
                  audioProcessing.lastSubtitleText = subtitleText;
                  processSubtitleText(subtitleText);
                }
              }
            }
          });
        });
        
        // 配置观察器
        const observerConfig = {
          childList: true,
          subtree: true,
          characterData: true
        };
        
        // 开始观察字幕容器
        const subtitleContainer = document.querySelector('.ytp-caption-window-container');
        if (subtitleContainer) {
          audioProcessing.subtitleObserver.observe(subtitleContainer, observerConfig);
          SpeechUtils.debugLog('字幕观察器', '已设置字幕观察器');
        } else {
          SpeechUtils.debugLog('字幕观察器', '未找到字幕容器，无法设置观察器');
        }
      },
      
      // 设置视频时间更新监听器
      setupVideoTimeUpdateListeners: function(audioProcessing, translationSettings, checkExistingSubtitles) {
        // 查找所有视频元素
        const videoElements = document.querySelectorAll('video');
        audioProcessing.videoElements = Array.from(videoElements);
        
        // 为每个视频元素添加时间更新监听器
        audioProcessing.videoElements.forEach((video) => {
          // 使用防抖函数减少调用频率
          const debouncedCheck = SpeechUtils.debounce(() => {
            checkExistingSubtitles();
          }, translationSettings.captureInterval);
          
          // 添加监听器
          video.addEventListener('timeupdate', debouncedCheck);
          SpeechUtils.debugLog('视频监听器', '已为视频元素添加时间更新监听器');
        });
      },
      
      // 检查现有字幕
      checkExistingSubtitles: function(audioProcessing, processSubtitleText) {
        // 查找所有字幕段落
        const subtitleSegments = document.querySelectorAll('.ytp-caption-segment');
        
        if (subtitleSegments.length > 0) {
          // 获取最后一个字幕段落的文本
          const lastSegment = subtitleSegments[subtitleSegments.length - 1];
          const subtitleText = lastSegment.textContent.trim();
          
          // 如果字幕文本不为空且与上次处理的不同
          if (subtitleText && subtitleText !== audioProcessing.lastSubtitleText) {
            audioProcessing.lastSubtitleText = subtitleText;
            processSubtitleText(subtitleText);
          }
        }
      }
    };

    // ===== 核心功能 =====
    const SpeechCore = {
      // 语音合成队列和状态
      MAX_HISTORY_SIZE: 10,
      MAX_RECENT_SUBTITLES: 5, // 最多存储5条最近的字幕
      
      // 处理字幕文本
      processSubtitleText: function(text, audioProcessing, speechQueue) {
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
        if (audioProcessing.subtitleHistory.length > this.MAX_HISTORY_SIZE) {
          audioProcessing.subtitleHistory.shift();
        }
        
        // 将字幕添加到语音队列
        speechQueue.push({
          text: text,
          isTranslated: false
        });
        
        // 处理队列
        this.processSpeechQueue(audioProcessing, speechQueue);
      },
      
      // 处理语音合成队列
      processSpeechQueue: function(audioProcessing, speechQueue) {
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
          audioProcessing.processingTimer = setTimeout(() => this.processSpeechQueue(audioProcessing, speechQueue), 50);
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
                audioProcessing.processingTimer = setTimeout(() => this.processSpeechQueue(audioProcessing, speechQueue), 50);
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
          audioProcessing.processingTimer = setTimeout(() => this.processSpeechQueue(audioProcessing, speechQueue), 50);
          return;
        }
        
        // 添加到最近处理的字幕列表
        audioProcessing.recentSubtitles.push(originalText);
        if (audioProcessing.recentSubtitles.length > this.MAX_RECENT_SUBTITLES) {
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
            () => this.processSpeechQueue(audioProcessing, speechQueue)
          );
        } catch (error) {
          console.error('播放语音失败:', error);
          audioProcessing.isSpeaking = false;
          audioProcessing.processingTimer = setTimeout(() => this.processSpeechQueue(audioProcessing, speechQueue), 100);
        }
      },
      
      // 启动音频处理
      startAudioProcessing: function(audioProcessing, translationSettings, speechQueue) {
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
          (text) => this.processSubtitleText(text, audioProcessing, speechQueue)
        );
        
        // 设置视频时间更新监听器
        SubtitleProcessor.setupVideoTimeUpdateListeners(
          audioProcessing, 
          translationSettings, 
          () => SubtitleProcessor.checkExistingSubtitles(
            audioProcessing, 
            (text) => this.processSubtitleText(text, audioProcessing, speechQueue)
          )
        );
        
        // 立即检查现有字幕
        SubtitleProcessor.checkExistingSubtitles(
          audioProcessing, 
          (text) => this.processSubtitleText(text, audioProcessing, speechQueue)
        );
        
        SpeechUtils.debugLog('启动', '音频处理已启动');
      },
      
      // 停止音频处理
      stopAudioProcessing: function(audioProcessing) {
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
    };

    // ===== 主程序 =====
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

    // 确保chrome.runtime可用，如果不可用，使用自定义事件通信
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      console.warn('[VoicePal] chrome.runtime未定义，使用自定义事件通信');
      
      // 在页面上显示消息
      SpeechUtils.showTranslationOverlay("VoicePal已加载", 2000);
      
      // 通过自定义事件监听来自content.js的消息
      document.addEventListener('vvt-message', function(event) {
        if (!event.detail || !event.detail.action) return;
        
        const message = event.detail;
        SpeechUtils.log('收到自定义事件消息:', message);
        
        // 处理消息
        // ... 根据需要处理消息 ...
      });
      
      // 监听测试事件
      document.addEventListener('vvt-test', function() {
        SpeechUtils.showTranslationOverlay("VoicePal测试事件响应成功", 3000);
        SpeechUtils.log('成功响应测试事件');
      });
      
      // 通知content.js，脚本已准备就绪
      try {
        document.dispatchEvent(new CustomEvent('vvt-script-ready'));
        SpeechUtils.log('已发送脚本就绪事件');
      } catch (e) {
        console.error('[VoicePal] 发送脚本就绪事件失败:', e);
      }
    } else {
      // 使用chrome.runtime通信
      try {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
          SpeechUtils.log('收到消息:', message);
          
          // 处理消息
          // ... 根据需要处理消息 ...
          
          return true; // 保持消息通道开放
        });
        
        SpeechUtils.log('已设置chrome.runtime消息监听器');
      } catch (error) {
        console.error('[VoicePal] 设置chrome.runtime消息监听器失败:', error);
      }
    }
    
    // 监听强制停止事件
    document.addEventListener('vvt-force-stop-translation', (event) => {
      SpeechUtils.log('收到强制停止事件:', event.detail);
      
      // 处理停止事件
      // ... 停止处理 ...
    });
    
    // 显示初始消息
    SpeechUtils.showTranslationOverlay("VoicePal语音处理器已加载完成", 3000);
    console.log('[VoicePal] 语音处理器已成功加载');
  } catch (e) {
    console.error('[VoicePal] 语音处理器初始化失败:', e);
  }
})();
