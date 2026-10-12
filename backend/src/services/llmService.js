const axios = require('axios');

/**
 * LLM服务 - 智能对话生成
 * 使用DeepSeek API
 */
class LLMService {
  constructor() {
    this.apiKey = process.env.DEEPSEEK_API_KEY;
    this.baseUrl = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';
    
    // 系统提示词 - 定义数字人的通用性格
    this.systemPrompt = `你是一个友好、热情的AI助手。你的特点是：
1. 说话自然流畅，像真人一样有温度
2. 善于倾听和理解对方的感受
3. 回答简洁明了，不过于冗长
4. 适当使用口语化表达，避免过于正式
5. 在合适的时候表达关心和鼓励

请根据用户的输入，给出自然、温暖的回复。`;
  }

  /**
   * 生成对话回复
   * @param {string} userText - 用户输入的文本
   * @returns {Promise<string>} LLM生成的回复
   */
  async generateReply(userText) {
    try {
      if (!this.apiKey || this.apiKey === 'your_deepseek_api_key_here') {
        console.warn('DeepSeek API Key未配置，使用Mock数据');
        return this.getMockReply(userText);
      }

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: userText }
          ],
          temperature: 0.7,
          max_tokens: 500
        },
        {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.data && response.data.choices && response.data.choices[0]) {
        return response.data.choices[0].message.content.trim();
      } else {
        throw new Error('DeepSeek返回数据格式异常');
      }
    } catch (error) {
      console.error('DeepSeek API调用失败:', error.message);
      
      // API调用失败时使用Mock数据
      console.log('使用Mock数据进行调试...');
      return this.getMockReply(userText);
    }
  }

  /**
   * Mock回复 - 用于API未配置或调用失败时的调试
   */
  getMockReply(userText) {
    const replies = [
      '你说得对，这确实是个有趣的话题！',
      '我理解你的想法，让我来分享一下我的观点。',
      '这个问题很有意思，我觉得可以从几个角度来看。',
      '谢谢你的分享，我也很有感触。',
      '嗯，我明白你的意思了。你觉得这样怎么样？'
    ];
    const randomIndex = Math.floor(Math.random() * replies.length);
    return replies[randomIndex];
  }
}

module.exports = new LLMService();
