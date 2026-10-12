<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { transcribeAudio, chatWithText, cloneVoice } from '@/api/audio';

// 状态管理
const isRecording = ref(false);
const recognizedText = ref('');
const replyText = ref('');
const isLoading = ref(false);
const errorMessage = ref('');
const isSpeaking = ref(false);

// 录音相关
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;

// 波形可视化相关
let audioContext = null;
let analyser = null;
let dataArray = null;
let animationId = null;
const canvasRef = ref(null);

// 声音克隆相关
const showCloneSection = ref(false);
const referenceAudioFile = ref(null);
const cloneTextInput = ref('');
const isCloning = ref(false);
const clonedAudioUrl = ref(null);
const clonedAudioPlayer = ref(null);

/**
 * 初始化音频上下文
 */
function initAudioContext() {
  if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  }
}

/**
 * 开始波形可视化
 */
function startVisualization(stream) {
  initAudioContext();
  
  const source = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  
  source.connect(analyser);
  
  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
  
  drawWaveform();
}

/**
 * 绘制波形
 */
function drawWaveform() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  
  animationId = requestAnimationFrame(drawWaveform);
  
  analyser.getByteFrequencyData(dataArray);
  
  ctx.fillStyle = '#f5f7fa';
  ctx.fillRect(0, 0, width, height);
  
  const barWidth = (width / dataArray.length) * 2.5;
  let x = 0;
  
  for (let i = 0; i < dataArray.length; i++) {
    const barHeight = (dataArray[i] / 255) * height;
    
    // 渐变色
    const gradient = ctx.createLinearGradient(0, height - barHeight, 0, height);
    gradient.addColorStop(0, '#2d8a6e');
    gradient.addColorStop(1, '#0f5132');
    
    ctx.fillStyle = gradient;
    ctx.fillRect(x, height - barHeight, barWidth, barHeight);
    
    x += barWidth + 1;
  }
}

/**
 * 停止波形可视化
 */
function stopVisualization() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  
  // 清空画布
  const canvas = canvasRef.value;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

/**
 * 开始录音
 */
async function startRecording() {
  try {
    errorMessage.value = '';
    
    // 请求麦克风权限
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // 启动波形可视化
    startVisualization(audioStream);
    
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
      stopVisualization();
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
 * 清理文本中的表情符号和特殊字符，避免TTS读出
 */
function cleanTextForTTS(text) {
  // 移除常见表情符号（Unicode范围）
  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '')  // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')  // Misc Symbols and Pictographs
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '')  // Transport and Map
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, '')  // Regional Indicator Symbols
    .replace(/[\u{2600}-\u{26FF}]/gu, '')    // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '')    // Dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')    // Variation Selectors
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, '')  // Supplemental Symbols
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')  // Chess Symbols
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')  // Symbols and Pictographs Extended-A
    .replace(/[^\w\s\u4e00-\u9fff，。！？、；：""''（）【】《》…—～·]/g, '') // 保留中文标点
    .trim();
}

/**
 * 使用Web Speech API合成语音
 */
