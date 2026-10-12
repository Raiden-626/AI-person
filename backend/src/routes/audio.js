const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const audioController = require('../controllers/audioController');

// 配置multer存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'audio-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 限制10MB
});

// 语音识别：音频转文字
router.post('/transcribe', upload.single('audio'), audioController.transcribe);

// 智能对话：文本→LLM生成回复
router.post('/chat', audioController.chat);

// 声音克隆：参考音频+文本→克隆音色语音
router.post('/clone-voice', upload.single('reference_audio'), audioController.cloneVoice);

module.exports = router;
