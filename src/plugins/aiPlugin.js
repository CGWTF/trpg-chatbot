/**
 * AI 故事引擎插件
 * beforeSend: 无短路 (透传)
 * fallback: 所有未匹配消息走 AI
 * beforeAI / afterAI: AI 请求前后的生命周期
 *
 * v2: 不再依赖 getMessages 闭包 — sendToAI 直接接收消息列表
 */

const API_URL = 'http://localhost:3001/api/chat';

export default function createAIPlugin({ onStreamStart, onStreamChunk, onStreamEnd, onError }) {
  return {
    name: 'ai',

    /** 透传，不做拦截 */
    beforeSend(input) { return input; },

    /** afterSend 回调 */
    afterSend(input, result) { /* 可扩展 */ },

    /** AI 请求前 */
    beforeAI(messages) { return messages; },

    /** AI 回复后 */
    afterAI(text) { return text; },

    /** 默认处理 → 标记为 AI 请求 */
    fallback(input) {
      return { text: input, type: 'ai-request', source: 'ai' };
    },

    // pipeline 钩子：AI 请求前
    onBeforeAI(input) {
      onStreamStart?.();
      return input;
    },

    // pipeline 钩子：AI 请求后
    onAfterAI(text) {
      onStreamEnd?.(false);
      return text;
    },

    /**
     * 发送流式 AI 请求
     * @param {string} userText - 用户消息
     * @param {AbortController} abortController - 取消控制器
     * @param {object} options
     * @param {Array} options.messages - 当前对话消息列表（最新版，非 stale）
     * @param {string} options.apiKey - DeepSeek API Key
     */
    async sendToAI(userText, abortController, { messages, apiKey } = {}) {
      if (!apiKey) return null;

      let chatMessages = messages
        .filter(m => m.type === 'user' || m.type === 'bot')
        .map(m => ({ type: m.type === 'user' ? 'user' : 'assistant', text: m.text }));
      chatMessages.push({ type: 'user', text: userText });

      // beforeAI 钩子
      chatMessages = this.beforeAI(chatMessages);
      onStreamStart?.();

      try {
        const res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: chatMessages, apiKey }),
          signal: abortController.signal,
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: '未知错误' }));
          onError?.(`❌ ${err.error || `请求失败 (${res.status})`}`);
          return null;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let full = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          full += decoder.decode(value, { stream: true });
          onStreamChunk?.(full);
        }

        // afterAI 钩子
        full = this.afterAI(full) || full;
        return full || '(AI 没有返回内容)';
      } catch (err) {
        if (err.name === 'AbortError') {
          onStreamEnd?.(true);
        } else {
          onError?.(`❌ 故事引擎连接失败: ${err.message}`);
        }
        return null;
      }
    },
  };
}
