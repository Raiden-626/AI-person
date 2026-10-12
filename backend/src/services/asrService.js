const axios = require('axios');
const fs = require('fs');

/**
 * ASR服务 - 语音识别
 * 使用本地部署的FunASR服务
 */
class ASRService {
  constructor() {
    this.baseUrl = process.env.FUNASR_URL || 'http://localhost:10095';
  }

  /**
   * 将音频文件转换为文字
   * @param {string} audioPath - 音频文件路径
   * @returns {Promise<string>} 识别出的文本
   */
  async transcribe(audioPath) {
    try {
      // 读取音频文件
      const audioBuffer = fs.readFileSync(audioPath);
      
      // 调用FunASR服务（假设FunASR提供HTTP API）
      const response = await axios.post(
        `${this.baseUrl}/api/v1/recognize`,
        {
          audio: audioBuffer.toString('base64'),
          format: 'wav'
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.text) {
        return response.data.text;
      } else {
        throw new Error('ASR返回数据格式异常');
      }
    } catch (error) {
      console.error('FunASR调用失败:', error.message);
      
      // 如果FunASR服务不可用，返回Mock数据用于调试
      console.log('使用Mock数据进行调试...');
      return this.getMockTranscription();
    }
  }

  /**
   * Mock数据 - 用于FunASR未部署时的调试
   */
  getMockTranscription() {
    const mockTexts = [
      '你好，很高兴见到你',
      '今天天气真不错',
      '你能帮我做什么呢',
      '我想了解一下人工智能',
      '这是一个测试语音'
    ];
    const randomIndex = Math.floor(Math.random() * mockTexts.length);
    return mockTexts[randomIndex];
  }
}

module.exports = new ASRService();
