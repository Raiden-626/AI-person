const asrService = require('../services/asrService');
const llmService = require('../services/llmService');
const voiceCloningService = require('../services/voiceCloningService');
const voiceProfileService = require('../services/voiceProfileService');
const fs = require('fs');
const path = require('path');

/**
 * 语音识别：接收音频文件，返回识别文本
 */
async function transcribe(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传音频文件' });
    }

    const audioPath = req.file.path;
    console.log(`收到音频文件: ${audioPath}`);

    // 调用ASR服务进行语音识别（ASR服务内部会清理临时文件）
    const text = await asrService.transcribe(audioPath);
    
    res.json({ 
      success: true, 
      text: text,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('语音识别失败:', error);
    res.status(500).json({ 
      error: '语音识别失败', 
      message: error.message 
    });
  }
}

/**
 * 智能对话：接收文本和声音档案ID，返回克隆音色的语音
 */
async function chat(req, res) {
  try {
    const { text, profileId } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: '缺少文本内容' });
    }

    console.log(`收到对话请求: "${text}", profileId: ${profileId || 'none'}`);

    // LLM生成回复
    const reply = await llmService.generateReply(text);
    console.log(`LLM回复: "${reply}"`);

    // 如果有声音档案，使用克隆声音
    if (profileId) {
      const profile = voiceProfileService.getProfileById(profileId);
      if (!profile) {
        return res.status(400).json({ error: '声音档案不存在' });
      }

      console.log(`使用声音档案: ${profile.name}`);
      
      // 调用声音克隆服务
      const audioBuffer = await voiceCloningService.cloneVoice(
        profile.audioPath,
        reply,
        'zh'
      );

      // 保存音频文件
      const audioFileName = `reply_${Date.now()}.wav`;
      const audioPath = path.join(__dirname, '../../output_audio', audioFileName);
      
      // 确保输出目录存在
      const outputDir = path.join(__dirname, '../../output_audio');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      
      fs.writeFileSync(audioPath, audioBuffer);
      console.log(`保存回复音频: ${audioFileName}`);

      // 返回音频和文字
      res.setHeader('Content-Type', 'audio/wav');
      res.setHeader('X-Reply-Text', encodeURIComponent(reply));
      res.setHeader('X-Audio-File', audioFileName);
      res.send(audioBuffer);
    } else {
      // 没有声音档案，返回文字
      res.json({ 
        success: true, 
        reply: reply,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('对话处理失败:', error);
    res.status(500).json({ 
      error: '对话处理失败', 
      message: error.message 
    });
  }
}

/**
 * 创建声音档案
 */
async function createVoiceProfile(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传参考音频' });
    }

    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ error: '缺少档案名称' });
    }

    const profile = await voiceProfileService.createProfile(name, req.file.path);

    // 清理临时文件
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {
      // 忽略清理错误
    }

    res.json({
      success: true,
      profile
    });
  } catch (error) {
    console.error('创建声音档案失败:', error);
    res.status(500).json({
      error: '创建声音档案失败',
      message: error.message
    });
  }
}

/**
 * 获取所有声音档案
 */
async function getVoiceProfiles(req, res) {
  try {
    const profiles = voiceProfileService.getAllProfiles();
    res.json({
      success: true,
      profiles
    });
  } catch (error) {
    console.error('获取声音档案失败:', error);
    res.status(500).json({
      error: '获取声音档案失败',
      message: error.message
    });
  }
}

/**
 * 删除声音档案
 */
async function deleteVoiceProfile(req, res) {
  try {
    const { id } = req.params;
    const success = voiceProfileService.deleteProfile(id);
    
    if (success) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: '档案不存在' });
    }
  } catch (error) {
    console.error('删除声音档案失败:', error);
    res.status(500).json({
      error: '删除声音档案失败',
      message: error.message
    });
  }
}

/**
 * 声音克隆：接收参考音频和文本，返回克隆音色的语音
 */
async function cloneVoice(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '未上传参考音频' });
    }

    const { text, language } = req.body;
    if (!text) {
      return res.status(400).json({ error: '缺少文本内容' });
    }

    const referenceAudioPath = req.file.path;
    console.log(`收到声音克隆请求: text="${text.substring(0, 30)}..."`);

    // 调用声音克隆服务
    const audioBuffer = await voiceCloningService.cloneVoice(
      referenceAudioPath,
      text,
      language || 'zh'
    );

    // 清理临时文件
    try {
      fs.unlinkSync(referenceAudioPath);
    } catch (e) {
      // 忽略清理错误
    }

    // 返回音频
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', 'attachment; filename="cloned_voice.mp3"');
    res.send(audioBuffer);
  } catch (error) {
    console.error('声音克隆失败:', error);
    res.status(500).json({ 
      error: '声音克隆失败', 
      message: error.message 
    });
  }
}

module.exports = {
  transcribe,
  chat,
  cloneVoice,
  createVoiceProfile,
  getVoiceProfiles,
  deleteVoiceProfile
};
