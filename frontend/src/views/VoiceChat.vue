<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import { transcribeAudio, chatWithText, createVoiceProfile, getVoiceProfiles, deleteVoiceProfile } from '@/api/audio';

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
let sourceNode = null;
const canvasRef = ref(null);

// 声音档案相关
const voiceProfiles = ref([]);
const selectedProfileId = ref(null);
const showProfilePanel = ref(false);
const newProfileName = ref('');
const isCreatingProfile = ref(false);

// 对话历史
const chatHistory = ref([]);

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
  
  if (sourceNode) {
    sourceNode.disconnect();
    sourceNode = null;
  }
  
  sourceNode = audioContext.createMediaStreamSource(stream);
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  
  sourceNode.connect(analyser);
  
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
  
  const canvas = canvasRef.value;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#f5f7fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

/**
 * 开始录音
 */
async function startRecording() {
  try {
    errorMessage.value = '';
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
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
      await processAudio(audioBlob);
      
      if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
      }
      
      stopVisualization();
    };
    
    mediaRecorder.start();
    isRecording.value = true;
    
    await nextTick();
    startVisualization(audioStream);
    
  } catch (error) {
    console.error('录音启动失败:', error);
    errorMessage.value = '无法访问麦克风，请检查权限设置';
  }
}

/**
 * 停止录音
 */
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
    isRecording.value = false;
  }
}

/**
 * 处理录音
 */
async function processAudio(audioBlob) {
  isLoading.value = true;
  errorMessage.value = '';
  
  try {
    const text = await transcribeAudio(audioBlob);
    recognizedText.value = text;
    
    await sendToLLM(text);
  } catch (error) {
    console.error('处理失败:', error);
    errorMessage.value = '处理失败，请重试';
  } finally {
    isLoading.value = false;
  }
}

/**
 * 发送到LLM
 */
async function sendToLLM(text) {
  isLoading.value = true;
  errorMessage.value = '';
  
  try {
    const result = await chatWithText(text, selectedProfileId.value);
    replyText.value = result.reply;
    
    // 添加到对话历史
    chatHistory.value.push({
      type: 'user',
      text: text,
      timestamp: new Date().toISOString()
    });
    
    chatHistory.value.push({
      type: 'ai',
      text: result.reply,
      audioUrl: result.audioBlob ? URL.createObjectURL(result.audioBlob) : null,
      audioFile: result.audioFile,
      timestamp: new Date().toISOString()
    });
    
    // 如果有音频，自动播放
    if (result.audioBlob) {
      playAudioBlob(result.audioBlob);
    }
    
  } catch (error) {
    console.error('LLM处理失败:', error);
    errorMessage.value = 'AI回复失败，请重试';
  } finally {
    isLoading.value = false;
  }
}

/**
 * 播放音频Blob
 */
function playAudioBlob(audioBlob) {
  const url = URL.createObjectURL(audioBlob);
  const audio = new Audio(url);
  
  audio.onplay = () => {
    isSpeaking.value = true;
  };
  
  audio.onended = () => {
    isSpeaking.value = false;
    URL.revokeObjectURL(url);
  };
  
  audio.onerror = (e) => {
    console.error('音频播放失败:', e);
    isSpeaking.value = false;
  };
  
  audio.play();
}

/**
 * 停止语音播放
 */
function stopSpeaking() {
  const audios = document.querySelectorAll('audio');
  audios.forEach(audio => {
    if (!audio.paused) {
      audio.pause();
      audio.currentTime = 0;
    }
  });
  isSpeaking.value = false;
}

/**
 * 加载声音档案
 */
async function loadVoiceProfiles() {
  try {
    voiceProfiles.value = await getVoiceProfiles();
  } catch (error) {
    console.error('加载声音档案失败:', error);
  }
}

/**
 * 创建声音档案
 */
async function handleCreateProfile() {
  if (!newProfileName.value.trim()) {
    errorMessage.value = '请输入档案名称';
    return;
  }
  
  // 创建文件输入
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    isCreatingProfile.value = true;
    errorMessage.value = '';
    
    try {
      const profile = await createVoiceProfile(file, newProfileName.value);
      voiceProfiles.value.push(profile);
      newProfileName.value = '';
      showProfilePanel.value = false;
      
      // 自动选中新创建的档案
      selectedProfileId.value = profile.id;
      
    } catch (error) {
      console.error('创建声音档案失败:', error);
      errorMessage.value = '创建失败，请重试';
    } finally {
      isCreatingProfile.value = false;
    }
  };
  
  input.click();
}

