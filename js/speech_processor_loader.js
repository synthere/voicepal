// 语音处理器 - 加载器
(function() {
  // 加载顺序很重要，确保依赖关系正确
  const scripts = [
    'speech_processor_utils.js',    // 工具函数，被其他模块依赖
    'speech_processor_subtitle.js', // 字幕处理
    'speech_processor_tts.js',      // 语音合成
    'speech_processor_core.js',     // 核心功能
    'speech_processor.js'           // 主文件
  ];
  
  // 按顺序加载脚本
  function loadScripts(index) {
    if (index >= scripts.length) {
      console.log('[VoicePal] 所有模块加载完成');
      return;
    }
    
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('js/' + scripts[index]);
    script.onload = function() {
      console.log('[VoicePal] 已加载模块:', scripts[index]);
      loadScripts(index + 1);
    };
    script.onerror = function(error) {
      console.error('[VoicePal] 加载模块失败:', scripts[index], error);
      loadScripts(index + 1);
    };
    (document.head || document.documentElement).appendChild(script);
  }
  
  // 开始加载
  loadScripts(0);
})();
