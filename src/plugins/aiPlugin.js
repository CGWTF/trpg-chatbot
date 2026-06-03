/**
 * AI 故事引擎插件
 * 生命周期: fallback, beforeAIRequest, afterAIResponse
 */

const API_URL = 'http://localhost:3001/api/chat';

export default function createAIPlugin({ apiKey, getMessages, onStreamStart, onStreamChunk, onStreamEnd, onError }) {
  return {
    name: 'ai',

    // 所有非骰子非规则的消息，走到这里作为 AI 对话
    fallback(input) {
      if (!apiKey) {
        onError?.('⚠️ **需要设置 API Key 才能使用故事模式！**\n\n请点击右上角的 ⚙️ 设置按钮，输入你的 DeepSeek API Key。');
        return false;
      }
      // 返回特殊标记，让调用方知道需要异步处理 AI
      return { text: input, type: 'ai-request', source: 'ai' };
    },

    // 发送 AI 请求并流式读取
    async sendToAI(userText, abortController) {
      if (!apiKey) return null;

      const chatMessages = getMessages()
        .filter(m => m.type === 'user' || m.type === 'bot')
        .map(m => ({ type: m.type === 'user' ? 'user' : 'assistant', text: m.text }));
      chatMessages.push({ type: 'user', text: userText });

      // beforeAIRequest 钩子
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

        return full || '(AI 没有返回内容)';
      } catch (err) {
        if (err.name === 'AbortError') {
          onStreamEnd?.(true); // aborted
        } else {
          onError?.(`❌ 故事引擎连接失败: ${err.message}`);
        }
        return null;
      }
    },
  };
}