/**
 * 删除声音档案
 */
async function handleDeleteProfile(id) {
  if (!confirm('确定要删除这个声音档案吗？')) {
    return;
  }
  
  try {
    await deleteVoiceProfile(id);
    voiceProfiles.value = voiceProfiles.value.filter(p => p.id !== id);
    
    if (selectedProfileId.value === id) {
      selectedProfileId.value = null;
    }
  } catch (error) {
    console.error('删除声音档案失败:', error);
    errorMessage.value = '删除失败';
  }
}

/**
 * 选择声音档案
 */
function selectProfile(id) {
  selectedProfileId.value = selectedProfileId.value === id ? null : id;
}

/**
 * 清除错误信息
 */
function clearError() {
  errorMessage.value = '';
}

// 组件挂载时初始化
onMounted(() => {
  nextTick(() => {
    const canvas = canvasRef.value;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * 2;
      canvas.height = rect.height * 2;
    }
  });
  
  // 加载声音档案
  loadVoiceProfiles();
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
  
  stopSpeaking();
  
  // 清理对话历史中的URL
  chatHistory.value.forEach(item => {
    if (item.audioUrl) {
      URL.revokeObjectURL(item.audioUrl);
    }
  });
});
</script>

<template>
  <div class="voice-chat-container">
    <h1>AI数字人语音对话</h1>
    
    <!-- 声音档案选择区 -->
    <div class="profile-section">
      <div class="profile-header">
        <h3>声音档案</h3>
        <button @click="showProfilePanel = !showProfilePanel" class="btn-small">
          {{ showProfilePanel ? '收起' : '管理' }}
        </button>
      </div>
      
      <div v-if="showProfilePanel" class="profile-panel">
        <div class="profile-input">
          <input 
            v-model="newProfileName" 
            type="text" 
            placeholder="输入档案名称..."
            class="text-input"
          />
          <button 
            @click="handleCreateProfile" 
            :disabled="isCreatingProfile"
            class="btn-small"
          >
            {{ isCreatingProfile ? '创建中...' : '上传音频创建' }}
          </button>
        </div>
        
        <div class="profile-list">
          <div 
            v-for="profile in voiceProfiles" 
            :key="profile.id"
            :class="['profile-item', { selected: selectedProfileId === profile.id }]"
            @click="selectProfile(profile.id)"
          >
            <span class="profile-name">{{ profile.name }}</span>
            <button 
              @click.stop="handleDeleteProfile(profile.id)" 
              class="btn-delete"
            >
              ×
            </button>
          </div>
          <div v-if="voiceProfiles.length === 0" class="no-profile">
            暂无声音档案，请上传参考音频创建
          </div>
        </div>
      </div>
      
      <div v-if="selectedProfileId" class="selected-profile">
        已选择: {{ voiceProfiles.find(p => p.id === selectedProfileId)?.name || '未选择' }}
      </div>
      <div v-else class="no-profile-selected">
        未选择声音档案（将使用默认文字回复）
      </div>
    </div>
    
    <!-- 录音控制区 -->
    <div class="record-section">
      <button 
        :class="['record-btn', isRecording ? 'recording' : '']"
        @mousedown="startRecording"
        @mouseup="stopRecording"
        @mouseleave="stopRecording"
        :disabled="isLoading"
      >
        {{ isRecording ? '松开结束' : '按住说话' }}
      </button>
      
      <canvas ref="canvasRef" class="waveform-canvas"></canvas>
    </div>
    
    <!-- 加载状态 -->
    <div v-if="isLoading" class="loading-section">
      <div class="spinner"></div>
      <span>处理中...</span>
    </div>
    
    <!-- 错误信息 -->
    <div v-if="errorMessage" class="error-section" @click="clearError">
      {{ errorMessage }}
    </div>
    
    <!-- 对话历史 -->
    <div v-if="chatHistory.length > 0" class="chat-history">
      <h3>对话记录</h3>
      <div 
        v-for="(item, index) in chatHistory" 
        :key="index"
        :class="['chat-item', item.type]"
      >
        <div class="chat-text">{{ item.text }}</div>
        <div v-if="item.audioUrl" class="chat-audio">
          <audio :src="item.audioUrl" controls></audio>
          <span class="audio-file">{{ item.audioFile }}</span>
        </div>
      </div>
    </div>
    
    <!-- 语音控制 -->
    <div v-if="isSpeaking" class="speaking-controls">
      <button @click="stopSpeaking" class="btn-stop">停止播放</button>
    </div>
    
    <!-- 使用说明 -->
    <div class="tips-section">
      <div class="tip-item">
        <span class="tip-icon">🎤</span>
        <span class="tip-content">按住按钮说话，松开自动识别</span>
      </div>
      <div class="tip-item">
        <span class="tip-icon">🎭</span>
        <span class="tip-content">上传参考音频创建声音档案，AI将用该声音回复</span>
      </div>
      <div class="tip-item">
        <span class="tip-icon">💾</span>
        <span class="tip-content">每次回复的音频会自动保存，可在对话记录中回放</span>
      </div>
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

