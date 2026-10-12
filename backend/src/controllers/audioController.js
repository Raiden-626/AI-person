const asrService = require('../services/asrService');
const llmService = require('../services/llmService');
const voiceCloningService = require('../services/voiceCloningService');
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
 * 智能对话：接收文本，通过LLM生成回复
 */
async function chat(req, res) {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: '缺少文本内容' });
    }

    console.log(`收到对话请求: "${text}"`);

    // LLM生成回复
    const reply = await llmService.generateReply(text);
    console.log(`LLM回复: "${reply}"`);
    
    res.json({ 
      success: true, 
      reply: reply,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('对话处理失败:', error);
    res.status(500).json({ 
      error: '对话处理失败', 
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
  cloneVoice
};
