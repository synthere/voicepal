// 字幕处理测试脚本
// 用于测试字幕检测和播放逻辑，无需在浏览器中运行

// 模拟浏览器环境
const mockBrowserEnv = {
  speechSynthesis: {
    speaking: false,
    speak: function(utterance) {
      console.log(`[模拟TTS] 开始播放: "${utterance.text}"`);
      this.speaking = true;
      
      // 模拟播放完成
      setTimeout(() => {
        console.log(`[模拟TTS] 播放结束: "${utterance.text}"`);
        this.speaking = false;
        if (utterance.onend) utterance.onend();
      }, utterance.text.length * 100); // 根据文本长度模拟播放时间
      
      if (utterance.onstart) utterance.onstart();
    },
    cancel: function() {
      console.log('[模拟TTS] 已取消所有语音');
      this.speaking = false;
    }
  },
  SpeechSynthesisUtterance: function(text) {
    this.text = text;
    this.lang = 'zh-CN';
    this.volume = 1.0;
    this.rate = 1.0;
    this.pitch = 1.0;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  },
  Audio: function(src) {
    this.src = src;
    this.paused = true;
    this.currentTime = 0;
    this.play = function() {
      console.log(`[模拟音频] 开始播放: "${src}"`);
      this.paused = false;
      
      // 模拟播放完成
      setTimeout(() => {
        console.log(`[模拟音频] 播放结束: "${src}"`);
        this.paused = true;
        if (this.onended) this.onended();
      }, 2000);
      
      return Promise.resolve();
    };
    this.pause = function() {
      console.log('[模拟音频] 已暂停');
      this.paused = true;
    };
    this.onended = null;
    this.onerror = null;
  },
  URL: {
    createObjectURL: function(blob) {
      return `mock-url-${Math.random()}`;
    },
    revokeObjectURL: function(url) {
      // 模拟释放URL
    }
  },
  fetch: function(url, options) {
    console.log(`[模拟Fetch] 请求: ${url}`);
    return new Promise((resolve) => {
      // 模拟API响应延迟
      setTimeout(() => {
        resolve({
          ok: true,
          blob: function() {
            return Promise.resolve(new Blob([]));
          }
        });
      }, 500);
    });
  },
  localStorage: {
    storage: {},
    getItem: function(key) {
      return this.storage[key] || null;
    },
    setItem: function(key, value) {
      this.storage[key] = value;
    }
  }
};

// 核心字幕处理逻辑
class SubtitleProcessor {
  constructor() {
    // 核心状态变量
    this.lastSpokenText = "";
    this.isSpeaking = false;
    this.speechQueue = [];
    this.currentSubtitle = "";
    this.activeAudioElements = [];
    
    // 增强字幕处理设置
    this.MIN_SPEAK_LENGTH = 2;      // 最小播放长度(字符数)
    this.BUFFER_TIMEOUT = 1000;     // 字幕缓冲时间(毫秒)
    this.SIMILARITY_THRESHOLD = 0.8; // 相似度阈值(0-1)
    this.subtitleBuffer = "";       // 字幕缓冲区
    this.bufferTimer = null;        // 缓冲区定时器
    this.recentlySpokenTexts = [];  // 最近播放的文本
    this.MAX_RECENT_TEXTS = 5;      // 保留的最近文本数量
    
    // TTS设置
    this.ttsService = "browser"; // 默认使用模拟浏览器TTS
    this.ttsSettings = {
      elevenLabsApiKey: "mock-api-key",
      elevenLabsVoiceId: "mock-voice-id",
      customApiUrl: "https://mock-api.example.com/tts",
      customApiHeaders: {}
    };
    
    console.log('[测试] 字幕处理器已初始化，最小播放长度:', this.MIN_SPEAK_LENGTH, '字符');
  }
  
  // 计算两个字符串的相似度(0-1)
  calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1.0;
    
    // 如果其中一个字符串是另一个的子串，计算覆盖率
    if (str1.includes(str2)) {
      return str2.length / str1.length;
    }
    if (str2.includes(str1)) {
      return str1.length / str2.length;
    }
    
    // 简单计算重叠字符数
    let overlap = 0;
    const shortStr = str1.length < str2.length ? str1 : str2;
    const longStr = str1.length < str2.length ? str2 : str1;
    
