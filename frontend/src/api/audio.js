import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 60000, // 增加到60秒，因为克隆需要时间
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
 * 智能对话：发送文本，获取LLM回复（支持声音克隆）
 * @param {string} text - 用户输入的文本
 * @param {string} profileId - 声音档案ID（可选）
 * @returns {Promise<Object>} { reply: string, audioBlob?: Blob, audioFile?: string }
 */
export async function chatWithText(text, profileId = null) {
  const response = await apiClient.post('/audio/chat', { 
    text, 
    profileId 
  }, {
    responseType: profileId ? 'blob' : 'json'
  });

  if (profileId) {
    // 返回音频
    const replyText = decodeURIComponent(response.headers['x-reply-text'] || '');
    const audioFile = response.headers['x-audio-file'] || '';
    return {
      reply: replyText,
      audioBlob: response.data,
      audioFile: audioFile
    };
  } else {
    // 返回文字
    return {
      reply: response.data.reply,
      audioBlob: null,
      audioFile: null
    };
  }
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

/**
 * 创建声音档案
 * @param {Blob} audioBlob - 参考音频
 * @param {string} name - 档案名称
 * @returns {Promise<Object>} 档案信息
 */
export async function createVoiceProfile(audioBlob, name) {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'reference.wav');
  formData.append('name', name);

  const response = await apiClient.post('/audio/voice-profiles', formData, {
    headers: {
      'Content-Type': 'multipart/form-data'
    }
  });

  return response.data.profile;
}

/**
 * 获取所有声音档案
 * @returns {Promise<Array>} 档案列表
 */
export async function getVoiceProfiles() {
  const response = await apiClient.get('/audio/voice-profiles');
  return response.data.profiles;
}

/**
 * 删除声音档案
 * @param {string} id - 档案ID
 * @returns {Promise<boolean>} 是否删除成功
 */
export async function deleteVoiceProfile(id) {
  const response = await apiClient.delete(`/audio/voice-profiles/${id}`);
  return response.data.success;
}
