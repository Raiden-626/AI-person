import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
});

/**
 * 语音识别：将音频文件转换为文字
 * @param {Blob} audioBlob - 音频Blob对象
 * @returns {Promise<string>} 识别出的文本
 */
export async function transcribeAudio(audioBlob) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.wav');

  const response = await apiClient.post('/audio/transcribe', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });

  return response.data.text;
}

/**
 * 智能对话：发送文本，获取LLM回复
 * @param {string} text - 用户输入的文本
 * @returns {Promise<string>} LLM生成的文本回复
 */
export async function chatWithText(text) {
  const response = await apiClient.post('/audio/chat', { text });
  return response.data.reply;
}

/**
 * 声音克隆：上传参考音频和文本，生成克隆语音
 * @param {Blob} referenceAudio - 参考音频Blob对象
 * @param {string} text - 要合成的文本
 * @returns {Promise<Blob>} 克隆语音的音频Blob
 */
export async function cloneVoice(referenceAudio, text) {
  const formData = new FormData();
  formData.append('reference_audio', referenceAudio, 'reference.wav');
  formData.append('text', text);
  formData.append('language', 'zh');

  const response = await apiClient.post('/audio/clone-voice', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    },
    responseType: 'blob'
  });

  return response.data;
}
