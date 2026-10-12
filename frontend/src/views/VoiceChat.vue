<script setup>
import { ref, onUnmounted } from 'vue';
import { transcribeAudio, chatWithText } from '@/api/audio';

// 状态管理
const isRecording = ref(false);
const recognizedText = ref('');
const replyText = ref('');
const isLoading = ref(false);
const errorMessage = ref('');

// 录音相关
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;

/**
 * 开始录音
 */
async function startRecording() {
  try {
    errorMessage.value = '';
    
    // 请求麦克风权限
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // 创建MediaRecorder
    mediaRecorder = new MediaRecorder(audioStream, {
      mimeType: 'audio/webm;codecs=opus'
    });
    
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
      await handleAudioRecorded(audioBlob);
      
      // 停止所有音轨
      audioStream.getTracks().forEach(track => track.stop());
    };
    
    mediaRecorder.start();
    isRecording.value = true;
  } catch (error) {
    console.error('录音启动失败:', error);
    errorMessage.value = '无法访问麦克风，请检查权限设置';
  }
}

/**
 * 停止录音
 */
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
    isRecording.value = false;
  }
}

/**
 * 处理录音完成的音频
 */
async function handleAudioRecorded(audioBlob) {
  isLoading.value = true;
  errorMessage.value = '';
  
  try {
    // 1. 语音识别：音频转文字
    const text = await transcribeAudio(audioBlob);
    recognizedText.value = text;
    
    // 2. 智能对话：获取LLM回复
    const reply = await chatWithText(text);
    replyText.value = reply;
    
    // 3. 使用Web Speech API播放回复（前端TTS）
    speakText(reply);
  } catch (error) {
    console.error('对话处理失败:', error);
    errorMessage.value = '对话处理失败，请稍后重试';
  } finally {
    isLoading.value = false;
  }
}

/**
 * 使用Web Speech API合成语音
 */
function speakText(text) {
  if ('speechSynthesis' in window) {
    // 取消之前的语音
    window.speechSynthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    window.speechSynthesis.speak(utterance);
  } else {
    console.warn('浏览器不支持Web Speech API');
  }
}

/**
 * 清除错误信息
 */
function clearError() {
  errorMessage.value = '';
}

// 组件卸载时清理资源
onUnmounted(() => {
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
  }
  // 取消正在播放的语音
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
});
</script>

<template>
  <div class="voice-chat-container">
    <h1>AI数字人语音对话</h1>
    
    <!-- 录音控制区 -->
    <div class="record-section">
      <button 
        :class="['record-btn', isRecording ? 'recording' : '']"
        @click="isRecording ? stopRecording() : startRecording()"
        :disabled="isLoading"
      >
        <span class="icon">{{ isRecording ? '⏹' : '🎤' }}</span>
        <span>{{ isRecording ? '停止录音' : '开始录音' }}</span>
      </button>
      
      <div v-if="isRecording" class="recording-indicator">
        <span class="pulse"></span>
        <span>正在录音...</span>
      </div>
    </div>
    
    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-section">
      <div class="spinner"></div>
      <p>正在处理中...</p>
    </div>
    
    <!-- 错误提示 -->
    <div v-if="errorMessage" class="error-message" @click="clearError">
      {{ errorMessage }}
    </div>
    
    <!-- 对话历史 -->
    <div class="conversation-section" v-if="recognizedText || replyText">
      <div class="message user-message" v-if="recognizedText">
        <div class="avatar">👤</div>
        <div class="message-content">
          <p>{{ recognizedText }}</p>
        </div>
      </div>
      
      <div class="message ai-message" v-if="replyText">
        <div class="avatar">🤖</div>
        <div class="message-content">
          <p>{{ replyText }}</p>
          <div class="tts-hint">🔊 正在播放语音回复</div>
        </div>
      </div>
    </div>
    
    <!-- 使用说明 -->
    <div class="tips-section">
      <h3>使用说明</h3>
      <ul>
        <li>点击"开始录音"按钮，允许浏览器访问麦克风</li>
        <li>对着麦克风说话，说完后点击"停止录音"</li>
        <li>系统会自动识别语音、生成回复并播放</li>
        <li>当前ASR使用Mock数据，需部署FunASR才能使用真实语音识别</li>
        <li>TTS使用浏览器Web Speech API，无需后端服务</li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.voice-chat-container {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

h1 {
  text-align: center;
  color: #2d8a6e;
  margin-bottom: 30px;
}

.record-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  margin-bottom: 30px;
}

.record-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px 30px;
  font-size: 18px;
  border: none;
  border-radius: 50px;
  background: linear-gradient(135deg, #0f5132, #2d8a6e);
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  box-shadow: 0 4px 15px rgba(15, 81, 50, 0.3);
}

.record-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 6px 20px rgba(15, 81, 50, 0.4);
}

.record-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.record-btn.recording {
  background: linear-gradient(135deg, #dc3545, #ff6b6b);
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.icon {
  font-size: 24px;
}

.recording-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #dc3545;
  font-weight: 500;
}

.pulse {
  width: 12px;
  height: 12px;
  background: #dc3545;
  border-radius: 50%;
  animation: blink 1s infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.loading-section {
  text-align: center;
  padding: 30px;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #2d8a6e;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 15px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  background: #fff3cd;
  border: 1px solid #ffc107;
  color: #856404;
  padding: 12px 20px;
  border-radius: 8px;
  margin-bottom: 20px;
  cursor: pointer;
  text-align: center;
}

.conversation-section {
  margin-bottom: 30px;
}

.message {
  display: flex;
  gap: 15px;
  margin-bottom: 20px;
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

.user-message {
  flex-direction: row-reverse;
}

.ai-message {
  flex-direction: row;
}

.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.user-message .avatar {
  background: #e9ecef;
}

.ai-message .avatar {
  background: #d4edda;
}

.message-content {
  max-width: 70%;
  padding: 15px;
  border-radius: 12px;
  background: white;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.user-message .message-content {
  background: #d4edda;
}

.message-content p {
  margin: 0 0 10px 0;
  line-height: 1.6;
}

.tts-hint {
  font-size: 12px;
  color: #6c757d;
  margin-top: 8px;
}

.tips-section {
  background: #f8f9fa;
  padding: 20px;
  border-radius: 12px;
  border-left: 4px solid #2d8a6e;
}

.tips-section h3 {
  margin: 0 0 15px 0;
  color: #2d8a6e;
}

.tips-section ul {
  margin: 0;
  padding-left: 20px;
}

.tips-section li {
  margin-bottom: 8px;
  line-height: 1.6;
  color: #495057;
}
</style>