    for (let i = 0; i < shortStr.length; i++) {
      if (longStr.includes(shortStr[i])) {
        overlap++;
      }
    }
    
    return overlap / longStr.length;
  }
  
  // 检查文本是否已经最近播放过
  hasRecentlySpoken(text) {
    if (!text || text.length < this.MIN_SPEAK_LENGTH) return false;
    
    // 检查是否与最近播放的文本完全相同
    if (this.recentlySpokenTexts.includes(text)) {
      console.log('[测试] 文本最近已播放过:', text);
      return true;
    }
    
    // 检查是否与最近的文本高度相似
    for (const recentText of this.recentlySpokenTexts) {
      const similarity = this.calculateSimilarity(text, recentText);
      if (similarity > this.SIMILARITY_THRESHOLD) {
        console.log('[测试] 文本与最近播放内容相似度高:', similarity.toFixed(2), text, '≈', recentText);
        return true;
      }
    }
    
    return false;
  }
  
  // 记录已播放文本
  addToRecentlySpoken(text) {
    if (!text || text.length < this.MIN_SPEAK_LENGTH) return;
    
    // 移除已有的相同文本(避免重复)
    this.recentlySpokenTexts = this.recentlySpokenTexts.filter(item => item !== text);
    
    // 添加到最近播放列表
    this.recentlySpokenTexts.unshift(text);
    
    // 保持列表长度限制
    if (this.recentlySpokenTexts.length > this.MAX_RECENT_TEXTS) {
      this.recentlySpokenTexts.pop();
    }
  }
  
  // 从新字幕中提取尚未播放的内容
  extractNewContent(newSubtitle) {
    if (!newSubtitle || newSubtitle.trim().length === 0) return "";
    
    newSubtitle = newSubtitle.trim();
    
    // 如果没有上次播放的文本，直接返回整个字幕
    if (!this.lastSpokenText) return newSubtitle;
    
    // 如果新字幕与上次播放的一样，不需要播放
    if (newSubtitle === this.lastSpokenText) return "";
    
    // 如果新字幕包含旧字幕，提取差异部分
    if (newSubtitle.includes(this.lastSpokenText)) {
      const index = newSubtitle.indexOf(this.lastSpokenText);
      
      // 获取前缀（如果有）
      const prefix = index > 0 ? newSubtitle.substring(0, index) : "";
      
      // 获取后缀（如果有）
      const suffix = index + this.lastSpokenText.length < newSubtitle.length ? 
                    newSubtitle.substring(index + this.lastSpokenText.length) : "";
      
      // 组合新内容
      const newPart = (prefix + suffix).trim();
      
      // 检查是否满足最小长度要求
      if (newPart.length < this.MIN_SPEAK_LENGTH) {
        console.log('[测试] 增量更新太短，暂不播放:', newPart);
        // 不立即播放，而是等待更多内容累积
        return "";
      }
      
      // 只有当新部分有意义时才返回
      return newPart.length > 0 ? newPart : "";
    }
    
    // 如果旧字幕包含新字幕，可能是回退，不播放
    if (this.lastSpokenText.includes(newSubtitle)) return "";
    
    // 计算新旧字幕的相似度
    const similarity = this.calculateSimilarity(newSubtitle, this.lastSpokenText);
    if (similarity > this.SIMILARITY_THRESHOLD) {
      console.log('[测试] 新旧字幕相似度高，跳过播放:', similarity.toFixed(2));
      return "";
    }
    
    // 如果已经最近播放过该内容，跳过
    if (this.hasRecentlySpoken(newSubtitle)) {
      console.log('[测试] 字幕内容最近已播放过，跳过');
      return "";
    }
    
    // 如果两者没有包含关系且相似度低，作为全新内容返回
    return newSubtitle;
  }
  
  // 使用模拟浏览器TTS播放文本
  speakWithBrowser(text) {
    return new Promise((resolve, reject) => {
      const utterance = new mockBrowserEnv.SpeechSynthesisUtterance(text);
      
      utterance.onstart = () => {
        console.log('[测试] 开始播放浏览器语音:', text);
        this.addToRecentlySpoken(text);
      };
      
      utterance.onend = () => {
        console.log('[测试] 浏览器语音播放结束');
        resolve();
      };
      
      utterance.onerror = (e) => {
        console.error('[测试] 浏览器语音播放错误:', e);
        reject(e);
      };
      
      try {
        mockBrowserEnv.speechSynthesis.speak(utterance);
      } catch (e) {
        console.error('[测试] 浏览器语音播放异常:', e);
        reject(e);
      }
    });
  }
  
  // 使用模拟ElevenLabs API播放文本
  speakWithElevenLabs(text) {
    return new Promise((resolve, reject) => {
      console.log('[测试] 尝试使用ElevenLabs播放:', text);
      this.addToRecentlySpoken(text);
      
      mockBrowserEnv.fetch('https://api.elevenlabs.io/v1/text-to-speech/mock-voice-id', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': this.ttsSettings.elevenLabsApiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2'
        })
      })
      .then(response => {
        return response.blob();
      })
      .then(blob => {
        const audioUrl = mockBrowserEnv.URL.createObjectURL(blob);
        const audio = new mockBrowserEnv.Audio(audioUrl);
        
        // 将音频元素添加到跟踪数组
        this.activeAudioElements.push(audio);
        
        audio.onended = () => {
          console.log('[测试] ElevenLabs语音播放结束');
          // 从跟踪数组中移除
          const index = this.activeAudioElements.indexOf(audio);
          if (index > -1) {
            this.activeAudioElements.splice(index, 1);
          }
          resolve();
        };
        
        audio.play();
      })
      .catch(error => {
        console.error('[测试] ElevenLabs API请求失败:', error);
        reject(error);
      });
    });
  }
  
  // 根据选择的服务播放文本
  speakWithSelectedService(text) {
    console.log('[测试] 当前选择的TTS服务:', this.ttsService);
    
    switch (this.ttsService) {
      case 'elevenlabs':
        return this.speakWithElevenLabs(text);
      case 'browser':
      default:
        return this.speakWithBrowser(text);
    }
  }
  
  // 播放语音的核心函数
  speakText(text) {
    if (!text || text.trim().length === 0) return;
    
    text = text.trim();
    
    // 检查文本长度是否满足最小要求
    if (text.length < this.MIN_SPEAK_LENGTH) {
      console.log('[测试] 文本长度过短，不播放:', text);
      return;
    }
    
    // 如果与上次播放完全相同，跳过
    if (text === this.lastSpokenText) {
      console.log('[测试] 跳过重复文本:', text);
      return;
    }
    
    // 如果已经最近播放过该内容，跳过
    if (this.hasRecentlySpoken(text)) {
      console.log('[测试] 内容最近已播放过，跳过:', text);
      return;
    }
    
    // 如果正在播放，加入队列
    if (this.isSpeaking) {
      if (!this.speechQueue.includes(text)) {
        this.speechQueue.push(text);
        console.log('[测试] 已加入队列:', text);
      }
      return;
    }
    
    // 标记为正在播放
    this.isSpeaking = true;
    
    // 更新已播放内容
    this.lastSpokenText = this.currentSubtitle;
    
    // 使用选择的服务播放
    this.speakWithSelectedService(text)
      .then(() => {
        // 播放完成，处理下一个
        this.isSpeaking = false;
        
        // 处理队列中的下一个内容
        setTimeout(() => {
          if (this.speechQueue.length > 0) {
            const nextText = this.speechQueue.shift();
            if (nextText) this.speakText(nextText);
          }
        }, 50);
      })
      .catch(error => {
        console.error('[测试] 语音播放失败:', error);
        this.isSpeaking = false;
        
        // 处理队列中的下一个内容
        setTimeout(() => {
          if (this.speechQueue.length > 0) {
            const nextText = this.speechQueue.shift();
            if (nextText) this.speakText(nextText);
          }
        }, 50);
      });
  }
  
  // 处理缓冲区的字幕
  flushSubtitleBuffer() {
    if (!this.subtitleBuffer || this.subtitleBuffer.trim().length === 0) {
      return;
    }
    
    const subtitle = this.subtitleBuffer.trim();
    this.subtitleBuffer = "";
    
    console.log('[测试] 处理缓冲区字幕:', subtitle);
    
    // 保存当前字幕，用于在播放开始时更新lastSpokenText
    this.currentSubtitle = subtitle;
    
    // 提取新内容
    const newContent = this.extractNewContent(this.currentSubtitle);
    
    // 播放新内容
    if (newContent && newContent.length >= this.MIN_SPEAK_LENGTH) {
      console.log('[测试] 提取到新内容:', newContent);
      this.speakText(newContent);
    } else {
      console.log('[测试] 没有提取到新内容，或内容太短');
    }
  }
  
  // 处理新检测到的字幕
  processSubtitle(subtitle) {
    if (!subtitle || subtitle.trim().length === 0) return;
    
    // 过滤掉字幕切换提示信息
    if ((subtitle.includes('>>')) || 
        (subtitle.includes('自动生成') && subtitle.includes('>>')) || 
        (subtitle.match(/English|Japanese|Spanish|French|German|Russian/) && subtitle.includes('>>')) ||
        (subtitle.includes('中文') && subtitle.includes('>>')) ||
        subtitle === "English" ||
        subtitle === "中文" ||
        subtitle === "日本語" ||
        subtitle === "Español" ||
        subtitle === "Français" ||
        subtitle === "Deutsch" ||
        subtitle === "Русский") {
      console.log('[测试] 跳过字幕切换提示:', subtitle);
      return;
    }
    
    console.log('[测试] 接收到新字幕:', subtitle);
    
    // 如果原来有定时器，先清除
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }
    
    // 计算当前缓冲区与新字幕的相似度
    if (this.subtitleBuffer) {
      const similarity = this.calculateSimilarity(this.subtitleBuffer, subtitle);
      
      // 如果新字幕比缓冲区短很多，且存在高相似度，可能是回退，保留更长的版本
      if (subtitle.length < this.subtitleBuffer.length * 0.7 && similarity > 0.5) {
        console.log('[测试] 检测到字幕回退，保留缓冲区内容');
        // 启动新的定时器
        this.bufferTimer = setTimeout(() => this.flushSubtitleBuffer(), this.BUFFER_TIMEOUT);
        return;
      }
    }
    
    // 更新缓冲区
    this.subtitleBuffer = subtitle;
    
    // 启动处理定时器
    this.bufferTimer = setTimeout(() => this.flushSubtitleBuffer(), this.BUFFER_TIMEOUT);
  }
  
  // 停止所有正在播放的音频
  stopAllAudio() {
    console.log('[测试] 停止所有音频播放');
    
    // 清除缓冲区和定时器
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }
    this.subtitleBuffer = "";
    
    // 停止浏览器TTS
    mockBrowserEnv.speechSynthesis.cancel();
    
    // 停止所有正在播放的音频元素
    this.activeAudioElements.forEach(audio => {
      try {
        audio.pause();
        audio.currentTime = 0;
        console.log('[测试] 停止了一个音频元素');
      } catch (e) {
        console.error('[测试] 停止音频元素失败:', e);
      }
    });
    
    // 清空音频元素数组
    this.activeAudioElements = [];
    
    // 重置状态
    this.isSpeaking = false;
    this.speechQueue.length = 0;
  }
  
  // 测试字幕序列
  testSubtitleSequence(subtitles, interval = 2000) {
    console.log('[测试] 开始测试字幕序列, 共', subtitles.length, '条字幕');
    
    // 重置状态
    this.lastSpokenText = "";
    this.currentSubtitle = "";
    this.subtitleBuffer = "";
    if (this.bufferTimer) {
      clearTimeout(this.bufferTimer);
      this.bufferTimer = null;
    }
    this.recentlySpokenTexts = [];
    
    let index = 0;
    
    const processNext = () => {
      if (index < subtitles.length) {
        const subtitle = subtitles[index];
        console.log(`\n[测试] === 测试第 ${index+1}/${subtitles.length} 条字幕 ===`);
        this.processSubtitle(subtitle);
        index++;
        setTimeout(processNext, interval);
      } else {
        // 确保最后的缓冲区内容被处理
        setTimeout(() => {
          if (this.subtitleBuffer) {
            console.log('\n[测试] 处理最后的缓冲区内容');
            this.flushSubtitleBuffer();
          }
          console.log('\n[测试] 字幕序列测试完成');
        }, this.BUFFER_TIMEOUT + 100);
      }
    };
    
    processNext();
  }
  
  // 修改TTS服务
  setTtsService(service) {
    console.log('[测试] 设置TTS服务为:', service);
    this.ttsService = service;
  }
}

