# ![icon48](https://github.com/user-attachments/assets/c7531203-bb93-43d9-ad4d-464516a4a234) VoicePal Chrome扩展


这是一个Chrome扩展，可以将YouTube视频字幕转换为语音播放。
[![IMAGE ALT TEXT HERE](https://img.youtube.com/vi/1Fdkw-6l6sg/0.jpg)](https://www.youtube.com/watch?v=1Fdkw-6l6sg)
## 功能特点

- **将YouTube视频字幕转换为语音播放**
- 支持多种语音合成服务：
  - 浏览器内置语音合成
  - ElevenLabs高质量语音
  - 自定义API服务
- 支持多种语言
- 用户友好的界面，易于配置和使用
- 自动检测和处理YouTube字幕

## 技术实现

此扩展使用以下技术和API：

- Chrome扩展API (manifest v3)
- Web Speech API 用于语音合成
- ElevenLabs API 用于高质量语音合成
- 自定义API集成支持
- MutationObserver 用于监测字幕变化

## 安装说明

### 开发模式安装

1. 下载或克隆此仓库到本地
2. 打开Chrome浏览器，进入扩展管理页面 (`chrome://extensions/`)
3. 启用"开发者模式"（右上角开关）
4. 点击"加载已解压的扩展"按钮
5. 选择此项目的文件夹

## 使用方法

1. 安装扩展后，点击Chrome工具栏中的扩展图标
2. 在弹出窗口中配置翻译设置：
   - 启用/禁用翻译功能
   - 选择源语言和目标语言
   - 启用/禁用字幕转语音功能
3. 点击"开始翻译"按钮
4. 访问包含视频的网页：
   - 对于普通视频，声音将被翻译
   - 对于YouTube视频，字幕将被转换为语音播放
   
### YouTube字幕转语音功能

1. 确保YouTube视频已开启字幕（可以是自动生成的字幕或上传的字幕）
2. 选择合适的语音合成服务：
   - 浏览器内置语音：无需额外设置
   - ElevenLabs语音：需要API密钥和选择语音模型
   - 自定义API：需要设置API服务器地址
3. 点击"开始字幕转语音"按钮
4. 扩展将自动检测字幕并通过选择的语音合成服务播放出来

## 技术实现细节

此扩展支持多种语音合成服务：

1. **浏览器内置语音合成**
   - 使用Web Speech API的SpeechSynthesis接口
   - 无需API密钥，完全免费
   - 支持多种语言和声音

2. **ElevenLabs高质量语音合成**
   - 使用ElevenLabs API进行高质量语音合成
   - 需要API密钥（可在ElevenLabs网站获取）
   - 支持多种自然语音模型

3. **自定义API服务**
   - 支持连接到自定义TTS API服务
   - 可选上传参考音频文件
   - 灵活的集成选项

## 注意事项

- 此扩展需要访问网页内容和音频权限
- 翻译质量取决于所使用的第三方API
- 实时翻译可能会有一定的延迟
- 某些网站可能会限制音频捕获功能

## 隐私声明

此扩展会：
- 读取YouTube视频字幕
- 使用浏览器内置API处理字幕文本
- 将文本数据发送到选定的语音合成服务
- 存储您的设置（仅在本地）

此扩展不会：
- 收集或存储您的个人信息
- 将数据用于字幕转语音以外的任何目的

## 许可证

[MIT License](LICENSE)

## 贡献

欢迎提交问题报告和改进建议！
