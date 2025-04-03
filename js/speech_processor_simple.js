// 语音处理器 - 简化版
(function() {
  console.log('[VoicePal] 超简化版语音处理器开始加载');
  
  try {
    // 单例模式，防止重复加载
    if (window.VoicePalInstance) {
      console.log('[VoicePal] 语音处理器已存在，跳过重复加载');
      return;
    }
    
    // 标记实例已创建
    window.VoicePalInstance = true;
    
    // 核心状态变量 - 尽可能简化
    let lastSpokenText = ""; // 上次已播放的文本
    let isSpeaking = false; // 是否正在播放
    const speechQueue = []; // 语音队列
    let currentSubtitle = ""; // 当前字幕内容
    
    // TTS设置 - 无需依赖Chrome存储API
    let ttsService = "browser"; // 默认使用浏览器TTS，可选值: "browser", "elevenlabs", "custom"
    let ttsSettings = {
      elevenLabsApiKey: "",
      elevenLabsVoiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel默认声音
      elevenLabsSpeed: 1.25, // 语速控制，默认为1.25倍速
      customApiUrl: "",
      customApiHeaders: {}
    };
    
    // 全局音频元素跟踪
    let activeAudioElements = [];
    
    // 暴露设置接口到全局，供外部调用
    window.VoicePalSetTTS = function(service, settings) {
      console.log('[VoicePal] 通过全局函数设置TTS服务:', service);
      
      // 验证服务类型有效
      if (service && ['browser', 'elevenlabs', 'custom'].includes(service)) {
        ttsService = service;
        console.log('[VoicePal] TTS服务已更新为:', ttsService);
      } else if (service) {
        console.warn('[VoicePal] 无效的TTS服务类型:', service);
      }
      
      // 更新设置
      if (settings) {
        ttsSettings = {...ttsSettings, ...settings};
        console.log('[VoicePal] TTS设置已更新:', 
                   settings.elevenLabsApiKey ? '包含ElevenLabs API密钥' : '无ElevenLabs API密钥',
                   settings.customApiUrl ? '包含自定义API URL' : '无自定义API URL',
                   settings.elevenLabsSpeed ? `ElevenLabs语速: ${settings.elevenLabsSpeed}` : '默认语速');
      }
      
      // 立即保存到localStorage
      saveSettingsToLocalStorage();
      
      // 显示通知
      showOverlay(`TTS服务已设置为: ${ttsService}`, 3000);
      
      return {
        success: true,
        message: '设置已更新',
        currentService: ttsService,
        hasElevenLabsKey: !!ttsSettings.elevenLabsApiKey,
        hasCustomUrl: !!ttsSettings.customApiUrl,
        elevenLabsSpeed: ttsSettings.elevenLabsSpeed
      };
    };
    
    // 添加安全的Chrome API调用
    function safeStorageGet(keys, callback) {
      try {
        if (window.chrome && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get(keys, callback);
        } else {
          // 当Chrome API不可用时，使用默认设置
          console.log('[VoicePal] Chrome存储API不可用，使用默认设置');
          callback({});
        }
      } catch (e) {
        console.error('[VoicePal] 无法访问Chrome存储API:', e);
        callback({});
      }
    }
    
    // 尝试从存储中加载TTS设置
    function loadTtsSettings() {
      try {
        console.log('[VoicePal] 开始加载TTS设置...');
        
        // 先尝试从localStorage获取设置
        try {
          const storedService = localStorage.getItem('voicepal_tts_service');
          const storedSettings = localStorage.getItem('voicepal_tts_settings');
          
          if (storedService) {
            ttsService = storedService;
            console.log('[VoicePal] 从localStorage加载TTS服务类型:', ttsService);
          }
          
          if (storedSettings) {
            try {
              const parsedSettings = JSON.parse(storedSettings);
              ttsSettings = {...ttsSettings, ...parsedSettings};
              console.log('[VoicePal] 从localStorage加载TTS设置成功:', 
                         parsedSettings.elevenLabsApiKey ? '包含ElevenLabs API密钥' : '无ElevenLabs API密钥',
                         parsedSettings.customApiUrl ? '包含自定义API URL' : '无自定义API URL');
            } catch(e) {
              console.error('[VoicePal] 解析localStorage设置失败:', e);
            }
          }
        } catch(e) {
          console.error('[VoicePal] 从localStorage加载设置失败:', e);
        }
        
        // 再尝试从Chrome存储API获取（如果可用）
        safeStorageGet(['ttsService', 'ttsSettings'], function(result) {
          if (result.ttsService) {
            ttsService = result.ttsService;
            console.log('[VoicePal] 从Chrome存储加载TTS服务类型:', ttsService);
          }
          
          if (result.ttsSettings) {
            ttsSettings = {...ttsSettings, ...result.ttsSettings};
            console.log('[VoicePal] 从Chrome存储加载TTS设置成功');
          }
          
          // 设置加载完成后立即测试
          console.log('[VoicePal] 设置加载完成 - 当前服务类型:', ttsService);
          if (ttsService === 'elevenlabs') {
            console.log('[VoicePal] ElevenLabs API密钥:', 
                        ttsSettings.elevenLabsApiKey ? '已设置' : '未设置');
          } else if (ttsService === 'custom') {
            console.log('[VoicePal] 自定义API URL:', 
                        ttsSettings.customApiUrl ? '已设置' : '未设置');
          }
        });
      } catch (e) {
        console.error('[VoicePal] 加载TTS设置失败:', e);
      }
    }
    
    // 保存设置到localStorage
    function saveSettingsToLocalStorage() {
      try {
        localStorage.setItem('voicepal_tts_service', ttsService);
        localStorage.setItem('voicepal_tts_settings', JSON.stringify(ttsSettings));
        console.log('[VoicePal] 设置已保存到localStorage - 服务类型:', ttsService);
      } catch(e) {
        console.error('[VoicePal] 保存到localStorage失败:', e);
      }
    }
    
    // 加载设置
    loadTtsSettings();
    
    // 错误处理
    window.addEventListener('error', function(event) {
      if (event && event.message && 
         (event.message.includes('postMessage') || 
          event.message.includes('requestStorageAccessFor'))) {
        console.log('[VoicePal] 捕获到错误，已忽略:', event.message);
        event.preventDefault();
        event.stopPropagation();
        return true;
      }
    }, true);

    // 显示覆盖层
    function showOverlay(message, duration = 3000) {
      let overlay = document.getElementById('vvt-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'vvt-overlay';
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
          textAlign: 'center'
        });
        document.body.appendChild(overlay);
      }
      overlay.textContent = message;
      overlay.style.opacity = '1';
      setTimeout(() => {
        overlay.style.opacity = '0';
      }, duration);
    }
    
    // 创建控制面板
    function createControlPanel() {
      // 检查是否已存在
      if (document.getElementById('vvt-control-panel')) {
        return;
      }
      
      // 创建控制面板容器
      const panel = document.createElement('div');
      panel.id = 'vvt-control-panel';
      Object.assign(panel.style, {
        position: 'fixed',
        bottom: '60px',
        right: '20px',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        color: 'white',
        padding: '8px',
        borderRadius: '8px',
        fontSize: '14px',
        zIndex: '10000',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
        userSelect: 'none'
      });
      
      // 添加标题
      const title = document.createElement('div');
      title.textContent = 'VoicePal设置';
      title.style.fontWeight = 'bold';
      title.style.textAlign = 'center';
      title.style.marginBottom = '5px';
      panel.appendChild(title);
      
      // 添加当前服务显示
      const serviceDisplay = document.createElement('div');
      serviceDisplay.id = 'vvt-service-display';
      serviceDisplay.textContent = `当前服务: ${ttsService}`;
      serviceDisplay.style.fontSize = '12px';
      serviceDisplay.style.marginBottom = '5px';
      panel.appendChild(serviceDisplay);
      
      // 添加服务切换按钮
      const serviceControl = document.createElement('div');
      serviceControl.style.display = 'flex';
      serviceControl.style.alignItems = 'center';
      serviceControl.style.justifyContent = 'space-between';
      serviceControl.style.marginBottom = '5px';
      
      const serviceLabel = document.createElement('span');
      serviceLabel.textContent = 'TTS服务:';
      serviceControl.appendChild(serviceLabel);
      
      const serviceSelect = document.createElement('select');
      serviceSelect.style.backgroundColor = '#444';
      serviceSelect.style.color = 'white';
      serviceSelect.style.border = 'none';
      serviceSelect.style.borderRadius = '4px';
      serviceSelect.style.padding = '3px';
      
      // 添加选项
      const options = [
        { value: 'browser', text: '浏览器' },
        { value: 'elevenlabs', text: 'ElevenLabs' },
        { value: 'custom', text: '自定义API' }
      ];
      
      options.forEach(option => {
        const optElement = document.createElement('option');
        optElement.value = option.value;
        optElement.textContent = option.text;
        serviceSelect.appendChild(optElement);
      });
      
      // 设置当前值
      serviceSelect.value = ttsService;
      
      serviceControl.appendChild(serviceSelect);
      
      // 将服务选择控件插入到面板中服务显示之后
      panel.insertBefore(serviceControl, serviceDisplay.nextSibling);
      
      // 服务切换事件
      serviceSelect.addEventListener('change', function() {
        const newService = this.value;
        
        // 如果选择了ElevenLabs但没有API密钥，显示提示
        if (newService === 'elevenlabs' && !ttsSettings.elevenLabsApiKey) {
          showOverlay('请先设置ElevenLabs API密钥', 3000);
          // 回退到之前的选择
          setTimeout(() => { this.value = ttsService; }, 100);
          return;
        }
        
        // 如果选择了自定义API但没有URL，显示提示
        if (newService === 'custom' && !ttsSettings.customApiUrl) {
          showOverlay('请先设置自定义API URL', 3000);
          // 回退到之前的选择
          setTimeout(() => { this.value = ttsService; }, 100);
          return;
        }
        
        // 更新服务类型
        ttsService = newService;
        
        // 更新显示
        serviceDisplay.textContent = `当前服务: ${ttsService}`;
        
        // 保存设置
        saveSettingsToLocalStorage();
        
        // 显示通知
        showOverlay(`TTS服务已切换: ${ttsService}`, 2000);
      });
      
      // 添加语速控制
      const speedControl = document.createElement('div');
      speedControl.style.display = 'flex';
      speedControl.style.alignItems = 'center';
      speedControl.style.gap = '8px';
      
      const speedLabel = document.createElement('span');
      speedLabel.textContent = '语速:';
      speedControl.appendChild(speedLabel);
      
      // 减速按钮
      const decreaseBtn = document.createElement('button');
      decreaseBtn.textContent = '-';
      Object.assign(decreaseBtn.style, {
        width: '26px',
        height: '26px',
        border: 'none',
        borderRadius: '4px',
        backgroundColor: '#444',
        color: 'white',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      });
      speedControl.appendChild(decreaseBtn);
      
      // 语速显示
      const speedDisplay = document.createElement('span');
      speedDisplay.id = 'vvt-speed-display';
      speedDisplay.textContent = ttsSettings.elevenLabsSpeed.toFixed(2) + 'x';
      speedDisplay.style.minWidth = '45px';
      speedDisplay.style.textAlign = 'center';
      speedControl.appendChild(speedDisplay);
      
      // 加速按钮
      const increaseBtn = document.createElement('button');
      increaseBtn.textContent = '+';
      Object.assign(increaseBtn.style, {
        width: '26px',
        height: '26px',
        border: 'none',
        borderRadius: '4px',
        backgroundColor: '#444',
        color: 'white',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      });
      speedControl.appendChild(increaseBtn);
      
      panel.appendChild(speedControl);
      
      // 添加切换按钮
      const toggleBtn = document.createElement('div');
      toggleBtn.textContent = '隐藏';
      toggleBtn.style.fontSize = '10px';
      toggleBtn.style.textAlign = 'center';
      toggleBtn.style.marginTop = '5px';
      toggleBtn.style.cursor = 'pointer';
      panel.appendChild(toggleBtn);
      
      // 添加到页面
      document.body.appendChild(panel);
      
      // 减速按钮点击事件
      decreaseBtn.addEventListener('click', function() {
        // 最小速度0.5
        if (ttsSettings.elevenLabsSpeed > 0.5) {
          ttsSettings.elevenLabsSpeed = Math.max(0.5, ttsSettings.elevenLabsSpeed - 0.25);
          updateSpeedDisplay(); // 更新更详细的速度显示
          saveSettingsToLocalStorage();
          
          // 根据当前TTS服务显示不同的提示
          let speedMessage;
          if (ttsService === 'elevenlabs') {
            const actualSpeed = Math.max(0.7, Math.min(1.2, ttsSettings.elevenLabsSpeed));
            if (ttsSettings.elevenLabsSpeed < 0.7) {
              speedMessage = `语速已调整: ${ttsSettings.elevenLabsSpeed.toFixed(2)}x（ElevenLabs将使用: ${actualSpeed.toFixed(2)}x）`;
            } else {
              speedMessage = `语速已调整: ${ttsSettings.elevenLabsSpeed.toFixed(2)}x`;
            }
          } else if (ttsService === 'browser') {
            const actualSpeed = ttsSettings.elevenLabsSpeed * 1.4;
            speedMessage = `语速已调整: ${ttsSettings.elevenLabsSpeed.toFixed(2)}x（实际: ${actualSpeed.toFixed(2)}x）`;
          } else {
            speedMessage = `语速已调整: ${ttsSettings.elevenLabsSpeed.toFixed(2)}x`;
          }
          
          showOverlay(speedMessage, 2000);
        }
      });
      
      // 加速按钮点击事件
      increaseBtn.addEventListener('click', function() {
        // 修改ElevenLabs最大速度为1.2，符合API限制
        if (ttsSettings.elevenLabsSpeed < 3.0) {
          ttsSettings.elevenLabsSpeed = Math.min(3.0, ttsSettings.elevenLabsSpeed + 0.25);
          updateSpeedDisplay(); // 更新更详细的速度显示
          saveSettingsToLocalStorage();
          
          // 根据当前TTS服务显示不同的提示
          let speedMessage;
          if (ttsService === 'elevenlabs') {
            const actualSpeed = Math.max(0.7, Math.min(1.2, ttsSettings.elevenLabsSpeed));
            if (ttsSettings.elevenLabsSpeed > 1.2) {
              speedMessage = `语速已调整: ${ttsSettings.elevenLabsSpeed.toFixed(2)}x（ElevenLabs将使用: ${actualSpeed.toFixed(2)}x）`;
            } else {
              speedMessage = `语速已调整: ${ttsSettings.elevenLabsSpeed.toFixed(2)}x`;
            }
          } else if (ttsService === 'browser') {
            const actualSpeed = ttsSettings.elevenLabsSpeed * 1.4;
            speedMessage = `语速已调整: ${ttsSettings.elevenLabsSpeed.toFixed(2)}x（实际: ${actualSpeed.toFixed(2)}x）`;
          } else {
            speedMessage = `语速已调整: ${ttsSettings.elevenLabsSpeed.toFixed(2)}x`;
          }
          
          showOverlay(speedMessage, 2000);
        }
      });
      
      // 切换按钮点击事件
      let isPanelMinimized = false;
      toggleBtn.addEventListener('click', function() {
        if (isPanelMinimized) {
          // 展开面板
          speedControl.style.display = 'flex';
          serviceDisplay.style.display = 'block';
          title.style.display = 'block';
          toggleBtn.textContent = '隐藏';
          isPanelMinimized = false;
        } else {
          // 最小化面板
          speedControl.style.display = 'none';
          serviceDisplay.style.display = 'none';
          title.style.display = 'none';
          toggleBtn.textContent = '显示';
          isPanelMinimized = true;
        }
      });
      
      // 更新语速显示
      function updateSpeedDisplay() {
        const display = document.getElementById('vvt-speed-display');
        if (display) {
          // 获取当前设置的速度
          const userSpeed = ttsSettings.elevenLabsSpeed.toFixed(2);
          
          // 根据当前选择的TTS服务，显示不同的实际速度
          let actualSpeed;
          let speedInfo;
          
          if (ttsService === 'elevenlabs') {
            // ElevenLabs限制速度在0.7-1.2
            actualSpeed = Math.max(0.7, Math.min(1.2, ttsSettings.elevenLabsSpeed));
            
            if (ttsSettings.elevenLabsSpeed !== actualSpeed) {
              speedInfo = `${userSpeed}x→${actualSpeed.toFixed(2)}x`;
            } else {
              speedInfo = `${userSpeed}x`;
            }
          } else if (ttsService === 'browser') {
            // 浏览器语速是用户设置的1.4倍
            actualSpeed = ttsSettings.elevenLabsSpeed * 1.4;
            speedInfo = `${userSpeed}x (${actualSpeed.toFixed(2)}x)`;
          } else {
            // 自定义API使用原始速度
            speedInfo = `${userSpeed}x`;
          }
          
          display.textContent = speedInfo;
        }
      }
      
      // 更新服务显示
      function updateServiceDisplay() {
        const display = document.getElementById('vvt-service-display');
        if (display) {
          display.textContent = `当前服务: ${ttsService}`;
        }
      }
      
      // 监听设置变更，更新UI
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'updateTtsSettings') {
          setTimeout(updateSpeedDisplay, 100);
          setTimeout(updateServiceDisplay, 100);
        }
      });
      
      return {
        updateSpeedDisplay,
        updateServiceDisplay
      };
    }
    
    // 从新字幕中提取尚未播放的内容
    function extractNewContent(newSubtitle) {
      if (!newSubtitle || newSubtitle.trim().length === 0) return "";
      
      newSubtitle = newSubtitle.trim();
      
      // 如果没有上次播放的文本，直接返回整个字幕
      if (!lastSpokenText) return newSubtitle;
      
      // 如果新字幕与上次播放的一样，不需要播放
      if (newSubtitle === lastSpokenText) return "";
      
      // 如果新字幕包含旧字幕，提取差异部分
      if (newSubtitle.includes(lastSpokenText)) {
        const index = newSubtitle.indexOf(lastSpokenText);
        
        // 获取前缀（如果有）
        const prefix = index > 0 ? newSubtitle.substring(0, index) : "";
        
        // 获取后缀（如果有）
        const suffix = index + lastSpokenText.length < newSubtitle.length ? 
                      newSubtitle.substring(index + lastSpokenText.length) : "";
        
        // 组合新内容
        const newPart = (prefix + suffix).trim();
        
        // 只有当新部分有意义时才返回
        if (newPart.length > 0) {
          console.log('[VoicePal] 检测到增量更新，新内容:', newPart);
          return newPart;
        } else {
          return "";
        }
      }
      
      // 如果旧字幕包含新字幕，可能是回退，不播放
      if (lastSpokenText.includes(newSubtitle)) return "";
      
      // 如果两者没有包含关系，作为全新内容返回
      console.log('[VoicePal] 检测到完全新的内容:', newSubtitle);
      return newSubtitle;
    }
    
    // 使用浏览器TTS播放文本
    function speakWithBrowser(text) {
      if (!window.speechSynthesis) {
        console.error('[VoicePal] 浏览器不支持语音合成');
        return Promise.reject('浏览器不支持语音合成');
      }
      
      return new Promise((resolve, reject) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'zh-CN';
        utterance.volume = 1.0;
        
        // 使用从settings获取的语速，浏览器TTS支持更广的速度范围
        const userSpeed = parseFloat(ttsSettings.elevenLabsSpeed) || 1.0;
        
        // 浏览器默认语速为1.0，我们使用配置的速度，但稍微放大一点效果（1.4倍）
        utterance.rate = userSpeed * 1.4;
        
        console.log('[VoicePal] 浏览器TTS语速设置为:', utterance.rate, 
                   `(用户设置: ${userSpeed}，应用系数: 1.4)`);
        
        utterance.pitch = 1.0;
        
        // 事件监听
        utterance.onstart = () => {
          console.log('[VoicePal] 开始播放浏览器语音:', text);
        };
        
        utterance.onend = () => {
          console.log('[VoicePal] 浏览器语音播放结束');
          resolve();
        };
        
        utterance.onerror = (e) => {
          console.error('[VoicePal] 浏览器语音播放错误:', e);
          reject(e);
        };
        
        // 播放语音
        try {
          window.speechSynthesis.speak(utterance);
        } catch (e) {
          console.error('[VoicePal] 浏览器语音播放异常:', e);
          reject(e);
        }
      });
    }
    
    // 使用ElevenLabs API播放文本
    function speakWithElevenLabs(text) {
      if (!ttsSettings.elevenLabsApiKey) {
        console.error('[VoicePal] 缺少ElevenLabs API密钥');
        showOverlay("缺少ElevenLabs API密钥，请在扩展设置中配置", 3000);
        return Promise.reject('缺少ElevenLabs API密钥');
      }
      
      return new Promise((resolve, reject) => {
        console.log('[VoicePal] 尝试使用ElevenLabs播放:', text);
        console.log('[VoicePal] 文本长度:', text.length, '字符');
        showOverlay("正在使用ElevenLabs生成语音...", 2000);
        
        // 确保语速有效，限制在ElevenLabs API的允许范围内（0.7-1.2）
        let speed = parseFloat(ttsSettings.elevenLabsSpeed) || 1.0;
        
        // 如果超出范围，进行限制
        if (speed < 0.7) {
          console.warn('[VoicePal] ElevenLabs语速设置过低，已自动调整为最小值0.7（原值:', speed, ')');
          speed = 0.7;
        } else if (speed > 1.2) {
          console.warn('[VoicePal] ElevenLabs语速设置过高，已自动调整为最大值1.2（原值:', speed, ')');
          speed = 1.2;
        }
        
        console.log('[VoicePal] ElevenLabs语速设置为:', speed);
        
        const apiUrl = `https://api.elevenlabs.io/v1/text-to-speech/${ttsSettings.elevenLabsVoiceId}`;
        
        // 检查文本长度，如果太长可能会导致问题
        if (text.length > 5000) {
          console.warn('[VoicePal] 文本长度超过5000字符，可能会导致API请求失败');
          showOverlay("文本过长，可能会影响API请求", 3000);
        }
        
        // 准备请求内容
        const requestBody = {
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            speed: speed
          }
        };
        
        // 记录请求内容
        console.log('[VoicePal] ElevenLabs请求URL:', apiUrl);
        console.log('[VoicePal] ElevenLabs请求头部包含API密钥:', !!ttsSettings.elevenLabsApiKey);
        console.log('[VoicePal] ElevenLabs请求内容:', JSON.stringify(requestBody));
        
        fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': ttsSettings.elevenLabsApiKey
          },
          body: JSON.stringify(requestBody)
        })
        .then(async response => {
          if (!response.ok) {
            // 获取详细的错误信息
            const errorText = await response.text().catch(e => 'Unable to get error details');
            console.error('[VoicePal] ElevenLabs API响应错误:', response.status, response.statusText);
            console.error('[VoicePal] 错误详情:', errorText);
            showOverlay(`ElevenLabs API错误: ${response.status} - ${errorText.substring(0, 100)}`, 5000);
            throw new Error(`ElevenLabs API错误: ${response.status} - ${response.statusText}\n${errorText}`);
          }
          console.log('[VoicePal] ElevenLabs API响应成功，正在处理音频');
          return response.blob();
        })
        .then(blob => {
          console.log('[VoicePal] 获取到音频数据:', blob.type, `大小: ${blob.size} 字节`);
          
          // 如果blob大小过小，可能是空响应或错误
          if (blob.size < 100) {
            console.warn('[VoicePal] 收到的音频数据大小异常小:', blob.size);
          }
          
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          
          // 将音频元素添加到跟踪数组
          activeAudioElements.push(audio);
          
          console.log('[VoicePal] 开始播放ElevenLabs语音:', text);
          
          audio.onended = () => {
            console.log('[VoicePal] ElevenLabs语音播放结束');
            URL.revokeObjectURL(audioUrl);
            // 从跟踪数组中移除
            const index = activeAudioElements.indexOf(audio);
            if (index > -1) {
              activeAudioElements.splice(index, 1);
            }
            resolve();
          };
          
          audio.onerror = (e) => {
            console.error('[VoicePal] ElevenLabs语音播放错误:', e);
            URL.revokeObjectURL(audioUrl);
            // 从跟踪数组中移除
            const index = activeAudioElements.indexOf(audio);
            if (index > -1) {
              activeAudioElements.splice(index, 1);
            }
            reject(e);
          };
          
          audio.play().catch(e => {
            console.error('[VoicePal] ElevenLabs语音播放失败:', e);
            // 从跟踪数组中移除
            const index = activeAudioElements.indexOf(audio);
            if (index > -1) {
              activeAudioElements.splice(index, 1);
            }
            reject(e);
          });
        })
        .catch(error => {
          console.error('[VoicePal] ElevenLabs API请求失败:', error);
          showOverlay("ElevenLabs API请求失败: " + error.message, 3000);
          reject(error);
        });
      });
    }
    
    // 使用自定义API播放文本
    function speakWithCustomApi(text) {
      if (!ttsSettings.customApiUrl) {
        console.error('[VoicePal] 缺少自定义API URL');
        showOverlay("缺少自定义API URL，请在扩展设置中配置", 3000);
        return Promise.reject('缺少自定义API URL');
      }
      
      return new Promise((resolve, reject) => {
        console.log('[VoicePal] 尝试使用自定义API播放:', text);
        showOverlay("正在使用自定义API生成语音...", 2000);
        
        fetch(ttsSettings.customApiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...ttsSettings.customApiHeaders
          },
          body: JSON.stringify({
            text: text,
            language: 'zh-CN'
          })
        })
        .then(response => {
          if (!response.ok) {
            throw new Error(`自定义API错误: ${response.status}`);
          }
          return response.blob();
        })
        .then(blob => {
          const audioUrl = URL.createObjectURL(blob);
          const audio = new Audio(audioUrl);
          
          // 将音频元素添加到跟踪数组
          activeAudioElements.push(audio);
          
          console.log('[VoicePal] 开始播放自定义API语音:', text);
          
          audio.onended = () => {
            console.log('[VoicePal] 自定义API语音播放结束');
            URL.revokeObjectURL(audioUrl);
            // 从跟踪数组中移除
            const index = activeAudioElements.indexOf(audio);
            if (index > -1) {
              activeAudioElements.splice(index, 1);
            }
            resolve();
          };
          
          audio.onerror = (e) => {
            console.error('[VoicePal] 自定义API语音播放错误:', e);
            URL.revokeObjectURL(audioUrl);
            // 从跟踪数组中移除
            const index = activeAudioElements.indexOf(audio);
            if (index > -1) {
              activeAudioElements.splice(index, 1);
            }
            reject(e);
          };
          
          audio.play().catch(e => {
            console.error('[VoicePal] 自定义API语音播放失败:', e);
            // 从跟踪数组中移除
            const index = activeAudioElements.indexOf(audio);
            if (index > -1) {
              activeAudioElements.splice(index, 1);
            }
            reject(e);
          });
        })
        .catch(error => {
          console.error('[VoicePal] 自定义API请求失败:', error);
          showOverlay("自定义API请求失败: " + error.message, 3000);
          reject(error);
        });
      });
    }
    
    // 根据选择的服务播放文本
    function speakWithSelectedService(text) {
      console.log('[VoicePal] 当前选择的TTS服务:', ttsService);
      
      // 额外验证API密钥是否存在
      if (ttsService === 'elevenlabs' && !ttsSettings.elevenLabsApiKey) {
        console.warn('[VoicePal] 尝试使用ElevenLabs但API密钥未设置，回退到浏览器TTS');
        showOverlay('ElevenLabs API密钥未设置，使用浏览器TTS', 2000);
        return speakWithBrowser(text);
      }
      
      // 额外验证自定义URL是否存在
      if (ttsService === 'custom' && !ttsSettings.customApiUrl) {
        console.warn('[VoicePal] 尝试使用自定义API但URL未设置，回退到浏览器TTS');
        showOverlay('自定义API URL未设置，使用浏览器TTS', 2000);
        return speakWithBrowser(text);
      }
      
      switch (ttsService) {
        case 'elevenlabs':
          return speakWithElevenLabs(text);
        case 'custom':
          return speakWithCustomApi(text);
        case 'browser':
        default:
          return speakWithBrowser(text);
      }
    }
    
    // 检查文本是否与队列中的内容有重叠（用于过滤增量更新）
    function isIncrementalContentInQueue(newText) {
      // 检查新文本是否包含队列中的文本
      for (let i = 0; i < speechQueue.length; i++) {
        const queuedText = speechQueue[i];
        
        // 如果新文本包含队列中的文本，视为增量更新
        if (newText.includes(queuedText)) {
          console.log('[VoicePal] 新文本包含队列中的文本，可能是增量更新');
          console.log(`[VoicePal] 队列中: "${queuedText}" 包含于新文本: "${newText}"`);
          return {
            isIncremental: true,
            queueIndex: i,
            queuedText: queuedText
          };
        }
        
        // 如果队列中的文本包含新文本，新文本可能是部分内容，不应加入队列
        if (queuedText.includes(newText)) {
          console.log('[VoicePal] 队列中的文本包含新文本，新文本可能是部分内容');
          console.log(`[VoicePal] 新文本: "${newText}" 包含于队列中: "${queuedText}"`);
          return {
            isIncremental: true,
            queueIndex: i,
            queuedText: queuedText
          };
        }
      }
      
      return { isIncremental: false };
    }
    
    // 替换队列中的文本，用于处理增量更新
    function replaceQueueItemWithNewContent(newText, queueIndex) {
      // 记录被替换的文本以便日志
      const replacedText = speechQueue[queueIndex];
      
      // 从队列中移除旧文本
      speechQueue.splice(queueIndex, 1);
      
      // 将新文本添加到队列相同位置
      speechQueue.splice(queueIndex, 0, newText);
      
      console.log(`[VoicePal] 队列更新: "${replacedText}" 被替换为 "${newText}"`);
    }
    
    // 合并文本并去除重复部分
    function combineTextsWithoutDuplication(currentText, queueTexts) {
      // 如果队列为空，直接返回当前文本
      if (queueTexts.length === 0) return currentText;
      
      console.log('[VoicePal] 开始合并文本并去除重复部分');
      console.log(`[VoicePal] 当前文本: "${currentText}"`);
      console.log(`[VoicePal] 队列文本: ${queueTexts.map(t => `"${t}"`).join(', ')}`);
      
      // 初始结果为当前文本
      let result = currentText;
      
      // 首先检查当前文本与lastSpokenText的重叠
      if (lastSpokenText && lastSpokenText.trim().length > 0) {
        console.log(`[VoicePal] 上次播放的文本: "${lastSpokenText}"`);
        
        // 查找lastSpokenText尾部与当前文本头部的重叠
        let overlap = "";
        const minLength = Math.min(lastSpokenText.length, result.length);
        
        // 检查lastSpokenText的尾部与result的头部是否有重叠
        for (let len = minLength; len > 0; len--) {
          const lastSuffix = lastSpokenText.substring(lastSpokenText.length - len);
          const resultPrefix = result.substring(0, len);
          
          if (lastSuffix === resultPrefix) {
            overlap = lastSuffix;
            break;
          }
        }
        
        // 如果找到重叠部分，从当前文本中删除
        if (overlap.length > 0) {
          console.log(`[VoicePal] 与lastSpokenText发现重叠部分: "${overlap}"`);
          result = result.substring(overlap.length);
          console.log(`[VoicePal] 去除lastSpokenText重叠后的文本: "${result}"`);
        }
        
        // 检查当前文本是否完全包含在lastSpokenText中
        if (lastSpokenText.includes(result)) {
          console.log(`[VoicePal] 当前文本完全包含在lastSpokenText中，跳过此部分`);
          result = "";
        }
      }
      
      // 如果当前文本已被完全过滤，但队列有内容，从队列第一项开始处理
      if (result.trim().length === 0 && queueTexts.length > 0) {
        result = queueTexts.shift() || "";
      }
      
      // 处理每个队列文本
      for (let i = 0; i < queueTexts.length; i++) {
        const queueText = queueTexts[i];
        
        // 跳过空文本
        if (!queueText || queueText.trim().length === 0) continue;
        
        // 检查队列文本是否完全包含在lastSpokenText中
        if (lastSpokenText && lastSpokenText.includes(queueText)) {
          console.log(`[VoicePal] 队列文本完全包含在lastSpokenText中，跳过: "${queueText}"`);
          continue;
        }
        
        // 查找重叠部分 - 从结尾开始检查
        let overlap = "";
        const minLength = Math.min(result.length, queueText.length);
        
        // 检查result的尾部与queueText的头部是否有重叠
        for (let len = minLength; len > 0; len--) {
          const resultSuffix = result.substring(result.length - len);
          const queuePrefix = queueText.substring(0, len);
          
          if (resultSuffix === queuePrefix) {
            overlap = resultSuffix;
            break;
          }
        }
        
        // 如果找到重叠部分，删除重复内容
        if (overlap.length > 0) {
          console.log(`[VoicePal] 发现重叠部分: "${overlap}"`);
          // 只添加队列文本中不重叠的部分
          result += queueText.substring(overlap.length);
        } else {
          // 无重叠，使用空格连接（如果result不为空）
          result += (result.length > 0 ? " " : "") + queueText;
        }
        
        console.log(`[VoicePal] 当前合并结果: "${result}"`);
      }
      
      // 最后检查合并结果与lastSpokenText的关系
      if (lastSpokenText && result.trim().length > 0) {
        // 如果合并结果是lastSpokenText的一部分，跳过
        if (lastSpokenText.includes(result)) {
          console.log(`[VoicePal] 最终合并结果完全包含在lastSpokenText中，跳过播放`);
          return "";
        }
        
        // 如果lastSpokenText和合并结果有部分重叠（lastSpokenText的结尾与result的开头）
        let maxOverlap = 0;
        for (let len = Math.min(lastSpokenText.length, result.length); len > 0; len--) {
          if (lastSpokenText.endsWith(result.substring(0, len))) {
            maxOverlap = len;
            break;
          }
        }
        
        // 如果有重叠，截取非重叠部分
        if (maxOverlap > 0) {
          const originalResult = result;
          result = result.substring(maxOverlap);
          console.log(`[VoicePal] 检测到与lastSpokenText末尾重叠${maxOverlap}个字符`);
          console.log(`[VoicePal] 原始结果: "${originalResult}"`);
          console.log(`[VoicePal] 去除重叠后: "${result}"`);
        }
      }
      
      console.log(`[VoicePal] 最终合并文本: "${result}"`);
      return result;
    }
    
    // 播放语音的核心函数
    function speakText(text) {
      if (!text || text.trim().length === 0) return;
      
      text = text.trim();
      
      // 如果与上次播放完全相同，跳过
      if (text === lastSpokenText) return;
      
      // 如果正在播放，需要处理队列
      if (isSpeaking) {
        // 检查是否已在队列中
        if (speechQueue.includes(text)) {
          console.log('[VoicePal] 文本已在队列中，跳过:', text);
          return;
        }
        
        // 检查是否是队列中某个文本的增量更新
        const incrementalCheck = isIncrementalContentInQueue(text);
        if (incrementalCheck.isIncremental) {
          // 如果是增量更新，替换队列中的旧内容
          replaceQueueItemWithNewContent(text, incrementalCheck.queueIndex);
          return;
        }
        
        // 不是增量更新，正常加入队列
        speechQueue.push(text);
        console.log('[VoicePal] 已加入队列:', text);
        return;
      }
      
      // 标记为正在播放
      isSpeaking = true;
      
      // 如果队列中有内容，将新文本与队列内容合并一起播放（去除重复部分）
      let combinedText = text;
      
      if (speechQueue.length > 0) {
        // 使用智能合并功能去除重复部分
        combinedText = combineTextsWithoutDuplication(text, speechQueue);
        console.log(`[VoicePal] 智能合并了 ${speechQueue.length + 1} 段文本，去除重复部分:`, combinedText);
        
        // 清空队列，因为所有内容都将被播放
        speechQueue.length = 0;
      }
      
      // 记住当前要播放的文本，用于后续更新lastSpokenText
      const textToSpeak = combinedText;
      
      // 使用选择的服务播放
      speakWithSelectedService(combinedText)
        .then(() => {
          // 播放完成后，更新lastSpokenText
          // 注意：这里改为使用实际播放的文本来更新，而不是currentSubtitle
          lastSpokenText = textToSpeak;
          console.log('[VoicePal] 更新lastSpokenText为:', lastSpokenText);
          
          // 标记播放完成
          isSpeaking = false;
          
          // 处理可能在播放过程中新加入队列的内容
          setTimeout(() => {
            if (speechQueue.length > 0) {
              // 智能合并队列内容，去除重复部分
              const allQueuedTexts = combineTextsWithoutDuplication("", speechQueue);
              // 清空队列
              speechQueue.length = 0;
              
              // 只有当有内容时才播放
              if (allQueuedTexts.trim().length > 0) {
                console.log('[VoicePal] 播放过程中新加入的队列内容(已去重):', allQueuedTexts);
                speakText(allQueuedTexts);
              }
            }
          }, 50);
        })
        .catch(error => {
          console.error('[VoicePal] 语音播放失败:', error);
          isSpeaking = false;
          
          // 尝试使用浏览器TTS作为备选
          if (ttsService !== 'browser') {
            console.log('[VoicePal] 尝试使用浏览器TTS作为备选');
            speakWithBrowser(combinedText)
              .then(() => {
                // 即使是备选播放也要更新lastSpokenText
                lastSpokenText = textToSpeak;
                console.log('[VoicePal] 备选播放完成，更新lastSpokenText为:', lastSpokenText);
              })
              .catch(e => console.error('[VoicePal] 备选播放也失败:', e));
          }
          
          // 处理可能在播放过程中新加入队列的内容
          setTimeout(() => {
            if (speechQueue.length > 0) {
              // 智能合并队列内容，去除重复部分
              const allQueuedTexts = combineTextsWithoutDuplication("", speechQueue);
              // 清空队列
              speechQueue.length = 0;
              
              // 只有当有内容时才播放
              if (allQueuedTexts.trim().length > 0) {
                console.log('[VoicePal] 备选播放后处理剩余队列内容(已去重):', allQueuedTexts);
                speakText(allQueuedTexts);
              }
            }
          }, 50);
        });
    }
    
    // 处理新检测到的字幕
    function processSubtitle(subtitle) {
      if (!subtitle || subtitle.trim().length === 0) return;
      
      // 过滤掉字幕切换提示信息
      if (subtitle.includes('>>') || 
          subtitle.includes('自动生成') || 
          subtitle.includes('English') || 
          subtitle.includes('中文') ||
          subtitle.includes('Japanese') ||
          subtitle.includes('Spanish') ||
          subtitle.includes('French') ||
          subtitle.includes('German') ||
          subtitle.includes('Russian')) {
        console.log('[VoicePal] 跳过字幕切换提示:', subtitle);
        return;
      }
      
      // 保存当前字幕
      currentSubtitle = subtitle.trim();
      
      // 提取新内容
      const newContent = extractNewContent(currentSubtitle);
      
      // 播放新内容
      if (newContent && newContent.length > 0) {
        console.log('[VoicePal] 提取到新内容:', newContent);
        speakText(newContent);
      }
    }

    // 监听字幕变化
    function setupSubtitleObserver() {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          if (mutation.type === 'childList') {
            // 查找YouTube字幕元素
            const subtitleElement = mutation.target.closest('.ytp-caption-segment');
            if (subtitleElement) {
              const text = subtitleElement.textContent.trim();
              if (text) {
                console.log('[VoicePal] 检测到字幕:', text);
                
                // 检查是否为YouTube字幕设置信息
                const isSettingInfo = 
                  subtitleElement.parentElement && 
                  (subtitleElement.parentElement.classList.contains('ytp-caption-segment-metadata') ||
                   subtitleElement.parentElement.classList.contains('caption-metadata'));
                
                if (isSettingInfo) {
                  console.log('[VoicePal] 跳过字幕设置信息');
                  return;
                }
                
                processSubtitle(text);
              }
            }
          }
        });
      });
      
      // 查找YouTube字幕容器
      const subtitleContainer = document.querySelector('.ytp-caption-window-container');
      if (subtitleContainer) {
        observer.observe(subtitleContainer, {
          childList: true,
          subtree: true
        });
        console.log('[VoicePal] 已设置字幕观察器');
        return observer;
      } else {
        console.log('[VoicePal] 未找到字幕容器，尝试延迟搜索');
        
        // 如果没有找到字幕容器，设置一个定时器继续搜索
        const searchInterval = setInterval(() => {
          const container = document.querySelector('.ytp-caption-window-container');
          if (container) {
            clearInterval(searchInterval);
            observer.observe(container, {
              childList: true,
              subtree: true
            });
            console.log('[VoicePal] 延迟搜索找到字幕容器，已设置观察器');
            showOverlay("已找到字幕容器，将自动播放字幕", 3000);
          }
        }, 2000);
        
        return observer;
      }
    }
    
    // 停止所有正在播放的音频的函数
    function stopAllAudio() {
      console.log('[VoicePal] 停止所有音频播放');
      
      // 停止浏览器TTS
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      
      // 停止所有正在播放的音频元素
      activeAudioElements.forEach(audio => {
        try {
          audio.pause();
          audio.currentTime = 0;
          console.log('[VoicePal] 停止了一个音频元素');
        } catch (e) {
          console.error('[VoicePal] 停止音频元素失败:', e);
        }
      });
      
      // 清空音频元素数组
      activeAudioElements = [];
      
      // 重置状态
      isSpeaking = false;
    }
    
    // 监听强制停止事件
    document.addEventListener('vvt-force-stop-translation', (event) => {
      console.log('[VoicePal] 收到强制停止事件');
      
      // 停止所有音频
      stopAllAudio();
      
      // 清空所有状态
      lastSpokenText = "";
      currentSubtitle = "";
      speechQueue.length = 0;
      
      showOverlay("字幕转语音已停止", 2000);
    });
    
    // 接收设置更新的消息
    window.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'updateTtsSettings') {
        console.log('[VoicePal] 收到设置更新消息:', event.data);
        
        if (event.data.ttsService) {
          ttsService = event.data.ttsService;
          console.log('[VoicePal] TTS服务已更新为:', ttsService);
        }
        
        if (event.data.ttsSettings) {
          // 合并设置，保留当前值
          const newSettings = {...ttsSettings, ...event.data.ttsSettings};
          
          // 特别处理elevenLabsSpeed，确保它是数字
          if (event.data.ttsSettings.elevenLabsSpeed) {
            newSettings.elevenLabsSpeed = parseFloat(event.data.ttsSettings.elevenLabsSpeed) || 1.25;
          }
          
          ttsSettings = newSettings;
          console.log('[VoicePal] TTS设置已更新:', 
                      ttsSettings.elevenLabsApiKey ? '包含ElevenLabs API密钥' : '无ElevenLabs API密钥',
                      ttsSettings.customApiUrl ? '包含自定义API URL' : '无自定义API URL',
                      `ElevenLabs语速: ${ttsSettings.elevenLabsSpeed}`);
        }
        
        // 保存到localStorage
        saveSettingsToLocalStorage();
        
        // 显示确认消息
        showOverlay(`TTS服务已更新: ${ttsService}`, 2000);
        
        // 更新控制面板（如果存在）
        updateControlPanel();
        
        // 发送状态回到内容脚本
        window.postMessage({
          type: 'ttsSettingsStatus',
          status: 'success',
          currentService: ttsService,
          settings: {
            elevenLabsSpeed: ttsSettings.elevenLabsSpeed,
            hasElevenLabsKey: !!ttsSettings.elevenLabsApiKey,
            hasCustomApiUrl: !!ttsSettings.customApiUrl
          }
        }, '*');
      } else if (event.data && event.data.type === 'stopTTS') {
        // 添加响应停止TTS的消息处理
        stopAllAudio();
        lastSpokenText = "";
        currentSubtitle = "";
        speechQueue.length = 0;
        showOverlay("已停止语音播放", 2000);
      } else if (event.data && event.data.type === 'getTtsStatus') {
        // 报告当前TTS状态
        window.postMessage({
          type: 'ttsSettingsStatus',
          status: 'current',
          currentService: ttsService,
          settings: {
            elevenLabsSpeed: ttsSettings.elevenLabsSpeed,
            hasElevenLabsKey: !!ttsSettings.elevenLabsApiKey,
            hasCustomApiUrl: !!ttsSettings.customApiUrl
          }
        }, '*');
      }
    });
    
    // 更新控制面板显示（如果存在）
    function updateControlPanel() {
      const serviceDisplay = document.getElementById('vvt-service-display');
      if (serviceDisplay) {
        serviceDisplay.textContent = `当前服务: ${ttsService}`;
      }
      
      const speedDisplay = document.getElementById('vvt-speed-display');
      if (speedDisplay) {
        speedDisplay.textContent = ttsSettings.elevenLabsSpeed.toFixed(2) + 'x';
      }
    }
    
    // 修改启动部分，移除测试按钮的创建
    setTimeout(() => {
      const observer = setupSubtitleObserver();
      if (observer) {
        showOverlay("字幕监听已启动，将自动播放字幕", 3000);
      } else {
        showOverlay("未找到字幕，请确保视频已打开字幕", 3000);
      }
      
      // 创建控制面板
      createControlPanel();
    }, 2000);
    
    console.log('[VoicePal] 超简化版语音处理器加载完成');
  } catch (e) {
    console.error('[VoicePal] 语音处理器加载失败:', e);
  }
})(); 