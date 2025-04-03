// DOM元素引用
const voiceLanguageSelect = document.getElementById('voiceLanguage');
const startButton = document.getElementById('startButton');
const stopButton = document.getElementById('stopButton');
const statusDiv = document.getElementById('status');
const ttsServiceSelect = document.getElementById('ttsService');
const elevenLabsSettings = document.getElementById('elevenLabsSettings');
const elevenLabsApiKeyInput = document.getElementById('elevenLabsApiKey');
const elevenLabsVoiceIdSelect = document.getElementById('elevenLabsVoiceId');
const refreshVoicesButton = document.getElementById('refreshVoices');
const customApiSettings = document.getElementById('customApiSettings');
const customApiUrlInput = document.getElementById('customApiUrl');
const customApiRefAudioInput = document.getElementById('customApiRefAudio');
const testCustomApiButton = document.getElementById('testCustomApi');

// 存储当前翻译状态
let isTranslating = false;

// ElevenLabs语音列表
let elevenLabsVoices = [];

// 参考音频的Base64编码
let refAudioBase64 = null;

// 初始化时加载设置
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 从存储中获取设置和翻译状态
    const response = await sendMessage({ action: 'getSettings' });
    const settings = response.settings;
    
    // 更新UI以反映当前设置
    if (settings.targetLanguage) {
      voiceLanguageSelect.value = settings.targetLanguage;
    }
    
    // 设置TTS服务选择
    if (settings.ttsService) {
      ttsServiceSelect.value = settings.ttsService;
      updateTtsServiceUI(settings.ttsService);
    }
    
    // 设置ElevenLabs相关UI
    if (settings.elevenLabsApiKey) {
      elevenLabsApiKeyInput.value = settings.elevenLabsApiKey;
      // 如果有API密钥，尝试加载语音列表
      if (settings.ttsService === 'elevenlabs') {
        loadElevenLabsVoices();
      }
    }
    
    if (settings.elevenLabsVoiceId) {
      // 稍后在语音列表加载后设置选中的语音
      setTimeout(() => {
        if (elevenLabsVoiceIdSelect.querySelector(`option[value="${settings.elevenLabsVoiceId}"]`)) {
          elevenLabsVoiceIdSelect.value = settings.elevenLabsVoiceId;
        }
      }, 1000);
    }
    
    // 设置自定义API相关UI
    if (settings.customApiUrl) {
      customApiUrlInput.value = settings.customApiUrl;
    }
    
    // 更新翻译状态
    isTranslating = response.isTranslating;
    updateTranslationStatus();
  } catch (error) {
    showStatus('加载设置时出错: ' + error.message, 'error');
  }
});

// 更新TTS服务UI
function updateTtsServiceUI(service) {
  // 隐藏所有设置面板
  elevenLabsSettings.style.display = 'none';
  customApiSettings.style.display = 'none';
  
  // 显示选中的设置面板
  if (service === 'elevenlabs') {
    elevenLabsSettings.style.display = 'block';
  } else if (service === 'customapi') {
    customApiSettings.style.display = 'block';
  }
}

// 保存设置
async function saveSettings() {
  try {
    const settings = {
      enabled: true, // 始终启用
      sourceLanguage: 'auto', // 始终自动检测
      targetLanguage: voiceLanguageSelect.value,
      captureInterval: 3000, // 固定为3秒
      subtitleToSpeech: true, // 始终启用字幕转语音
      
      // TTS服务选择
      ttsService: ttsServiceSelect.value,
      
      // ElevenLabs设置
      elevenLabsApiKey: elevenLabsApiKeyInput.value,
      elevenLabsVoiceId: elevenLabsVoiceIdSelect.value !== 'loading' ? elevenLabsVoiceIdSelect.value : '',
      
      // 自定义API设置
      customApiUrl: customApiUrlInput.value,
      customApiRefAudio: refAudioBase64
    };
    
    await sendMessage({ action: 'saveSettings', settings });
    showStatus('设置已保存', 'success');
    
    // 3秒后隐藏状态消息
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 3000);
  } catch (error) {
    showStatus('保存设置时出错: ' + error.message, 'error');
  }
}

