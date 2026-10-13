"""
OpenVoice V2 声音克隆服务
使用 MeloTTS 生成基础语音 + ToneColorConverter 转换音色
"""
import os

# 设置 ffmpeg 路径（使用后端 node_modules 中的 ffmpeg）
ffmpeg_path = r"D:\VUE\AI-person\backend\node_modules\@ffmpeg-installer\win32-x64"
if os.path.exists(ffmpeg_path):
    os.environ["PATH"] = ffmpeg_path + os.pathsep + os.environ.get("PATH", "")

from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
import uvicorn
import os
import tempfile
import numpy as np
import soundfile as sf
import io
from pathlib import Path
import sys
import torch

# 添加 openvoice-src 到 Python 路径
sys.path.insert(0, str(Path(__file__).parent / "openvoice-src"))

from openvoice.api import ToneColorConverter
from openvoice import se_extractor

app = FastAPI(title="OpenVoice V2 Voice Cloning Service")

# 允许跨域
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# 模型路径
CHECKPOINT_DIR = Path(__file__).parent / "checkpoints_v2"
CONVERTER_CONFIG = CHECKPOINT_DIR / "converter" / "config.json"
CONVERTER_CKPT = CHECKPOINT_DIR / "converter" / "checkpoint.pth"
BASE_SPEAKERS_DIR = CHECKPOINT_DIR / "base_speakers" / "ses"

# 语言映射
LANGUAGE_MAP = {
    "zh": "zh.pth",
    "en": "en-us.pth",
    "en-us": "en-us.pth",
    "en-default": "en-default.pth",
    "es": "es.pth",
    "fr": "fr.pth",
    "jp": "jp.pth",
    "kr": "kr.pth",
}

# 全局变量
converter = None
melo_tts = None
MOCK_MODE = False

def load_model():
    """加载模型"""
    global converter, melo_tts, MOCK_MODE
    
    try:
        if not CONVERTER_CONFIG.exists() or not CONVERTER_CKPT.exists():
            print(f"[OpenVoice] 模型文件不存在: {CONVERTER_CONFIG}")
            print("[OpenVoice] 降级为 Mock 模式")
            MOCK_MODE = True
            return
        
        print(f"[OpenVoice] 加载模型: {CHECKPOINT_DIR}")
        device = "cuda:0" if os.environ.get("USE_CUDA") else "cpu"
        
        # 加载 ToneColorConverter
        converter = ToneColorConverter(
            config_path=str(CONVERTER_CONFIG),
            device=device
        )
        converter.load_ckpt(str(CONVERTER_CKPT))
        print(f"[OpenVoice] ToneColorConverter 加载成功")
        
        # 加载 MeloTTS
        try:
            from melo.api import TTS as MeloTTS
            melo_tts = {}  # 缓存不同语言的 TTS 模型
            
            # 预加载中文模型
            print("[OpenVoice] 加载 MeloTTS 中文模型...")
            melo_tts["zh"] = MeloTTS(language="ZH", device=device)
            print("[OpenVoice] MeloTTS 中文模型加载成功")
            
        except ImportError as e:
            print(f"[OpenVoice] MeloTTS 未安装: {e}")
            print("[OpenVoice] 将使用 Mock 模式")
            MOCK_MODE = True
            return
        
        print(f"[OpenVoice] 模型全部加载成功 (device: {device})")
        MOCK_MODE = False
        
    except Exception as e:
        print(f"[OpenVoice] 模型加载失败: {e}")
        import traceback
        traceback.print_exc()
        print("[OpenVoice] 降级为 Mock 模式")
        MOCK_MODE = True


@app.on_event("startup")
async def startup_event():
    """服务启动"""
    load_model()
    if MOCK_MODE:
        print("[OpenVoice] 服务启动 - Mock 模式")
    else:
        print("[OpenVoice] 服务启动 - 真实模式")


