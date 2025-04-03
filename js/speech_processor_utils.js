// 语音处理器 - 工具函数
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

// 导出模块
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SpeechUtils;
}