// 加载ElevenLabs语音列表
async function loadElevenLabsVoices() {
  if (!elevenLabsApiKeyInput.value) {
    showStatus('请先输入ElevenLabs API密钥', 'error');
    return;
  }
  
  try {
    elevenLabsVoiceIdSelect.innerHTML = '<option value="loading">加载中...</option>';
    
    const response = await fetch('https://api.elevenlabs.io/v1/voices', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'xi-api-key': elevenLabsApiKeyInput.value
      }
    });
    
    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }
    
    const data = await response.json();
    elevenLabsVoices = data.voices || [];
    
    // 更新语音下拉列表
    elevenLabsVoiceIdSelect.innerHTML = '';
    elevenLabsVoices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voice.voice_id;
      option.textContent = `${voice.name} (${voice.labels.accent || '标准'})`;
      elevenLabsVoiceIdSelect.appendChild(option);
    });
    
    // 如果没有语音，显示提示
    if (elevenLabsVoices.length === 0) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = '未找到语音';
      elevenLabsVoiceIdSelect.appendChild(option);
    }
    
    // 尝试恢复之前选择的语音
    const settings = (await sendMessage({ action: 'getSettings' })).settings;
    if (settings.elevenLabsVoiceId && elevenLabsVoiceIdSelect.querySelector(`option[value="${settings.elevenLabsVoiceId}"]`)) {
      elevenLabsVoiceIdSelect.value = settings.elevenLabsVoiceId;
    }
    
    showStatus('语音列表已更新', 'success');
  } catch (error) {
    console.error('加载ElevenLabs语音列表时出错:', error);
    elevenLabsVoiceIdSelect.innerHTML = '<option value="">加载失败</option>';
    showStatus('加载语音列表失败: ' + error.message, 'error');
  }
}

// 开始字幕转语音
async function startTranslation() {
  try {
    // 首先保存当前设置
    await saveSettings();
    
    // 发送开始翻译的消息
    const response = await sendMessage({ action: 'startTranslation' });
    
    if (response.success) {
      isTranslating = true;
      updateTranslationStatus();
      showStatus('字幕转语音已开始', 'success');
    } else {
      showStatus('开始字幕转语音时出错: ' + (response.error || '未知错误'), 'error');
    }
  } catch (error) {
    showStatus('开始字幕转语音时出错: ' + error.message, 'error');
  }
}

// 停止字幕转语音
async function stopTranslation() {
  try {
    // 发送停止翻译的消息
    const response = await sendMessage({ action: 'stopTranslation' });
    
    if (response.success) {
      isTranslating = false;
      updateTranslationStatus();
      showStatus('字幕转语音已停止', 'success');
    } else {
      showStatus('停止字幕转语音时出错: ' + (response.error || '未知错误'), 'error');
    }
  } catch (error) {
    showStatus('停止字幕转语音时出错: ' + error.message, 'error');
  }
}

// 更新翻译状态UI
async function updateTranslationStatus() {
  try {
    // 如果isTranslating未定义，从background.js获取当前状态
    if (isTranslating === undefined) {
      const response = await sendMessage({ action: 'getTranslationStatus' });
      isTranslating = response.isTranslating;
    }
    
    if (isTranslating) {
      startButton.style.display = 'none';
      stopButton.style.display = 'block';
    } else {
      startButton.style.display = 'block';
      stopButton.style.display = 'none';
    }
  } catch (error) {
    console.error('获取翻译状态时出错:', error);
    // 默认显示开始按钮
    startButton.style.display = 'block';
    stopButton.style.display = 'none';
  }
}

// 显示状态消息
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
}

