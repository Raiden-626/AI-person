const AipSpeechClient = require('baidu-aip-sdk').speech;
const { execFile } = require('child_process');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const fs = require('fs');

// ffmpeg可执行文件路径
const FFMPEG_PATH = ffmpegInstaller.path;

/**
 * ASR服务 - 语音识别
 * 使用百度智能云语音识别API
 */
class ASRService {
  constructor() {
    const appId = process.env.BAIDU_APP_ID;
    const apiKey = process.env.BAIDU_API_KEY;
    const secretKey = process.env.BAIDU_SECRET_KEY;
    
    if (appId && apiKey && secretKey) {
      this.client = new AipSpeechClient(appId, apiKey, secretKey);
      this.enabled = true;
      console.log('百度语音识别已初始化');
    } else {
      this.enabled = false;
      console.warn('百度语音识别凭证未配置，将使用Mock数据');
    }
  }

  /**
   * 将音频文件转换为文字
   * @param {string} audioPath - 音频文件路径（webm格式）
   * @returns {Promise<string>} 识别出的文本
   */
  async transcribe(audioPath) {
    try {
      if (!this.enabled) {
        console.log('百度ASR未启用，使用Mock数据');
        return this.getMockTranscription();
      }

      console.log(`[ASR] 开始处理音频文件: ${audioPath}`);
      
      // 百度ASR需要wav格式，浏览器录制的是webm，需要转换
      const wavPath = await this.convertToWav(audioPath);
      console.log(`[ASR] 音频转换完成: ${wavPath}`);
      
      // 读取wav文件
      const wavBuffer = fs.readFileSync(wavPath);
      console.log(`[ASR] WAV文件大小: ${wavBuffer.length} bytes`);
      
      // 调用百度语音识别API
      // dev_pid: 1537 = 普通话(支持简单的英文识别)
      console.log(`[ASR] 调用百度API...`);
      const result = await this.client.recognize(wavBuffer, 'wav', 16000, {
        dev_pid: 1537
      });
      
      console.log(`[ASR] API返回:`, JSON.stringify(result).substring(0, 200));
      
      // 清理临时文件（wav和原始音频）
      try {
        if (fs.existsSync(wavPath)) {
          fs.unlinkSync(wavPath);
        }
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      } catch (cleanupError) {
        console.warn('[ASR] 清理临时文件失败:', cleanupError.message);
      }
      
      // 检查识别结果
      if (result.err_no === 0 && result.result && result.result.length > 0) {
        return result.result[0];
      } else {
        throw new Error(`百度ASR识别失败: ${JSON.stringify(result)}`);
      }
    } catch (error) {
      console.error('百度语音识别失败:', error.message);
      console.error('错误详情:', error);
      
      // 清理临时文件（包括原始音频和可能的wav）
      try {
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath);
        }
      } catch (e) {
        // 忽略清理错误
      }
      
      // 清理可能的wav文件
      try {
        const wavPath = audioPath.replace(/\.[^.]+$/, '') + '_converted.wav';
        if (fs.existsSync(wavPath)) {
          fs.unlinkSync(wavPath);
        }
      } catch (e) {
        // 忽略清理错误
      }
      
      // API调用失败时使用Mock数据
      console.log('使用Mock数据进行调试...');
      return this.getMockTranscription();
    }
  }

  /**
   * 将webm音频转换为wav格式
   * @param {string} inputPath - 输入的webm文件路径
   * @returns {Promise<string>} 输出的wav文件路径
   */
  convertToWav(inputPath) {
    return new Promise((resolve, reject) => {
      // 输出文件用不同的名称，避免与输入文件同名
      const wavPath = inputPath.replace(/\.[^.]+$/, '') + '_converted.wav';
      
      console.log(`[FFmpeg] 转换: ${inputPath} -> ${wavPath}`);
      console.log(`[FFmpeg] 使用: ${FFMPEG_PATH}`);
      
      // 直接使用ffmpeg.exe命令行
      const args = [
        '-i', inputPath,
        '-acodec', 'pcm_s16le',  // PCM编码
        '-ar', '16000',           // 16kHz采样率
        '-ac', '1',               // 单声道
        '-y',                     // 覆盖输出文件
        wavPath
      ];
      
      execFile(FFMPEG_PATH, args, (error, stdout, stderr) => {
        if (error) {
          console.error('[FFmpeg] 错误:', error.message);
          console.error('[FFmpeg] stderr:', stderr);
          reject(error);
          return;
        }
        
        console.log('[FFmpeg] 转换成功');
        resolve(wavPath);
      });
    });
  }

  /**
   * Mock数据 - 用于API未配置或调用失败时的调试
   */
  getMockTranscription() {
    const mockTexts = [
      '你好，很高兴见到你',
      '今天天气真不错',
      '你能帮我做什么呢',
      '我想了解一下人工智能',
      '这是一个测试语音'
    ];
    const randomIndex = Math.floor(Math.random() * mockTexts.length);
    return mockTexts[randomIndex];
  }
}

module.exports = new ASRService();
