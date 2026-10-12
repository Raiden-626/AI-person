const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

/**
 * 声音克隆服务
 * 调用 OpenVoice Python 服务进行音色克隆
 */
class VoiceCloningService {
  constructor() {
    // OpenVoice 服务地址
    this.baseUrl = process.env.OPENVOICE_URL || 'http://localhost:8000';
    this.enabled = false;
    
    // 检查 OpenVoice 服务是否可用
    this.checkAvailability();
  }

  /**
   * 检查 OpenVoice 服务可用性
   */
  async checkAvailability() {
    try {
      const response = await axios.get(`${this.baseUrl}/api/v1/health`, {
        timeout: 3000
      });
      
      if (response.data.status === 'ok') {
        this.enabled = true;
        console.log('[VoiceCloning] OpenVoice 服务已连接');
      }
    } catch (error) {
      console.warn('[VoiceCloning] OpenVoice 服务不可用，将使用Mock模式');
      console.warn('[VoiceCloning] 要启用真实功能，请部署 OpenVoice 服务');
      this.enabled = false;
    }
  }

  /**
   * 克隆声音并合成语音
   * @param {string} referenceAudioPath - 参考音频文件路径
   * @param {string} text - 要合成的文本
   * @param {string} language - 语言代码（zh/en/ja/ko）
   * @returns {Promise<Buffer>} 克隆音色的语音音频Buffer
   */
  async cloneVoice(referenceAudioPath, text, language = 'zh') {
    try {
      if (!this.enabled) {
        console.log('[VoiceCloning] 使用Mock数据');
        return this.getMockAudio();
      }

      // 创建表单数据
      const form = new FormData();
      form.append('reference_audio', fs.createReadStream(referenceAudioPath));
      form.append('text', text);
      form.append('language', language);

      // 调用 OpenVoice 服务
      const response = await axios.post(
        `${this.baseUrl}/api/v1/clone_and_synthesize`,
        form,
        {
          headers: form.getHeaders(),
          responseType: 'arraybuffer',
          timeout: 60000
        }
      );

      return Buffer.from(response.data);
    } catch (error) {
      console.error('[VoiceCloning] 克隆失败:', error.message);
      
      // 失败时返回 Mock 音频
      console.log('[VoiceCloning] 使用Mock数据');
      return this.getMockAudio();
    }
  }

  /**
   * Mock 音频数据
   */
  getMockAudio() {
    // 返回一个空的 Buffer，实际使用时应该返回一个提示音
    return Buffer.alloc(0);
  }
}

module.exports = new VoiceCloningService();
