const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// 加载环境变量
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 确保上传目录存在
const uploadDir = process.env.UPLOAD_DIR || './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 路由
const audioRoutes = require('./routes/audio');
app.use('/api/audio', audioRoutes);

// 健康检查
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`AI数字人后端服务运行在 http://localhost:${PORT}`);
  console.log(`FunASR服务地址: ${process.env.FUNASR_URL || '未配置'}`);
  console.log(`DeepSeek API: ${process.env.DEEPSEEK_API_KEY ? '已配置' : '未配置'}`);
});
