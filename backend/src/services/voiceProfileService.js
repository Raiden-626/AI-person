const fs = require('fs');
const path = require('path');

/**
 * 声音档案管理服务
 * 管理用户上传的参考音频，用于声音克隆
 */
class VoiceProfileService {
  constructor() {
    // 声音档案存储目录
    this.profilesDir = path.join(__dirname, '../../voice_profiles');
    
    // 确保目录存在
    if (!fs.existsSync(this.profilesDir)) {
      fs.mkdirSync(this.profilesDir, { recursive: true });
    }
    
    // 档案索引文件
    this.indexFile = path.join(this.profilesDir, 'profiles.json');
    this.profiles = this.loadProfiles();
  }

  /**
   * 加载档案索引
   */
  loadProfiles() {
    try {
      if (fs.existsSync(this.indexFile)) {
        const data = fs.readFileSync(this.indexFile, 'utf-8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('[VoiceProfile] 加载档案索引失败:', error);
    }
    return [];
  }

  /**
   * 保存档案索引
   */
  saveProfiles() {
    try {
      fs.writeFileSync(this.indexFile, JSON.stringify(this.profiles, null, 2));
    } catch (error) {
      console.error('[VoiceProfile] 保存档案索引失败:', error);
    }
  }

  /**
   * 创建声音档案
   * @param {string} name - 档案名称
   * @param {string} audioPath - 参考音频路径
   * @returns {Object} 档案信息
   */
  async createProfile(name, audioPath) {
    const id = `profile_${Date.now()}`;
    const ext = path.extname(audioPath);
    const fileName = `${id}${ext}`;
    const destPath = path.join(this.profilesDir, fileName);

    // 复制音频文件到档案目录
    fs.copyFileSync(audioPath, destPath);

    // 创建档案记录
    const profile = {
      id,
      name,
      audioFile: fileName,
      audioPath: destPath,
      createdAt: new Date().toISOString()
    };

    this.profiles.push(profile);
    this.saveProfiles();

    console.log(`[VoiceProfile] 创建档案: ${name} (${id})`);
    return profile;
  }

  /**
   * 获取所有档案
   */
  getAllProfiles() {
    return this.profiles;
  }

  /**
   * 根据 ID 获取档案
   */
  getProfileById(id) {
    return this.profiles.find(p => p.id === id);
  }

  /**
   * 删除档案
   */
  deleteProfile(id) {
    const index = this.profiles.findIndex(p => p.id === id);
    if (index === -1) {
      return false;
    }

    const profile = this.profiles[index];
    
    // 删除音频文件
    try {
      if (fs.existsSync(profile.audioPath)) {
        fs.unlinkSync(profile.audioPath);
      }
    } catch (error) {
      console.error(`[VoiceProfile] 删除音频文件失败: ${profile.audioPath}`);
    }

    // 从索引中移除
    this.profiles.splice(index, 1);
    this.saveProfiles();

    console.log(`[VoiceProfile] 删除档案: ${profile.name} (${id})`);
    return true;
  }
}

module.exports = new VoiceProfileService();
