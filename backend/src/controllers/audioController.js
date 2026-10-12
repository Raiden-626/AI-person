const asrService = require('../services/asrService');
const llmService = require('../services/llmService');
const fs = require('fs');

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

    // 调用ASR服务进行语音识别
    const text = await asrService.transcribe(audioPath);
    
    // 删除临时音频文件
    fs.unlinkSync(audioPath);
    
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

module.exports = {
  transcribe,
  chat
};
