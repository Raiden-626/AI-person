# OpenVoice 声音克隆服务部署指南

## 一、环境要求

- **Python**: 3.9 - 3.11
- **GPU**: NVIDIA GPU（推荐，CPU也可运行但速度慢）
- **CUDA**: 11.8+（如果使用GPU）
- **磁盘空间**: 至少 5GB（模型文件）

## 二、安装步骤

### 1. 创建虚拟环境

```bash
cd D:\VUE\AI-person\backend\openvoice
py -m venv venv
venv\Scripts\activate
```

### 2. 安装依赖

```bash
pip install -r requirements.txt
```

如果遇到网络问题，使用清华镜像：

```bash
pip install -r requirements.txt -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 3. 下载 OpenVoice 模型

OpenVoice 需要预训练模型文件。从官方仓库下载：

```bash
# 克隆 OpenVoice 仓库获取模型
git clone https://github.com/myshell-ai/OpenVoice.git
cd OpenVoice

# 下载模型文件到 checkpoints 目录
# 或者手动从 releases 页面下载
```

将模型文件复制到 `backend/openvoice/checkpoints/` 目录：

```
checkpoints/
├── base_speakers/
│   └── EN/
│       ├── checkpoint.pth
│       └── config.json
└── converter/
    ├── checkpoint.pth
    └── config.json
```

### 4. 启动服务

```bash
cd D:\VUE\AI-person\backend\openvoice
py main.py
```

服务将在 `http://localhost:8000` 启动。

## 三、API 接口

### 1. 健康检查

```bash
curl http://localhost:8000/api/v1/health
```

响应：
```json
{
  "status": "ok",
  "service": "OpenVoice Voice Cloning",
  "model_loaded": true
}
```

### 2. 声音克隆 + 语音合成

```bash
curl -X POST http://localhost:8000/api/v1/clone_and_synthesize \
  -F "reference_audio=@reference.wav" \
  -F "text=你好，这是测试文本" \
  -F "language=zh" \
  --output cloned_voice.mp3
```

参数：
- `reference_audio`: 参考音频文件（WAV格式，3-30秒，清晰人声）
- `text`: 要合成的文本
- `language`: 语言代码（zh/en/ja/ko）

返回：MP3格式的音频文件

## 四、集成到主后端

在主后端（Node.js）中调用 OpenVoice 服务：

```javascript
// backend/src/services/voiceCloningService.js
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function cloneVoice(referenceAudioPath, text, language = 'zh') {
  const form = new FormData();
  form.append('reference_audio', fs.createReadStream(referenceAudioPath));
  form.append('text', text);
  form.append('language', language);
  
  const response = await axios.post(
    'http://localhost:8000/api/v1/clone_and_synthesize',
    form,
    {
      headers: form.getHeaders(),
      responseType: 'arraybuffer'
    }
  );
  
  return Buffer.from(response.data);
}

module.exports = { cloneVoice };
```

## 五、常见问题

### 1. 模型加载失败

确保模型文件路径正确，检查 `checkpoints/` 目录结构。

### 2. GPU内存不足

修改 `main.py`，将 `device='cuda'` 改为 `device='cpu'`。

### 3. 音频质量不佳

- 确保参考音频清晰、无背景噪音
- 参考音频时长建议 5-15 秒
- 说话人发音清晰、语速适中

## 六、当前状态

**注意**：当前实现为 Mock 模式，尚未集成真实的 OpenVoice 模型。

要启用真实功能：
1. 安装 OpenVoice Python 包
2. 下载预训练模型
3. 取消 `main.py` 中的注释代码

在模型就绪前，服务会返回空音频或 Mock 数据。