h3 {
  color: #0f5132;
  margin: 0 0 10px 0;
  font-size: 16px;
}

/* 声音档案区 */
.profile-section {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 15px;
  margin-bottom: 20px;
}

.profile-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.profile-panel {
  margin-top: 15px;
  padding-top: 15px;
  border-top: 1px solid #e0e0e0;
}

.profile-input {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.text-input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 14px;
}

.profile-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.profile-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 15px;
  background: white;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.profile-item:hover {
  background: #e8f5e9;
}

.profile-item.selected {
  background: #2d8a6e;
  color: white;
}

.btn-delete {
  background: none;
  border: none;
  font-size: 20px;
  color: #999;
  cursor: pointer;
  padding: 0 5px;
}

.btn-delete:hover {
  color: #ff4444;
}

.no-profile, .no-profile-selected {
  text-align: center;
  color: #999;
  padding: 10px;
  font-size: 14px;
}

.selected-profile {
  margin-top: 10px;
  padding: 8px 12px;
  background: #e8f5e9;
  border-radius: 6px;
  color: #0f5132;
  font-size: 14px;
}

/* 按钮 */
.btn-small {
  padding: 6px 12px;
  background: #2d8a6e;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.2s;
}

.btn-small:hover {
  background: #1e6b52;
}

.btn-small:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.btn-stop {
  padding: 8px 16px;
  background: #dc3545;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

/* 录音区 */
.record-section {
  text-align: center;
  margin: 30px 0;
}

.record-btn {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #2d8a6e, #0f5132);
  color: white;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.3s;
  box-shadow: 0 4px 15px rgba(45, 138, 110, 0.3);
}

.record-btn:hover {
  transform: scale(1.05);
}

.record-btn.recording {
  background: linear-gradient(135deg, #dc3545, #a020f0);
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.05); }
}

.waveform-canvas {
  width: 100%;
  height: 100px;
  margin-top: 20px;
  border-radius: 8px;
}

/* 加载状态 */
.loading-section {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 15px;
  color: #666;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid #ddd;
  border-top-color: #2d8a6e;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 错误信息 */
.error-section {
  background: #fff3f3;
  color: #dc3545;
  padding: 12px;
  border-radius: 8px;
  text-align: center;
  margin: 15px 0;
  cursor: pointer;
}

/* 对话历史 */
.chat-history {
  background: #f8f9fa;
  border-radius: 12px;
  padding: 15px;
  margin: 20px 0;
}

.chat-item {
  padding: 12px;
  margin: 10px 0;
  border-radius: 8px;
}

.chat-item.user {
  background: #e3f2fd;
  margin-left: 20px;
}

.chat-item.ai {
  background: white;
  margin-right: 20px;
  border: 1px solid #e0e0e0;
}

.chat-text {
  margin-bottom: 8px;
}

.chat-audio {
  display: flex;
  align-items: center;
  gap: 10px;
}

.chat-audio audio {
  height: 32px;
}

.audio-file {
  font-size: 12px;
  color: #999;
}

/* 语音控制 */
.speaking-controls {
  text-align: center;
  margin: 15px 0;
}

/* 使用说明 */
.tips-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  margin-top: 30px;
}

.tip-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  background: #f8f9fa;
  border-radius: 8px;
}

.tip-icon {
  font-size: 24px;
}

.tip-content {
  font-size: 13px;
  color: #666;
}

@media (max-width: 600px) {
  .tips-section {
    grid-template-columns: 1fr;
  }
}
</style>