// 测试场景
function runTests() {
  console.log('===== 开始字幕处理测试 =====');
  
  const processor = new SubtitleProcessor();
  
  // 测试场景1: 基本字幕序列
  console.log('\n----- 测试场景1: 基本字幕序列 -----');
  const basicSubtitles = [
    "欢迎观看视频",
    "欢迎观看视频，希望您喜欢", // 增量更新
    "这是一个新的句子",         // 全新句子
    "这是一个新的句子。再加一句", // 增量更新
    "完全不同的内容"            // 全新句子
  ];
  
  processor.testSubtitleSequence(basicSubtitles);
  
  // 测试场景2延迟执行，等待场景1完成
  setTimeout(() => {
    console.log('\n----- 测试场景2: 字幕切换和过滤 -----');
    const filterTestSubtitles = [
      "English (auto-generated) >> 中文（简体）", // 应被过滤
      "普通中文字幕",
      "English content that should be spoken",
      "Japanese >> English", // 应被过滤
      "最后一句中文字幕"
    ];
    
    processor.testSubtitleSequence(filterTestSubtitles);
  }, basicSubtitles.length * 2500);
  
  // 测试场景3延迟执行，等待场景2完成
  setTimeout(() => {
    console.log('\n----- 测试场景3: 停止功能测试 -----');
    processor.processSubtitle("这句话开始播放");
    
    // 2秒后停止所有音频
    setTimeout(() => {
      console.log('\n[测试] 执行停止命令');
      processor.stopAllAudio();
      
      // 确认是否成功停止
      console.log('[测试] isSpeaking状态:', processor.isSpeaking);
      console.log('[测试] 队列长度:', processor.speechQueue.length);
      
      // 停止后再播放新内容
      setTimeout(() => {
        console.log('\n[测试] 停止后播放新内容');
        processor.processSubtitle("停止后的新字幕，应该能正常播放");
      }, 1000);
    }, 2000);
  }, (basicSubtitles.length + 5) * 2500);
  
  // 测试场景4延迟执行，测试切换TTS服务
  setTimeout(() => {
    console.log('\n----- 测试场景4: 切换TTS服务 -----');
    console.log('[测试] 切换到ElevenLabs服务');
    processor.setTtsService('elevenlabs');
    processor.processSubtitle("使用ElevenLabs播放的字幕");
    
    // 切回浏览器TTS
    setTimeout(() => {
      console.log('[测试] 切换回浏览器TTS服务');
      processor.setTtsService('browser');
      processor.processSubtitle("切换回浏览器TTS后的字幕");
    }, 3000);
  }, (basicSubtitles.length + 10) * 2500);
  
  // 测试场景5延迟执行，测试实际YouTube字幕逐步显示的情况
  setTimeout(() => {
    console.log('\n----- 测试场景5: 实际YouTube字幕逐步显示测试 -----');
    console.log('[测试] 这是从实际YouTube视频中捕获的字幕序列，模拟字幕逐字显示的情况');
    
    // 从实际YouTube视频中捕获的字幕序列
    const realYouTubeSubtitles = [
      "首先我们",        // 初始字幕
      "首先我们",        // 重复（无变化）
      "首先我们可以",    // 增量更新
      "首先我们可以看到", // 增量更新
      "首先我们可以看到它", // 增量更新
      "首先我们可以看到它生成", // 增量更新
      "首先我们可以看到它生成了", // 增量更新
      "研究",           // 新的字幕段落（可能是上一句被截断或新场景）
      "研究计划",       // 增量更新
      "首先我们可以看到它生成了" // 回到前一句（可能是字幕纠错或循环）
    ];
    
    // 使用较短的间隔来模拟快速更新的字幕
    processor.testSubtitleSequence(realYouTubeSubtitles, 1000);
  }, (basicSubtitles.length + 15) * 2500);
}

// 运行测试
runTests();

// 使用说明：
// 1. 要在Node.js环境中运行此测试，请安装Node.js
// 2. 保存此文件为subtitle_processor_test.js
// 3. 在终端中执行: node subtitle_processor_test.js
// 4. 观察控制台输出，检查字幕处理逻辑是否符合预期 