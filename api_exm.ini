/**
 * MaskGCT TTS API JavaScript客户端示例
 * 此脚本演示如何使用JavaScript调用MaskGCT TTS API
 */

// 使用原生fetch API的示例
async function ttsWithFetch(serverUrl, promptAudioFile, targetText, targetLen = -1, nTimesteps = 25) {
    try {
        // 步骤1：准备FormData对象
        const formData = new FormData();
        formData.append('prompt_wav', promptAudioFile); // 这里的promptAudioFile应该是一个File或Blob对象
        formData.append('target_text', targetText);
        formData.append('target_len', targetLen);
        formData.append('n_timesteps', nTimesteps);

        console.log(`步骤1：发送文本 '${targetText}' 到API进行处理...`);

        // 步骤2：发送POST请求
        const response = await fetch(`${serverUrl}/tts`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(`HTTP错误: ${response.status}`);
        }

        const result = await response.json();

        if (!result.success) {
            throw new Error(`API错误: ${result.message || '未知错误'}`);
        }

        const taskId = result.task_id;
        console.log(`任务ID: ${taskId}`);
        console.log(`状态: ${result.message}`);

        // 步骤3：轮询检查任务状态并获取结果
        console.log('步骤3：等待处理完成并下载结果...');

        const resultUrl = `${serverUrl}/tts/result/${taskId}`;
        const maxRetries = 60; // 最多等待60次
        const retryInterval = 1000; // 每次等待1秒

        for (let i = 0; i < maxRetries; i++) {
            // 等待一段时间
            await new Promise(resolve => setTimeout(resolve, retryInterval));

            // 检查任务状态
            const statusResponse = await fetch(resultUrl);

            // 如果状态码是202，表示任务尚未完成
            if (statusResponse.status === 202) {
                console.log(`处理中... (${i+1}/${maxRetries})`);
                continue;
            }

            // 如果状态码是200，表示任务已完成
            if (statusResponse.status === 200) {
                // 获取音频数据
                const audioBlob = await statusResponse.blob();
                console.log('成功！音频已下载');
                
                // 返回音频Blob对象
                return {
                    success: true,
                    audioBlob: audioBlob
                };
            }

            // 其他状态码表示错误
            try {
                const error = await statusResponse.json();
                throw new Error(error.message || '未知错误');
            } catch (e) {
                throw new Error(`HTTP状态码 ${statusResponse.status}`);
            }
        }

        throw new Error('处理超时');
    } catch (error) {
        console.error(`错误: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

// 使用axios库的示例（需要先引入axios）
async function ttsWithAxios(serverUrl, promptAudioFile, targetText, targetLen = -1, nTimesteps = 25) {
    try {
        // 步骤1：准备FormData对象
        const formData = new FormData();
        formData.append('prompt_wav', promptAudioFile); // 这里的promptAudioFile应该是一个File或Blob对象
        formData.append('target_text', targetText);
        formData.append('target_len', targetLen);
        formData.append('n_timesteps', nTimesteps);

        console.log(`步骤1：发送文本 '${targetText}' 到API进行处理...`);

        // 步骤2：发送POST请求
        const response = await axios.post(`${serverUrl}/tts`, formData, {
            headers: {
                'Content-Type': 'multipart/form-data'
            }
        });

        const result = response.data;

        if (!result.success) {
            throw new Error(`API错误: ${result.message || '未知错误'}`);
        }

        const taskId = result.task_id;
        console.log(`任务ID: ${taskId}`);
        console.log(`状态: ${result.message}`);

        // 步骤3：轮询检查任务状态并获取结果
        console.log('步骤3：等待处理完成并下载结果...');

        const resultUrl = `${serverUrl}/tts/result/${taskId}`;
        const maxRetries = 60; // 最多等待60次
        const retryInterval = 1000; // 每次等待1秒

        for (let i = 0; i < maxRetries; i++) {
            // 等待一段时间
            await new Promise(resolve => setTimeout(resolve, retryInterval));

            try {
                // 检查任务状态
                const statusResponse = await axios.get(resultUrl, {
                    responseType: 'blob'
                });

                // 如果成功获取到响应，表示任务已完成
                const audioBlob = new Blob([statusResponse.data], { type: 'audio/wav' });
                console.log('成功！音频已下载');
                
                // 返回音频Blob对象
                return {
                    success: true,
                    audioBlob: audioBlob
                };
            } catch (error) {
                // 如果状态码是202，表示任务尚未完成
                if (error.response && error.response.status === 202) {
                    console.log(`处理中... (${i+1}/${maxRetries})`);
                    continue;
                }

                // 其他错误
                if (error.response && error.response.data) {
                    try {
                        const errorData = JSON.parse(await error.response.data.text());
                        throw new Error(errorData.message || '未知错误');
                    } catch (e) {
                        throw new Error(`HTTP状态码 ${error.response.status}`);
                    }
                } else {
                    throw error;
                }
            }
        }

        throw new Error('处理超时');
    } catch (error) {
        console.error(`错误: ${error.message}`);
        return {
            success: false,
            error: error.message
        };
    }
}

// 在浏览器中使用的示例
function browserExample() {
    // 获取DOM元素
    const fileInput = document.getElementById('promptAudio');
    const textInput = document.getElementById('targetText');
    const submitButton = document.getElementById('submitButton');
    const resultAudio = document.getElementById('resultAudio');
    const statusDiv = document.getElementById('status');

    // 添加提交事件监听器
    submitButton.addEventListener('click', async () => {
        // 检查是否选择了文件
        if (!fileInput.files || fileInput.files.length === 0) {
            statusDiv.textContent = '请选择提示音频文件';
            return;
        }

        // 检查是否输入了文本
        if (!textInput.value) {
            statusDiv.textContent = '请输入目标文本';
            return;
        }

        // 禁用提交按钮
        submitButton.disabled = true;
        statusDiv.textContent = '处理中...';

        try {
            // 调用API
            const result = await ttsWithFetch(
                'http://localhost:5000',
                fileInput.files[0],
                textInput.value
            );

            if (result.success) {
                // 创建音频URL并设置到audio元素
                const audioUrl = URL.createObjectURL(result.audioBlob);
                resultAudio.src = audioUrl;
                resultAudio.style.display = 'block';
                statusDiv.textContent = '处理完成！';
            } else {
                statusDiv.textContent = `错误: ${result.error}`;
            }
        } catch (error) {
            statusDiv.textContent = `错误: ${error.message}`;
        } finally {
            // 启用提交按钮
            submitButton.disabled = false;
        }
    });
}

// 在Node.js中使用的示例（需要安装axios和form-data）
async function nodeExample() {
    const fs = require('fs');
    const axios = require('axios');
    const FormData = require('form-data');
    const path = require('path');

    // 配置参数
    const serverUrl = 'http://localhost:5000';
    const promptAudioPath = './prompt.wav'; // 提示音频文件路径
    const targetText = '你好，这是一个测试'; // 目标文本
    const outputPath = './output.wav'; // 输出音频文件路径

    try {
        // 创建FormData对象
        const formData = new FormData();
        formData.append('prompt_wav', fs.createReadStream(promptAudioPath));
        formData.append('target_text', targetText);
        formData.append('target_len', -1);
        formData.append('n_timesteps', 25);

        console.log(`步骤1：发送文本 '${targetText}' 到API进行处理...`);

        // 发送POST请求
        const response = await axios.post(`${serverUrl}/tts`, formData, {
            headers: formData.getHeaders()
        });

        const result = response.data;

        if (!result.success) {
            throw new Error(`API错误: ${result.message || '未知错误'}`);
        }

        const taskId = result.task_id;
        console.log(`任务ID: ${taskId}`);
        console.log(`状态: ${result.message}`);

        // 轮询检查任务状态并获取结果
        console.log('步骤2：等待处理完成并下载结果...');

        const resultUrl = `${serverUrl}/tts/result/${taskId}`;
        const maxRetries = 60; // 最多等待60次
        const retryInterval = 1000; // 每次等待1秒

        for (let i = 0; i < maxRetries; i++) {
            // 等待一段时间
            await new Promise(resolve => setTimeout(resolve, retryInterval));

            try {
                // 检查任务状态
                const statusResponse = await axios.get(resultUrl, {
                    responseType: 'arraybuffer'
                });

                // 如果成功获取到响应，表示任务已完成
                fs.writeFileSync(outputPath, Buffer.from(statusResponse.data));
                console.log(`成功！音频已保存到 ${outputPath}`);
                return;
            } catch (error) {
                // 如果状态码是202，表示任务尚未完成
                if (error.response && error.response.status === 202) {
                    console.log(`处理中... (${i+1}/${maxRetries})`);
                    continue;
                }

                // 其他错误
                if (error.response && error.response.data) {
                    try {
                        const errorData = JSON.parse(error.response.data.toString());
                        throw new Error(errorData.message || '未知错误');
                    } catch (e) {
                        throw new Error(`HTTP状态码 ${error.response.status}`);
                    }
                } else {
                    throw error;
                }
            }
        }

        throw new Error('处理超时');
    } catch (error) {
        console.error(`错误: ${error.message}`);
    }
}

// 如果在Node.js环境中运行
if (typeof window === 'undefined') {
    nodeExample();
}

// 导出函数以便在其他模块中使用
if (typeof module !== 'undefined') {
    module.exports = {
        ttsWithFetch,
        ttsWithAxios
    };
}
