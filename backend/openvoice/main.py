"""
OpenVoice 声音克隆服务（Mock 模式）
提供 HTTP API 接口，接收参考音频和文本，返回模拟的克隆音色语音
注意：当前为 Mock 模式，不依赖真实模型文件
"""
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import uvicorn
import os
import tempfile
import numpy as np
import soundfile as sf
import io
from pathlib import Path

app = FastAPI(title="OpenVoice Voice Cloning Service (Mock)")

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 全局变量
MOCK_MODE = True
print("[OpenVoice] 当前运行在 Mock 模式（无需模型文件）")


@app.on_event("startup")
async def startup_event():
    """服务启动"""
    print("[OpenVoice] 服务启动成功 - Mock 模式")
    print("[OpenVoice] 提示：当前返回模拟音频，非真实音色克隆")


@app.post("/api/v1/clone_and_synthesize")
async def clone_and_synthesize(
    reference_audio: UploadFile = File(...),
    text: str = "",
    language: str = "zh"
):
    """
    声音克隆 + 语音合成（Mock 实现）
    
    参数:
    - reference_audio: 参考音频文件（3-30秒，清晰人声）
    - text: 要合成的文本
    - language: 语言代码（zh/en/ja/ko）
    
    返回:
    - 模拟的克隆语音音频（WAV格式）
    """
    if not text:
        raise HTTPException(status_code=400, detail="文本内容不能为空")
    
    try:
        # 读取参考音频（仅用于验证，实际不使用）
        content = await reference_audio.read()
        print(f"[OpenVoice Mock] 收到请求: text='{text[:50]}...', language={language}, ref_size={len(content)} bytes")
        
        # Mock 实现：生成一个简单的正弦波音频作为占位符
        # 实际使用时需要安装 OpenVoice 模型并切换到真实模式
        sample_rate = 22050
        duration = max(1.0, len(text) * 0.15)  # 根据文本长度估算语音时长
        t = np.linspace(0, duration, int(sample_rate * duration))
        
        # 生成简单的音调信号（模拟语音）
        frequency = 220  # 基频
        audio_data = 0.3 * np.sin(2 * np.pi * frequency * t)
        
        # 添加简单的包络使声音更自然
        envelope = np.exp(-t / duration) * (1 - np.exp(-t * 10))
        audio_data = audio_data * envelope
        
        # 转换为 WAV 格式
        wav_buffer = io.BytesIO()
        sf.write(wav_buffer, audio_data, sample_rate, format='WAV')
        wav_bytes = wav_buffer.getvalue()
        
        print(f"[OpenVoice Mock] 生成模拟音频: {len(wav_bytes)} bytes, {duration:.2f}s")
        
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=cloned_voice_mock.wav"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"声音克隆失败: {str(e)}")


@app.get("/api/v1/health")
async def health_check():
    """健康检查"""
    return {
        "status": "ok",
        "service": "OpenVoice Voice Cloning (Mock)",
        "mock_mode": MOCK_MODE,
        "message": "当前为 Mock 模式，返回模拟音频"
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
