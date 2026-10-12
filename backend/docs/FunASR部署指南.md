# FunASR 本地部署指南

FunASR 是阿里达摩院开源的工业级语音识别工具，支持实时流式语音识别。本指南介绍如何在 Windows 环境下部署 FunASR 服务。

## 一、环境要求

- **操作系统**：Windows 10/11（推荐 Linux/macOS）
- **Python**：3.8 - 3.11
- **GPU**：NVIDIA GPU（可选，CPU 也可运行但速度较慢）
- **CUDA**：11.8+（如果使用 GPU）
- **磁盘空间**：至少 10GB（模型文件较大）

## 二、安装步骤

### 1. 创建 Python 虚拟环境（推荐）

```bash
cd D:\VUE\AI-person\backend
py -m venv funasr-env
funasr-env\Scripts\activate
```

### 2. 安装 FunASR

```bash
pip install funasr modelscope
```

如果遇到网络问题，可以使用清华镜像：

```bash
pip install funasr modelscope -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 3. 下载模型

FunASR 提供多种模型，推荐使用 Paraformer（速度快、精度高）：

```python
from funasr import AutoModel

# 下载并加载 Paraformer 模型
model = AutoModel(
    model="paraformer-zh",
    vad_model="fsmn-vad",        # 语音活动检测模型
    punc_model="ct-punc",        # 标点恢复模型
    device="cpu"                 # 如果有 GPU，改为 "cuda"
)
```

首次运行时会自动下载模型文件（约 2-3GB），请确保网络畅通。

## 三、启动 FunASR HTTP 服务

FunASR 本身不直接提供 HTTP API，我们需要创建一个简单的 Flask/FastAPI 服务来封装它。

### 方案：自建 FastAPI 服务

在 `backend` 目录下创建 `funasr_server.py`：

```python
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from funasr import AutoModel
import uvicorn
import base64
import io

app = FastAPI()

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 加载模型（全局变量，避免每次请求重新加载）
model = AutoModel(
    model="paraformer-zh",
    vad_model="fsmn-vad",
    punc_model="ct-punc",
    device="cpu"  # 有 GPU 改为 "cuda"
)

@app.post("/api/v1/recognize")
async def recognize(audio_base64: str):
    """接收 base64 编码的音频，返回识别文本"""
    try:
        # 解码音频
        audio_bytes = base64.b64decode(audio_base64)
        audio_stream = io.BytesIO(audio_bytes)
        
        # 进行语音识别
        result = model.generate(input=audio_stream)
        
        if result and len(result) > 0:
            text = result[0].get("text", "")
            return {"success": True, "text": text}
        else:
            return {"success": False, "error": "识别失败"}
    except Exception as e:
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=10095)
```

启动服务：

```bash
pip install fastapi uvicorn
py funasr_server.py
```

## 四、配置后端环境变量

编辑 `backend/.env` 文件，确保 FunASR_URL 指向正确的地址：

```env
FUNASR_URL=http://localhost:10095
```

## 五、测试 FunASR 服务

启动 FunASR 服务后，可以用以下命令测试：

```bash
curl -X POST http://localhost:10095/api/v1/recognize \
  -H "Content-Type: application/json" \
  -d '{"audio_base64": "<base64编码的音频数据>"}'
```

或者使用 Postman/Apifox 等工具发送 POST 请求。

## 六、常见问题

### 1. 模型下载失败

- 检查网络连接，可能需要科学上网
- 使用清华镜像：`export HF_ENDPOINT=https://hf-mirror.com`
- 手动下载模型文件放到指定目录

### 2. GPU 内存不足

- 改用 CPU 模式：`device="cpu"`
- 使用更小的模型：`model="paraformer-zh-streaming"`

### 3. 识别结果为空

- 检查音频格式是否正确（建议 WAV 格式，16kHz 采样率）
- 检查音频是否包含有效人声
- 查看服务端日志排查错误

### 4. 服务启动慢

- 首次启动需要加载模型，可能需要 1-2 分钟
- 后续请求会快很多

## 七、替代方案

如果 FunASR 部署困难，可以考虑以下替代方案：

### 1. 阿里云 DashScope ASR（付费 API）

修改 `backend/src/services/asrService.js`，调用阿里云 API。

### 2. 继续使用 Mock 数据

当前代码已内置 Mock 数据，可以在 FunASR 未部署时用于前端调试。

## 八、性能优化建议

1. **模型预热**：服务启动后先进行一次 dummy 识别，避免首次请求过慢
2. **批量处理**：如果并发请求多，可以考虑批量识别
3. **缓存机制**：对相同音频指纹的结果进行缓存
4. **流式识别**：使用 FunASR 的流式接口降低延迟

---

**注意**：FunASR 部署相对复杂，建议先用 Mock 数据跑通整个流程，确认前后端交互正常后，再接入真实的 ASR 服务。
