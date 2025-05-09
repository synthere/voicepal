// 璇煶澶勭悊鍣?- 鍦ㄥ唴瀹硅剼鏈幆澧冧腑杩愯
(function() {
  // 瀛樺偍缈昏瘧璁剧疆
  let translationSettings = {
    enabled: true,
    sourceLanguage: 'auto',
    targetLanguage: 'zh-CN',
    captureInterval: 3000,
    minAudioSize: 100,
    subtitleToSpeech: true // 鏂板锛氭槸鍚﹀皢瀛楀箷杞负璇煶
  };

  // 瀛樺偍闊抽澶勭悊鐘舵€?
  let audioProcessing = {
    active: false,
    videoElements: [],
    subtitleObserver: null,
    lastSubtitleText: "",
    lastProcessTime: 0
  };

  // 璋冭瘯妯″紡
  const DEBUG = true;
  
  // 璋冭瘯鏃ュ織
  function log(...args) {
    if (DEBUG) {
      console.log('[VoicePal]', ...args);
    }
  }

  // 鐩戝惉鏉ヨ嚜background.js鐨勬秷鎭?
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'translationStarted') {
      if (message.settings) {
        translationSettings = message.settings;
      }
      log('鏀跺埌寮€濮嬬炕璇戞秷鎭?, translationSettings);
      startAudioProcessing();
      showTranslationOverlay("瑙嗛澹伴煶缈昏瘧宸插惎鍔紝姝ｅ湪鐩戝惉瑙嗛瀛楀箷...");
      sendResponse({ success: true });
    } else if (message.action === 'translationStopped') {
      log('鏀跺埌鍋滄缈昏瘧娑堟伅');
      stopAudioProcessing();
      sendResponse({ success: true });
    }
  });

  // 鏄剧ず缈昏瘧鏂囨湰瑕嗙洊灞?
  function showTranslationOverlay(text) {
    log('鏄剧ず缈昏瘧鏂囨湰瑕嗙洊灞?', text);
    
    let overlay = document.getElementById('vvt-translation-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'vvt-translation-overlay';
      overlay.style.position = 'fixed';
      overlay.style.bottom = '80px';
      overlay.style.left = '50%';
      overlay.style.transform = 'translateX(-50%)';
      overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      overlay.style.color = 'white';
      overlay.style.padding = '15px 25px';
      overlay.style.borderRadius = '8px';
      overlay.style.fontSize = '20px';
      overlay.style.fontWeight = 'bold';
      overlay.style.maxWidth = '80%';
      overlay.style.textAlign = 'center';
      overlay.style.zIndex = '9999';
      overlay.style.transition = 'opacity 0.5s';
      overlay.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.3)';
      overlay.style.pointerEvents = 'none';
      document.body.appendChild(overlay);
    }
    
    overlay.textContent = text;
    overlay.style.opacity = '1';
    
    // 閬垮厤閲嶅娣诲姞
    if (!overlay.parentNode) {
      document.body.appendChild(overlay);
    }
    
    // 鍑忓皯鏄剧ず鏃堕棿锛岄伩鍏嶉暱鏃堕棿閬尅
    setTimeout(() => {
      overlay.style.opacity = '0';
      setTimeout(() => {
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
      }, 500);
    }, 5000);
  }

  // 璇煶鍚堟垚闃熷垪鍜岀姸鎬?
  const speechQueue = [];
  let isSpeaking = false;
  let lastProcessedText = "";
  let processingTimer = null;
  let lastSubtitleTime = 0;
  let subtitleHistory = [];
  const MAX_HISTORY_SIZE = 10;
  let currentSpeechRate = 1.5; // 鎻愰珮榛樿璇€熷埌1.5
  let recentSubtitles = []; // 瀛樺偍鏈€杩戝鐞嗙殑瀛楀箷锛岀敤浜庢娴嬮噸澶?
  const MAX_RECENT_SUBTITLES = 5; // 鏈€澶氬瓨鍌?鏉℃渶杩戠殑瀛楀箷
  
  // 闃叉姈鍑芥暟锛岀敤浜庡噺灏戦噸澶嶈皟鐢?
  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }
  
  // 璁＄畻鑷€傚簲璇煶閫熺巼
  function calculateAdaptiveSpeechRate() {
    if (subtitleHistory.length < 2) {
      return 1.5; // 鎻愰珮榛樿璇€熷埌1.5
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
        rate = 1.6; // 鎻愰珮璇€?
      } else {
        rate = 1.4; // 鎻愰珮璇€?
      }
    } else if (avgInterval < 4000) {
      if (avgLength > 20) {
        rate = 1.4; // 鎻愰珮璇€?
      } else {
        rate = 1.3; // 鎻愰珮璇€?
      }
    } else {
      if (avgLength > 30) {
        rate = 1.3; // 鎻愰珮璇€?
      } else {
        rate = 1.2; // 鎻愰珮璇€?
      }
    }
    
    currentSpeechRate = currentSpeechRate * 0.7 + rate * 0.3;
    currentSpeechRate = Math.max(1.0, Math.min(2.0, currentSpeechRate)); // 鎻愰珮璇€熻寖鍥?
    
    return currentSpeechRate;
  }
  
  // 妫€鏌ユ枃鏈槸鍚︿笌鏈€杩戠殑瀛楀箷鐩镐技
  function isSimilarToRecentSubtitles(text) {
    for (const recentText of recentSubtitles) {
      // 瀹屽叏鐩稿悓
      if (text === recentText) {
        return true;
      }
      
      // 涓€涓枃鏈寘鍚彟涓€涓枃鏈?
      if (text.includes(recentText) || recentText.includes(text)) {
        // 濡傛灉闀垮害宸紓涓嶅ぇ锛岃涓烘槸鐩镐技鐨?
        const lengthDiff = Math.abs(text.length - recentText.length);
        if (lengthDiff < text.length * 0.3) { // 闀垮害宸紓灏忎簬30%
          return true;
        }
      }
      
      // 璁＄畻鐩镐技搴︼紙绠€鍗曞疄鐜帮級
      let commonChars = 0;
      for (let i = 0; i < text.length; i++) {
        if (recentText.includes(text[i])) {
          commonChars++;
        }
      }
      const similarity = commonChars / text.length;
      if (similarity > 0.7) { // 鐩镐技搴﹀ぇ浜?0%
        return true;
      }
    }
    return false;
  }
  
  // 澶勭悊璇煶鍚堟垚闃熷垪
  function processSpeechQueue() {
    if (processingTimer) {
      clearTimeout(processingTimer);
      processingTimer = null;
    }
    
    if (speechQueue.length === 0) {
      return;
    }
    
    const now = Date.now();
    if (isSpeaking && speechQueue.length > 0 && (now - lastSubtitleTime) > 2000) {
      log('妫€娴嬪埌鏂板瓧骞曪紝鍙栨秷褰撳墠鎾斁');
      if (currentAudio) {
        currentAudio.pause();
        currentAudio = null;
      }
      window.speechSynthesis.cancel();
      isSpeaking = false;
    }
    
    if (isSpeaking) {
      return;
    }
    
    const { text, isTranslated } = speechQueue.shift();
    
    // 澧炲己閲嶅妫€娴?
    if (text === lastProcessedText || isSimilarToRecentSubtitles(text)) {
      log(`璺宠繃閲嶅鎴栫浉浼兼枃鏈? "${text}"`);
      processingTimer = setTimeout(processSpeechQueue, 50);
      return;
    }
    
    // 娣诲姞鍒版渶杩戝鐞嗙殑瀛楀箷鍒楄〃
    recentSubtitles.push(text);
    if (recentSubtitles.length > MAX_RECENT_SUBTITLES) {
      recentSubtitles.shift(); // 绉婚櫎鏈€鏃х殑瀛楀箷
    }
    
    lastProcessedText = text;
    isSpeaking = true;
    
    try {
      // 鏍规嵁閫夋嫨鐨凾TS鏈嶅姟澶勭悊
      switch (translationSettings.ttsService) {
        case 'elevenlabs':
          // 浣跨敤ElevenLabs API
          if (translationSettings.elevenLabsApiKey && translationSettings.elevenLabsVoiceId) {
            playWithElevenLabs(text, isTranslated);
          } else {
            log('ElevenLabs API瀵嗛挜鎴栬闊矷D鏈缃紝鍥為€€鍒版祻瑙堝櫒鍐呯疆璇煶鍚堟垚');
            playWithBrowserTTS(text, isTranslated);
          }
          break;
          
        case 'customapi':
          // 浣跨敤鑷畾涔堿PI
          if (translationSettings.customApiUrl) {
            playWithCustomApi(text, isTranslated);
          } else {
            log('鑷畾涔堿PI鏈嶅姟鍣ㄥ湴鍧€鏈缃紝鍥為€€鍒版祻瑙堝櫒鍐呯疆璇煶鍚堟垚');
            playWithBrowserTTS(text, isTranslated);
          }
          break;
          
        case 'browser':
        default:
          // 浣跨敤娴忚鍣ㄥ唴缃闊冲悎鎴?
          playWithBrowserTTS(text, isTranslated);
          break;
      }
    } catch (error) {
      console.error('鎾斁璇煶澶辫触:', error);
      isSpeaking = false;
      processingTimer = setTimeout(processSpeechQueue, 100);
    }
  }
  
  // 浣跨敤娴忚鍣ㄥ唴缃闊冲悎鎴?
  function playWithBrowserTTS(text, isTranslated) {
    if (window.speechSynthesis) {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }
      
      const utterance = new SpeechSynthesisUtterance(text);
      
      utterance.lang = isTranslated ? translationSettings.targetLanguage : 
                      (translationSettings.sourceLanguage !== 'auto' ? translationSettings.sourceLanguage : 'zh-CN');
      
      utterance.volume = 1.0;
      utterance.rate = calculateAdaptiveSpeechRate();
      utterance.pitch = 1.0;
      
      const actionType = isTranslated ? '缈昏瘧' : '鍘熷';
      
      utterance.onstart = () => {
        log(`寮€濮嬫挱鏀?{actionType}璇煶: "${text}"`);
      };
      
      utterance.onend = () => {
        log(`${actionType}璇煶鎾斁缁撴潫: "${text}"`);
        isSpeaking = false;
        processSpeechQueue();
      };
      
      utterance.onerror = (e) => {
        console.error(`${actionType}璇煶鎾斁閿欒:`, e);
        isSpeaking = false;
        processingTimer = setTimeout(processSpeechQueue, 100);
      };
      
      window.speechSynthesis.speak(utterance);
      log(`${actionType}璇煶鍚堟垚璇锋眰宸插彂閫乣);
    } else {
      log('娴忚鍣ㄤ笉鏀寔璇煶鍚堟垚API');
      isSpeaking = false;
      processingTimer = setTimeout(processSpeechQueue, 100);
    }
  }
  
  // 瀛樺偍褰撳墠鎾斁鐨勯煶棰戝厓绱?
  let currentAudio = null;
  
  // 浣跨敤ElevenLabs API鎾斁璇煶
  async function playWithElevenLabs(text, isTranslated) {
    try {
      const actionType = isTranslated ? '缈昏瘧' : '鍘熷';
      log(`浣跨敤ElevenLabs鎾斁${actionType}璇煶: "${text}"`);
      
      // 鍑嗗璇锋眰鍙傛暟
      const voiceId = translationSettings.elevenLabsVoiceId;
      const apiKey = translationSettings.elevenLabsApiKey;
      
      // 璁剧疆璇煶鍙傛暟
      const voiceSettings = {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.0,
        use_speaker_boost: true
      };
      
      // 鍙戦€佽姹傚埌ElevenLabs API
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify({
          text: text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: voiceSettings
        })
      });
      
      if (!response.ok) {
        throw new Error(`ElevenLabs API璇锋眰澶辫触: ${response.status}`);
      }
      
      // 鑾峰彇闊抽鏁版嵁
      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      
      // 鍒涘缓闊抽鍏冪礌骞舵挱鏀?
      const audio = new Audio(audioUrl);
      currentAudio = audio;
      
      audio.onended = () => {
        log(`ElevenLabs ${actionType}璇煶鎾斁缁撴潫: "${text}"`);
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        isSpeaking = false;
        processSpeechQueue();
      };
      
      audio.onerror = (e) => {
        console.error(`ElevenLabs ${actionType}璇煶鎾斁閿欒:`, e);
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        isSpeaking = false;
        processingTimer = setTimeout(processSpeechQueue, 100);
      };
      
      audio.playbackRate = calculateAdaptiveSpeechRate();
      await audio.play();
      log(`ElevenLabs ${actionType}璇煶寮€濮嬫挱鏀綻);
      
    } catch (error) {
      console.error('ElevenLabs璇煶鍚堟垚澶辫触:', error);
      log(`ElevenLabs璇煶鍚堟垚澶辫触: ${error.message}锛屽皾璇曚娇鐢ㄦ祻瑙堝櫒鍐呯疆璇煶鍚堟垚`);
      
      // 濡傛灉ElevenLabs澶辫触锛屽洖閫€鍒版祻瑙堝櫒鍐呯疆璇煶鍚堟垚
      if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = isTranslated ? translationSettings.targetLanguage : 
                        (translationSettings.sourceLanguage !== 'auto' ? translationSettings.sourceLanguage : 'zh-CN');
        utterance.volume = 1.0;
        utterance.rate = calculateAdaptiveSpeechRate();
        utterance.pitch = 1.0;
        
        utterance.onend = () => {
          isSpeaking = false;
          processSpeechQueue();
        };
        
        utterance.onerror = () => {
          isSpeaking = false;
          processingTimer = setTimeout(processSpeechQueue, 100);
        };
        
        window.speechSynthesis.speak(utterance);
      } else {
        isSpeaking = false;
        processingTimer = setTimeout(processSpeechQueue, 100);
      }
    }
  }
  
  // 浣跨敤鑷畾涔堿PI杩涜璇煶鍚堟垚
  async function playWithCustomApi(text, isTranslated) {
    try {
      const actionType = isTranslated ? '缈昏瘧' : '鍘熷';
      log(`浣跨敤鑷畾涔堿PI鎾斁${actionType}璇煶: "${text}"`);
      
      // 鍑嗗璇锋眰鍙傛暟
      const apiUrl = translationSettings.customApiUrl;
      
      // 鏋勫缓璇锋眰浣?
      const requestBody = {
        text: text,
        emphasize: 0, // 榛樿涓嶅己璋?
        denoise: 0 // 榛樿涓嶉檷鍣?
      };
      
      // 濡傛灉鏈夊弬鑰冮煶棰戯紝娣诲姞鍒拌姹備綋
      if (translationSettings.customApiRefAudio) {
        requestBody.ref_audio = translationSettings.customApiRefAudio;
      }
      
      // 鍙戦€佽姹傚埌鑷畾涔堿PI
      const response = await fetch(`${apiUrl}/tts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });
      
      if (!response.ok) {
        throw new Error(`API璇锋眰澶辫触: ${response.status}`);
      }
      
      // 鐩存帴鑾峰彇闊抽Blob
      const audioBlob = await response.blob();
      
      // 鍒涘缓闊抽URL骞舵挱鏀?
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      currentAudio = audio;
      
      audio.onended = () => {
        log(`鑷畾涔堿PI ${actionType}璇煶鎾斁缁撴潫: "${text}"`);
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        isSpeaking = false;
        processSpeechQueue();
      };
      
      audio.onerror = (e) => {
        console.error(`鑷畾涔堿PI ${actionType}璇煶鎾斁閿欒:`, e);
        URL.revokeObjectURL(audioUrl);
        currentAudio = null;
        isSpeaking = false;
        processingTimer = setTimeout(processSpeechQueue, 100);
      };
      
      audio.playbackRate = calculateAdaptiveSpeechRate();
      await audio.play();
      log(`鑷畾涔堿PI ${actionType}璇煶寮€濮嬫挱鏀綻);
      
    } catch (error) {
      console.error('鑷畾涔堿PI璇煶鍚堟垚澶辫触:', error);
      log(`鑷畾涔堿PI璇煶鍚堟垚澶辫触: ${error.message}锛屽洖閫€鍒版祻瑙堝櫒鍐呯疆璇煶鍚堟垚`);
      
      // 濡傛灉鑷畾涔堿PI澶辫触锛屽洖閫€鍒版祻瑙堝櫒鍐呯疆璇煶鍚堟垚
      playWithBrowserTTS(text, isTranslated);
    }
  }
  
  // 浣跨敤闊抽鍏冪礌鎾斁鏂囨湰
  function playTextWithAudio(text, isTranslated = true) {
    if (isTranslated) {
      log(`鎾斁缈昏瘧鏂囨湰: "${text}"`);
    } else {
      log(`鎾斁鍘熷瀛楀箷鏂囨湰: "${text}"`);
    }
    
    // 涓嶅啀鏄剧ず瀛楀箷瑕嗙洊灞傦紝鍥犱负鍘熻棰戝凡缁忔樉绀哄瓧骞?
    // showTranslationOverlay(text);
    
    speechQueue.push({ text, isTranslated });
    processSpeechQueue();
  }
  
  // 鍏煎鍘熸湁鍑芥暟
  function playTranslatedTextWithAudio(text) {
    playTextWithAudio(text, true);
  }

  // 澶勭悊瀛楀箷鏂囨湰
  function processSubtitleText(text) {
    if (!text || text.trim().length === 0) return;
    
    const cleanText = text.trim();
    
    if (cleanText === audioProcessing.lastSubtitleText) {
      return;
    }
    
    if (cleanText.length < 2) {
      log(`瀛楀箷澶煭锛岃烦杩? "${cleanText}"`);
      return;
    }
    
    if (cleanText.includes('{') && cleanText.includes('}')) {
      log(`鐤戜技JSON鎴栬剼鏈唴瀹癸紝璺宠繃: "${cleanText.substring(0, 50)}..."`);
      return;
    }
    
    if (cleanText.includes('<') && cleanText.includes('>')) {
      log(`鐤戜技HTML鍐呭锛岃烦杩? "${cleanText.substring(0, 50)}..."`);
      return;
    }
    
    if (cleanText.length > 300) {
      log(`鏂囨湰杩囬暱锛屽彲鑳戒笉鏄瓧骞曪紝璺宠繃: "${cleanText.substring(0, 50)}..."`);
      return;
    }
    
    // 澧炲己杩囨护锛屾帓闄ouTube瀛楀箷璁剧疆鐣岄潰鐨勬枃鏈?
    if (cleanText.includes('>>') || 
        cleanText.includes('鏌ョ湅璁剧疆') || 
        cleanText.includes('鐐瑰嚮') ||
        cleanText.includes('杩愯鏃跺畬鎴愮瓟妗?) ||
        (cleanText.includes('鑻辫') && cleanText.includes('涓枃'))) {
      log(`鎺掗櫎闈炲瓧骞昒I鍏冪礌: "${cleanText}"`);
      return;
    }
    
    const now = Date.now();
    if (now - audioProcessing.lastProcessTime < 500) {
      log(`澶勭悊闂撮殧澶煭锛岃烦杩? "${cleanText}"`);
      return;
    }
    
    // 妫€鏌ユ槸鍚︿笌鏈€杩戠殑瀛楀箷鐩镐技
    if (isSimilarToRecentSubtitles(cleanText)) {
      log(`妫€娴嬪埌鐩镐技瀛楀箷锛岃烦杩? "${cleanText}"`);
      return;
    }
    
    // 娣诲姞鍒版渶杩戝瓧骞曞垪琛?
    recentSubtitles.push(cleanText);
    if (recentSubtitles.length > MAX_RECENT_SUBTITLES) {
      recentSubtitles.shift(); // 绉婚櫎鏈€鏃х殑瀛楀箷
    }
    
    log(`妫€娴嬪埌瀛楀箷: "${cleanText}"`);
    audioProcessing.lastSubtitleText = cleanText;
    audioProcessing.lastProcessTime = now;
    lastSubtitleTime = now;
    
    subtitleHistory.push({ text: cleanText, time: now });
    if (subtitleHistory.length > MAX_HISTORY_SIZE) {
      subtitleHistory.shift();
    }
    
    log('鎾斁鍘熷瀛楀箷');
    
    audioProcessing.videoElements.forEach(video => {
      if (!video.muted && video.volume > 0.4) {
        video._originalVolume = video.volume;
        video.volume = 0.4; // 灏嗗師瑙嗛闊抽噺璁剧疆涓?.4
        log(`宸查檷浣庤棰戦煶閲忚嚦0.4锛屽師闊抽噺涓?{video._originalVolume}`);
      }
    });
    
    // 涓嶅啀鏄剧ず瀛楀箷瑕嗙洊灞傦紝鍥犱负鍘熻棰戝凡缁忔樉绀哄瓧骞?
    // showTranslationOverlay(cleanText);
    
    if (speechQueue.length > 2) {
      log(`闃熷垪涓凡鏈?{speechQueue.length}涓」鐩紝娓呯┖闃熷垪浠ラ伩鍏嶅欢杩焋);
      speechQueue.length = 0;
    }
    
    playTextWithAudio(cleanText, false);
  }

  // 寮€濮嬮煶棰戝鐞?
  async function startAudioProcessing() {
    try {
      stopAudioProcessing();
      
      const isYouTube = window.location.hostname.includes('youtube.com');
      log(`褰撳墠缃戠珯: ${window.location.hostname}, 鏄惁YouTube: ${isYouTube}`);
      
      if (isYouTube && translationSettings.subtitleToSpeech) {
        showTranslationOverlay("YouTube瀛楀箷杞闊冲凡鍚姩锛屾鍦ㄧ洃鍚瓧骞?..");
        setTimeout(() => {
          showTranslationOverlay("璇风‘淇濊棰戝凡鎵撳紑瀛楀箷锛屼互渚挎垜浠兘澶熻浆鎹㈠瓧骞曚负璇煶");
        }, 3000);
      }
      
      const videoElements = document.querySelectorAll('video');
      if (videoElements.length === 0) {
        throw new Error('椤甸潰涓婃病鏈夋壘鍒拌棰戝厓绱?);
      }
      
      log(`鎵惧埌 ${videoElements.length} 涓棰戝厓绱燻);
      
      const validVideoElements = Array.from(videoElements).filter(video => {
        const isVisible = video.offsetWidth > 0 && video.offsetHeight > 0;
        const hasAudio = video.mozHasAudio !== undefined ? video.mozHasAudio : true;
        const isInIframe = window !== window.top;
        
        if (isYouTube) {
          const isMainPlayer = video.classList.contains('html5-main-video') || 
                              video.id === 'movie_player' || 
                              video.closest('#movie_player') !== null;
          return isVisible && hasAudio && isMainPlayer;
        }
        
        return isVisible && hasAudio && (!isInIframe || document.domain === document.domain.top);
      });
      
      log(`杩囨护鍚庢湁 ${validVideoElements.length} 涓湁鏁堣棰戝厓绱燻);
      
      if (validVideoElements.length === 0) {
        throw new Error('娌℃湁鎵惧埌鏈夋晥鐨勮棰戝厓绱?);
      }
      
      audioProcessing.videoElements = validVideoElements;
      audioProcessing.active = true;
      
      setupSubtitleObserver();
      
      try {
        document.dispatchEvent(new CustomEvent('vvt-translation-started'));
        log('宸插彂閫佺炕璇戝紑濮嬩簨浠?);
      } catch (e) {
        console.error('鍙戦€佷簨浠堕€氱煡鏃跺嚭閿?', e);
      }
      
      if (isYouTube && translationSettings.subtitleToSpeech) {
        try {
          const subtitleButton = document.querySelector('.ytp-subtitles-button');
          if (subtitleButton) {
            const isSubtitleOn = subtitleButton.getAttribute('aria-pressed') === 'true';
            if (!isSubtitleOn) {
              log('灏濊瘯鑷姩鎵撳紑瀛楀箷');
              subtitleButton.click();
              showTranslationOverlay("宸茶嚜鍔ㄥ皾璇曟墦寮€瀛楀箷");
            } else {
              log('瀛楀箷宸茬粡寮€鍚?);
            }
          }
        } catch (e) {
          log('鑷姩鎵撳紑瀛楀箷澶辫触:', e);
        }
      } else if (!isYouTube) {
        showTranslationOverlay("瑙嗛澹伴煶缈昏瘧宸插惎鍔紝姝ｅ湪鐩戝惉瑙嗛瀛楀箷...");
      }
      
      setupVideoTimeUpdateListeners();
      
    } catch (error) {
      console.error('鍚姩闊抽澶勭悊鏃跺嚭閿?', error);
      showTranslationOverlay(`鍚姩闊抽澶勭悊鏃跺嚭閿? ${error.message}`);
      
      try {
        chrome.runtime.sendMessage({ 
          action: 'processingError', 
          error: error.message 
        });
      } catch (e) {
        console.error('鍙戦€侀敊璇秷鎭椂鍑洪敊:', e);
      }
    }
  }

  // 璁剧疆瀛楀箷鐩戝惉鍣?
  function setupSubtitleObserver() {
    log('璁剧疆瀛楀箷鐩戝惉鍣?);
    
    if (audioProcessing.subtitleObserver) {
      audioProcessing.subtitleObserver.disconnect();
    }
    
    const observer = new MutationObserver(debounce((mutations) => {
      if (!audioProcessing.active) return;
      
      const subtitleTexts = new Set();
      
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const text = getSubtitleTextFromElement(node);
            if (text) subtitleTexts.add(text);
          }
        }
        
        if (mutation.type === 'characterData' || mutation.type === 'childList') {
          const text = getSubtitleTextFromElement(mutation.target);
          if (text) subtitleTexts.add(text);
        }
      }
      
      if (subtitleTexts.size > 0) {
        const combinedText = Array.from(subtitleTexts).join(' ');
        processSubtitleText(combinedText);
      }
    }, 300));
    
    const observerConfig = {
      childList: true,
      subtree: true,
      characterData: true,
      characterDataOldValue: true
    };
    
    observer.observe(document.body, observerConfig);
    audioProcessing.subtitleObserver = observer;
    
    log('瀛楀箷鐩戝惉鍣ㄥ凡璁剧疆');
    checkExistingSubtitles();
  }
  
  // 浠庡厓绱犱腑鑾峰彇瀛楀箷鏂囨湰
  function getSubtitleTextFromElement(element) {
    if (!element) return null;
    
    let subtitleText = '';
    
    if (element.nodeType === Node.TEXT_NODE) {
      const parent = element.parentElement;
      if (parent && parent.classList && (
          parent.classList.contains('ytp-caption-segment') || 
          parent.classList.contains('captions-text'))) {
        subtitleText = element.textContent;
      }
    } else {
      if (element.classList && (
          element.classList.contains('ytp-caption-segment') || 
          element.classList.contains('captions-text'))) {
        subtitleText = element.textContent;
      }
    }
    
    // 杩囨护鎺変笉鏄瓧骞曠殑鍐呭
    if (subtitleText) {
      // 鎺掗櫎YouTube瀛楀箷璁剧疆鐣岄潰鐨勬枃鏈?
      if (subtitleText.includes('>>') || 
          subtitleText.includes('鏌ョ湅璁剧疆') || 
          subtitleText.includes('鐐瑰嚮') ||
          subtitleText.includes('杩愯鏃跺畬鎴愮瓟妗?) ||
          subtitleText.includes('鑻辫') && subtitleText.includes('涓枃')) {
        log(`鎺掗櫎闈炲瓧骞昒I鍏冪礌: "${subtitleText}"`);
        return null;
      }
    }
    
    return subtitleText && subtitleText.trim().length > 0 ? subtitleText.trim() : null;
  }
  
  // 妫€鏌ョ幇鏈夊瓧骞?
  function checkExistingSubtitles() {
    const currentSubtitles = new Set();
    
    const youtubeSubtitles = document.querySelectorAll('.ytp-caption-segment');
    if (youtubeSubtitles.length > 0) {
      youtubeSubtitles.forEach
      youtubeSubtitles.forEach(subtitle => {
// 妫€鏌ョ幇鏈夊瓧骞?
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
  
  // 璁剧疆瑙嗛鏃堕棿鏇存柊鐩戝惉鍣?
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
          log('妫€娴嬪埌textTracks鍙樺寲浜嬩欢');
          debouncedCheckSubtitles();
        });
      }
      
      log(`宸蹭负瑙嗛 ${index} 璁剧疆鐩戝惉鍣╜);
    });
    
    setInterval(() => {
      if (audioProcessing.active) {
        debouncedCheckSubtitles();
      }
    }, 2000);
  }
  
  // 鍋滄闊抽澶勭悊
  function stopAudioProcessing() {
    if (!audioProcessing.active) return;
    
    log('鍋滄闊抽澶勭悊');
    
    if (audioProcessing.subtitleObserver) {
      audioProcessing.subtitleObserver.disconnect();
      audioProcessing.subtitleObserver = null;
      log('瀛楀箷瑙傚療鍣ㄥ凡鍋滄');
    }
    
    if (processingTimer) {
      clearTimeout(processingTimer);
      processingTimer = null;
    }
    
    speechQueue.length = 0;
    subtitleHistory.length = 0;
    recentSubtitles.length = 0;
    isSpeaking = false;
    currentSpeechRate = 1.5; // 閲嶇疆涓烘洿楂樼殑榛樿璇€?.5
    
    // 鍋滄褰撳墠鎾斁鐨勯煶棰?
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
      log('闊抽宸插仠姝?);
    }
    
    // 鍋滄娴忚鍣ㄥ唴缃闊冲悎鎴?
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
      log('娴忚鍣ㄨ闊冲悎鎴愬凡鍋滄');
    }
    
    audioProcessing.videoElements.forEach(video => {
      if (video._originalVolume !== undefined) {
        if (video.muted) {
          video.muted = false;
        }
        video.volume = video._originalVolume;
        log(`宸叉仮澶嶈棰戦煶閲? ${video._originalVolume}`);
        delete video._originalVolume;
      }
    });
    
    const overlay = document.getElementById('vvt-translation-overlay');
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
      log('缈昏瘧瑕嗙洊灞傚凡绉婚櫎');
    }
    
    audioProcessing = {
      active: false,
      videoElements: [],
      subtitleObserver: null,
      lastSubtitleText: "",
      lastProcessTime: 0
    };
    
    log('闊抽澶勭悊宸插仠姝?);
    
    try {
      document.dispatchEvent(new CustomEvent('vvt-translation-stopped'));
      log('宸插彂閫佺炕璇戝仠姝簨浠?);
    } catch (e) {
      console.error('鍙戦€佷簨浠堕€氱煡鏃跺嚭閿?', e);
    }
  }
})();