@app.post("/api/v1/clone_and_synthesize")
async def clone_and_synthesize(
    reference_audio: UploadFile = File(...),
    text: str = Form(...),
    language: str = Form(default="zh")
):
    """
    声音克隆 + 语音合成
    
    参数:
    - reference_audio: 参考音频文件（3-30秒，清晰人声）
    - text: 要合成的文本
    - language: 语言代码（zh/en/ja/ko）
    
    返回:
    - 克隆音色的语音音频（WAV格式）
    """
    if not text:
        raise HTTPException(status_code=400, detail="文本内容不能为空")
    
    if MOCK_MODE:
        return generate_mock_audio(text)
    
    try:
        # 读取参考音频
        content = await reference_audio.read()
        print(f"[OpenVoice] 收到请求: text='{text[:50]}...', language={language}, ref_size={len(content)} bytes")
        
        # 保存参考音频到临时文件
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp.write(content)
            ref_audio_path = tmp.name
        
        try:
            # 1. 用 MeloTTS 生成基础语音
            lang_key = language.lower()
            if lang_key not in melo_tts:
                # 加载对应语言的模型
                from melo.api import TTS as MeloTTS
                device = "cuda:0" if os.environ.get("USE_CUDA") else "cpu"
                print(f"[OpenVoice] 加载 {language} 语言模型...")
                melo_tts[lang_key] = MeloTTS(language=language.upper(), device=device)
            
            tts_model = melo_tts[lang_key]
            
            # 生成基础语音
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as src_tmp:
                source_audio_path = src_tmp.name
            
            print(f"[OpenVoice] MeloTTS 生成基础语音...")
            tts_model.tts_to_file(text, 0, source_audio_path)
            print(f"[OpenVoice] 基础语音生成完成: {source_audio_path}")
            
            try:
                # 2. 提取参考音频的音色特征
                print(f"[OpenVoice] 提取参考音频音色特征...")
                tgt_se = se_extractor.get_se(
                    ref_audio_path,
                    converter,
                    vad=True
                )
                
                # 3. 获取源音频的音色特征（使用对应语言的默认 speaker）
                se_path = BASE_SPEAKERS_DIR / LANGUAGE_MAP.get(lang_key, "zh.pth")
                if se_path.exists():
                    src_se = torch.load(se_path, map_location=converter.device)
                    print(f"[OpenVoice] 使用预计算 speaker embedding: {se_path.name}")
                else:
                    # 如果没有预计算的 embedding，从源音频提取
                    src_se = se_extractor.get_se(source_audio_path, converter, vad=True)
                    print(f"[OpenVoice] 从源音频提取 speaker embedding")
                
                # 4. 音色转换
                output_path = ref_audio_path.replace(".wav", "_output.wav")
                print(f"[OpenVoice] 执行音色转换...")
                converter.convert(
                    audio_src_path=source_audio_path,
                    src_se=src_se,
                    tgt_se=tgt_se,
                    output_path=output_path
                )
                
                # 读取输出音频
                with open(output_path, "rb") as f:
                    output_bytes = f.read()
                
                # 清理临时文件
                os.unlink(output_path)
                
                print(f"[OpenVoice] 克隆完成: {len(output_bytes)} bytes")
                
                return Response(
                    content=output_bytes,
                    media_type="audio/wav",
                    headers={"Content-Disposition": "attachment; filename=cloned_voice.wav"}
                )
                
            finally:
                if os.path.exists(source_audio_path):
                    os.unlink(source_audio_path)
        
        finally:
            if os.path.exists(ref_audio_path):
                os.unlink(ref_audio_path)
    
    except Exception as e:
        print(f"[OpenVoice] 克隆失败: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"声音克隆失败: {str(e)}")


def generate_mock_audio(text):
    """生成模拟音频（Mock 模式）"""
    sample_rate = 22050
    duration = max(1.0, len(text) * 0.15)
    t = np.linspace(0, duration, int(sample_rate * duration))
    frequency = 220
    audio_data = 0.3 * np.sin(2 * np.pi * frequency * t)
    envelope = np.exp(-t / duration) * (1 - np.exp(-t * 10))
    audio_data = audio_data * envelope
    
    wav_buffer = io.BytesIO()
    sf.write(wav_buffer, audio_data, sample_rate, format='WAV')
    wav_bytes = wav_buffer.getvalue()
    
    print(f"[OpenVoice Mock] 生成模拟音频: {len(wav_bytes)} bytes, {duration:.2f}s")
    
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={"Content-Disposition": "attachment; filename=cloned_voice_mock.wav"}
    )


@app.get("/api/v1/health")
async def health_check():
    """健康检查"""
    return {
        "status": "ok",
        "service": "OpenVoice V2 Voice Cloning",
        "mock_mode": MOCK_MODE,
        "version": "v2",
        "languages": list(LANGUAGE_MAP.keys())
    }


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
