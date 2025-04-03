// 存储翻译设置
let translationSettings = {
  enabled: false,
  sourceLanguage: 'auto',
  targetLanguage: 'zh-CN',
  captureInterval: 3000, // 默认3秒
  subtitleToSpeech: true, // 默认启用字幕转语音
  
  // TTS服务选择
  ttsService: 'browser', // 'browser', 'elevenlabs', 'customapi'
  
  // ElevenLabs设置
  elevenLabsApiKey: '', // ElevenLabs API密钥
  elevenLabsVoiceId: '', // ElevenLabs语音ID
  
  // 自定义API设置
  customApiUrl: '', // 自定义API服务器地址
  customApiRefAudio: null // Base64编码的参考音频
};

// 存储当前活动的音频处理状态
let activeAudioProcessing = {
  tabId: null,
  stream: null,
  isActive: false // 添加一个标志来表示翻译是否处于活动状态
};

// 初始化时从存储中加载设置和状态
chrome.storage.local.get(['translationSettings', 'translationActive'], (result) => {
  if (result.translationSettings) {
    translationSettings = result.translationSettings;
  }
  
  // 恢复翻译活动状态
  if (result.translationActive) {
    activeAudioProcessing.isActive = true;
  }
});

// 监听标签页更新事件，处理页面刷新和导航
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // 当页面完成加载且翻译处于活动状态时
  if (changeInfo.status === 'complete' && activeAudioProcessing.isActive && tabId === activeAudioProcessing.tabId) {
    // 检查是否是导航到新页面
    if (changeInfo.url) {
      console.log('检测到导航到新页面:', changeInfo.url);
      // 延迟一段时间，确保页面已经完全加载
      setTimeout(() => {
        // 仅注入内容脚本，不再尝试注入speech_processor_combined.js
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['js/content.js']
        }).then(() => {
          // 通知内容脚本翻译已开始
          chrome.tabs.sendMessage(tabId, { 
            action: 'translationStarted',
            settings: translationSettings
          });
        }).catch(error => {
          console.error('导航到新页面后重新启动翻译时出错:', error);
        });
      }, 1000);
    } else {
      // 普通页面刷新，仅注入内容脚本
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['js/content.js']
      }).then(() => {
        // 通知内容脚本翻译已开始
        chrome.tabs.sendMessage(tabId, { 
          action: 'translationStarted',
          settings: translationSettings
        });
      }).catch(error => {
        console.error('页面刷新后重新启动翻译时出错:', error);
      });
    }
  }
});

// 监听标签页导航完成事件
chrome.webNavigation.onCompleted.addListener((details) => {
  // 只处理主框架的导航
  if (details.frameId === 0 && activeAudioProcessing.isActive && details.tabId === activeAudioProcessing.tabId) {
    console.log('导航完成:', details.url);
    
    // 延迟一段时间，确保页面已经完全加载
    setTimeout(() => {
      // 仅注入内容脚本
      chrome.scripting.executeScript({
        target: { tabId: details.tabId },
        files: ['js/content.js']
      }).then(() => {
        // 通知内容脚本翻译已开始
        chrome.tabs.sendMessage(details.tabId, { 
          action: 'translationStarted',
          settings: translationSettings
        });
      }).catch(error => {
        console.error('导航完成后重新启动翻译时出错:', error);
      });
    }, 1500);
  }
});

// 监听来自弹出窗口的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getSettings') {
    // 同时返回设置和当前翻译状态
    sendResponse({ 
      settings: translationSettings,
      isTranslating: activeAudioProcessing.isActive
    });
  } else if (message.action === 'saveSettings') {
    translationSettings = message.settings;
    chrome.storage.local.set({ translationSettings });
    sendResponse({ success: true });
  } else if (message.action === 'startTranslation') {
    startAudioTranslation(sendResponse);
    return true; // 保持消息通道开放以进行异步响应
  } else if (message.action === 'stopTranslation') {
    stopAudioTranslation();
    sendResponse({ success: true });
  } else if (message.action === 'getTranslationStatus') {
    // 新增：获取当前翻译状态
    sendResponse({ isTranslating: activeAudioProcessing.isActive });
  }
});

// 开始音频翻译
async function startAudioTranslation(sendResponse) {
  try {
    // 停止任何现有的处理
    stopAudioTranslation();
    
    // 获取当前活动标签页
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      sendResponse({ success: false, error: '无法获取当前标签页' });
      return;
    }
    
    const tabId = tabs[0].id;
    activeAudioProcessing.tabId = tabId;
    activeAudioProcessing.isActive = true; // 设置翻译为活动状态
    
    // 保存翻译状态到存储
    chrome.storage.local.set({ translationActive: true });
    
    // 仅注入内容脚本，由内容脚本负责注入speech_processor_combined.js
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['js/content.js']
    });
    
    // 通知内容脚本翻译已开始
    chrome.tabs.sendMessage(tabId, { 
      action: 'translationStarted',
      settings: translationSettings
    });
    
    sendResponse({ success: true });
  } catch (error) {
    console.error('启动音频翻译时出错:', error);
    sendResponse({ success: false, error: error.message });
  }
}

// 停止音频翻译
function stopAudioTranslation() {
  if (activeAudioProcessing.tabId) {
    console.log('停止音频翻译，标签页ID:', activeAudioProcessing.tabId);
    
    // 通知内容脚本翻译已停止，并确保消息被接收
    try {
      // 首先尝试发送停止消息
      chrome.tabs.sendMessage(activeAudioProcessing.tabId, { 
        action: 'translationStopped',
        timestamp: Date.now() // 添加时间戳确保消息唯一性
      }, (response) => {
        // 检查响应
        if (chrome.runtime.lastError) {
          console.error('发送停止消息时出错:', chrome.runtime.lastError);
          
          // 如果发送消息失败，可能是因为内容脚本未加载，尝试重新注入脚本
          chrome.scripting.executeScript({
            target: { tabId: activeAudioProcessing.tabId },
            files: ['js/content.js']
          }).then(() => {
            // 再次尝试发送停止消息
            setTimeout(() => {
              chrome.tabs.sendMessage(activeAudioProcessing.tabId, { 
                action: 'translationStopped',
                timestamp: Date.now(),
                forceStop: true // 强制停止标志
              });
            }, 500);
          }).catch(err => {
            console.error('重新注入脚本失败:', err);
          });
        }
      });
    } catch (error) {
      console.error('停止音频翻译时出错:', error);
    }
    
    // 重置状态
    activeAudioProcessing.tabId = null;
    activeAudioProcessing.stream = null;
    activeAudioProcessing.isActive = false;
    
    // 保存翻译状态到存储
    chrome.storage.local.set({ translationActive: false });
  }
}

// 当扩展卸载或浏览器关闭时清理资源
chrome.runtime.onSuspend.addListener(() => {
  stopAudioTranslation();
});