// 发送消息到后台脚本并等待响应
function sendMessage(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

// 测试自定义API连接
async function testCustomApiConnection() {
  if (!customApiUrlInput.value) {
    showStatus('请输入API服务器地址', 'error');
    return;
  }
  
  try {
    testCustomApiButton.disabled = true;
    testCustomApiButton.textContent = '测试中...';
    
    // 发送健康检查请求
    const response = await fetch(`${customApiUrlInput.value}/health`, {
      method: 'GET'
    });
    
    if (response.ok) {
      const data = await response.json();
      showStatus(`API连接成功: ${data.message || 'API服务正常运行'}`, 'success');
    } else {
      showStatus(`API连接失败: HTTP ${response.status}`, 'error');
    }
  } catch (error) {
    showStatus(`API连接失败: ${error.message}`, 'error');
  } finally {
    testCustomApiButton.disabled = false;
    testCustomApiButton.textContent = '测试API连接';
  }
}

// 处理参考音频文件
function handleRefAudioFile() {
  const file = customApiRefAudioInput.files[0];
  if (!file) {
    refAudioBase64 = null;
    return;
  }
  
  const reader = new FileReader();
  reader.onload = (e) => {
    // 获取Base64编码的音频数据
    refAudioBase64 = e.target.result.split(',')[1]; // 移除"data:audio/wav;base64,"前缀
    saveSettings();
  };
  reader.onerror = () => {
    showStatus('读取参考音频文件失败', 'error');
    refAudioBase64 = null;
  };
  reader.readAsDataURL(file);
}

// 添加事件监听器
voiceLanguageSelect.addEventListener('change', saveSettings);
startButton.addEventListener('click', startTranslation);
stopButton.addEventListener('click', stopTranslation);
ttsServiceSelect.addEventListener('change', () => {
  updateTtsServiceUI(ttsServiceSelect.value);
  saveSettings();
  
  // 如果选择了ElevenLabs并且有API密钥，尝试加载语音列表
  if (ttsServiceSelect.value === 'elevenlabs' && elevenLabsApiKeyInput.value) {
    loadElevenLabsVoices();
  }
});
elevenLabsApiKeyInput.addEventListener('blur', saveSettings);
elevenLabsVoiceIdSelect.addEventListener('change', saveSettings);
refreshVoicesButton.addEventListener('click', loadElevenLabsVoices);
customApiUrlInput.addEventListener('blur', saveSettings);
customApiRefAudioInput.addEventListener('change', handleRefAudioFile);
testCustomApiButton.addEventListener('click', testCustomApiConnection);

// 防止表单提交
document.querySelectorAll('form').forEach(form => {
  form.addEventListener('submit', (e) => e.preventDefault());
});

// 当点击开始翻译按钮时
document.getElementById('startBtn').addEventListener('click', function() {
  // 收集所有设置
  const settings = collectSettings();
  
  // 保存设置
  saveSettings(settings);
  
  // 发送消息到内容脚本
  sendStartMessage(settings);
});

// 收集界面上的所有设置
function collectSettings() {
  // 收集基础设置
  const settings = {
    enabled: document.getElementById('enableTranslation').checked,
    sourceLanguage: document.getElementById('sourceLanguage').value,
    targetLanguage: document.getElementById('targetLanguage').value,
    enableTTS: document.getElementById('enableTTS').checked,
    timestamp: Date.now()
  };
  
  // 收集TTS相关设置
  const ttsService = document.querySelector('input[name="ttsService"]:checked')?.value || 'browser';
  
  // TTS设置对象
  const ttsSettings = {
    ttsService: ttsService,
    elevenLabsApiKey: document.getElementById('elevenLabsApiKey')?.value || '',
    elevenLabsVoiceId: document.getElementById('elevenLabsVoiceId')?.value || '21m00Tcm4TlvDq8ikWAM',
    elevenLabsSpeed: parseFloat(document.getElementById('elevenLabsSpeed')?.value || '1.25'),
    customApiUrl: document.getElementById('customApiUrl')?.value || '',
    customApiHeaders: {}
  };
  
  // 合并设置
  settings.ttsSettings = ttsSettings;
  
  console.log('已收集设置:', settings);
  return settings;
}

// 保存设置到Chrome存储
function saveSettings(settings) {
  try {
    chrome.storage.local.set(settings);
    console.log('设置已保存到Chrome存储');
  } catch (e) {
    console.error('保存设置失败:', e);
  }
}

// 发送开始消息到内容脚本
function sendStartMessage(settings) {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length === 0) {
      console.error('没有活动标签页');
      return;
    }
    
    const activeTab = tabs[0];
    
    // 首先发送TTS设置更新
    chrome.tabs.sendMessage(activeTab.id, {
      action: 'updateTtsSettings',
      ttsSettings: settings.ttsSettings
    }, function(response) {
      console.log('TTS设置更新响应:', response);
      
      // 然后发送开始翻译消息
      chrome.tabs.sendMessage(activeTab.id, {
        action: 'startTranslation',
        timestamp: settings.timestamp,
        settings: settings
      }, function(response) {
        console.log('开始翻译响应:', response);
      });
    });
  });
}

// 当点击停止翻译按钮时
document.getElementById('stopBtn').addEventListener('click', function() {
  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (tabs.length > 0) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'stopTranslation',
        timestamp: Date.now()
      });
    }
  });
});