function speakText(text) {
  if ('speechSynthesis' in window) {
    // 取消之前的语音
    window.speechSynthesis.cancel();
    
    // 清理文本中的表情符号
    const cleanText = cleanTextForTTS(text);
    
    if (!cleanText) {
      console.warn('清理后的文本为空，跳过语音合成');
      return;
    }
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    utterance.onstart = () => {
      isSpeaking.value = true;
    };
    
    utterance.onend = () => {
      isSpeaking.value = false;
    };
    
    utterance.onerror = (event) => {
      console.error('语音合成错误:', event);
      isSpeaking.value = false;
    };
    
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

/**
 * 切换声音克隆面板显示
 */
function toggleCloneSection() {
  showCloneSection.value = !showCloneSection.value;
  // 关闭时清理资源
  if (!showCloneSection.value && clonedAudioUrl.value) {
    URL.revokeObjectURL(clonedAudioUrl.value);
    clonedAudioUrl.value = null;
  }
}

/**
 * 处理参考音频文件选择
 */
function handleReferenceFileChange(event) {
  const file = event.target.files[0];
  if (file) {
    referenceAudioFile.value = file;
    errorMessage.value = '';
  }
}

/**
 * 执行声音克隆
 */
async function executeVoiceClone() {
  if (!referenceAudioFile.value) {
    errorMessage.value = '请先上传参考音频文件';
    return;
  }
  
  if (!cloneTextInput.value.trim()) {
    errorMessage.value = '请输入要合成的文本';
    return;
  }
  
  isCloning.value = true;
  errorMessage.value = '';
  clonedAudioUrl.value = null;
  
  try {
    const audioBlob = await cloneVoice(referenceAudioFile.value, cloneTextInput.value);
    clonedAudioUrl.value = URL.createObjectURL(audioBlob);
    
    // 自动播放克隆语音
    if (clonedAudioPlayer.value) {
      clonedAudioPlayer.value.play();
    }
  } catch (error) {
    console.error('声音克隆失败:', error);
    errorMessage.value = '声音克隆失败，请确保后端OpenVoice服务已启动';
  } finally {
    isCloning.value = false;
  }
}

/**
 * 播放克隆语音
 */
function playClonedAudio() {
  if (clonedAudioPlayer.value && clonedAudioUrl.value) {
    clonedAudioPlayer.value.play();
  }
}

// 组件挂载时初始化 canvas 尺寸
onMounted(() => {
  nextTick(() => {
    const canvas = canvasRef.value;
    if (canvas) {
      // 设置 canvas 实际渲染尺寸
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2; // 提高分辨率
      canvas.height = rect.height * 2;
    }
  });
});

// 组件卸载时清理资源
onUnmounted(() => {
  if (audioStream) {
    audioStream.getTracks().forEach(track => track.stop());
  }
  
  stopVisualization();
  
  if (audioContext) {
    audioContext.close();
  }
  
  // 取消正在播放的语音
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  
  // 清理克隆音频URL
  if (clonedAudioUrl.value) {
    URL.revokeObjectURL(clonedAudioUrl.value);
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
        :disabled="isLoading || isSpeaking"
      >
        <span class="icon">{{ isRecording ? '⏹' : '🎤' }}</span>
        <span>{{ isRecording ? '停止录音' : '开始录音' }}</span>
      </button>
      
      <!-- 波形可视化 -->
      <div v-if="isRecording" class="waveform-container">
        <canvas ref="canvasRef" class="waveform-canvas"></canvas>
      </div>
      
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
          <div v-if="isSpeaking" class="speaking-indicator">
            <span class="sound-wave"></span>
            <span>正在播放语音...</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 声音克隆功能区 -->
    <div class="clone-section">
      <button class="toggle-clone-btn" @click="toggleCloneSection">
        {{ showCloneSection ? '隐藏声音克隆' : '声音克隆' }}
      </button>
      
      <div v-if="showCloneSection" class="clone-panel">
        <h3>声音克隆</h3>
        
        <!-- 参考音频上传 -->
        <div class="upload-area">
          <label class="upload-label">
            <input 
              type="file" 
              accept="audio/*" 
              @change="handleReferenceFileChange"
              class="file-input"
            />
            <span class="upload-btn">
              {{ referenceAudioFile ? '✅ ' + referenceAudioFile.name : '📁 上传参考音频' }}
            </span>
          </label>
        </div>
        
        <!-- 文本输入 -->
        <div class="text-input-area">
          <textarea 
            v-model="cloneTextInput"
            placeholder="输入要合成的文本..."
            rows="3"
            class="clone-textarea"
          ></textarea>
        </div>
        
        <!-- 克隆按钮 -->
        <button 
          class="clone-btn"
          @click="executeVoiceClone"
          :disabled="isCloning || !referenceAudioFile || !cloneTextInput.trim()"
        >
          {{ isCloning ? '克隆中...' : '🎙️ 生成克隆语音' }}
        </button>
        
        <!-- 克隆结果 -->
        <div v-if="clonedAudioUrl" class="clone-result">
          <p>✅ 克隆成功！</p>
          <audio 
            ref="clonedAudioPlayer"
            :src="clonedAudioUrl" 
            controls
            class="audio-player"
          ></audio>
          <button @click="playClonedAudio" class="replay-btn">🔊 重新播放</button>
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
        <li>TTS会自动过滤表情符号，只朗读文字内容</li>
        <li>声音克隆功能需要后端OpenVoice服务运行在8000端口</li>
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

/* 波形可视化容器 */
.waveform-container {
  width: 100%;
  max-width: 500px;
  height: 100px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.waveform-canvas {
  width: 100%;
  height: 100%;
  display: block;
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

/* 语音播放指示器 */
.speaking-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: #2d8a6e;
  margin-top: 8px;
}

.sound-wave {
  display: inline-block;
  width: 16px;
  height: 16px;
  background: linear-gradient(135deg, #2d8a6e, #0f5132);
  border-radius: 50%;
  animation: soundPulse 1s infinite;
}

@keyframes soundPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.7; }
}

/* 声音克隆区域 */
.clone-section {
  margin-bottom: 30px;
  text-align: center;
}

.toggle-clone-btn {
  padding: 12px 24px;
  font-size: 16px;
  border: 2px solid #2d8a6e;
  border-radius: 8px;
  background: white;
  color: #2d8a6e;
  cursor: pointer;
  transition: all 0.3s ease;
}

.toggle-clone-btn:hover {
  background: #2d8a6e;
  color: white;
}

.clone-panel {
  margin-top: 20px;
  padding: 20px;
  background: #f8f9fa;
  border-radius: 12px;
  border-left: 4px solid #2d8a6e;
}

.clone-panel h3 {
  margin: 0 0 20px 0;
  color: #2d8a6e;
}

.upload-area {
  margin-bottom: 15px;
}

.upload-label {
  display: inline-block;
  cursor: pointer;
}

.file-input {
  display: none;
}

.upload-btn {
  display: inline-block;
  padding: 10px 20px;
  background: white;
  border: 2px dashed #2d8a6e;
  border-radius: 8px;
  color: #2d8a6e;
  transition: all 0.3s ease;
}

.upload-btn:hover {
  background: #e8f5f0;
}

.text-input-area {
  margin-bottom: 15px;
}

.clone-textarea {
  width: 100%;
  max-width: 500px;
  padding: 12px;
  border: 2px solid #dee2e6;
  border-radius: 8px;
  font-size: 14px;
  resize: vertical;
  font-family: inherit;
}

.clone-textarea:focus {
  outline: none;
  border-color: #2d8a6e;
}

.clone-btn {
  padding: 12px 30px;
  font-size: 16px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #0f5132, #2d8a6e);
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-bottom: 20px;
}

.clone-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 15px rgba(15, 81, 50, 0.3);
}

.clone-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.clone-result {
  padding: 15px;
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.clone-result p {
  margin: 0 0 15px 0;
  color: #2d8a6e;
  font-weight: 500;
}

.audio-player {
  width: 100%;
  max-width: 400px;
  margin-bottom: 10px;
}

.replay-btn {
  padding: 8px 16px;
  font-size: 14px;
  border: 1px solid #2d8a6e;
  border-radius: 6px;
  background: white;
  color: #2d8a6e;
  cursor: pointer;
  transition: all 0.3s ease;
}

.replay-btn:hover {
  background: #2d8a6e;
  color: white;
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
