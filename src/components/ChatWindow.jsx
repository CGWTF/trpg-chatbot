import { useEffect, useRef } from 'react';
import Message from './Message';

export default function ChatWindow({ messages, streamingText, isStreaming, onImageGenerate }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingText]);

  const isWelcome = messages.length === 1 && messages[0].type === 'bot';

  return (
    <div className="chat-window">
      <div className="chat-messages">
        {isWelcome && (
          <div className="welcome-message">
            <div className="welcome-icon">🐉</div>
            <h2>欢迎来到跑团故事机</h2>
            <p>你的守秘人已就位</p>
            <div className="welcome-features">
              <div className="welcome-feature">
                <span>🐉</span> 互动叙事 — AI 驱动 TRPG 跑团，动态剧情分支
              </div>
              <div className="welcome-feature">
                <span>🎲</span> 检定系统 — 六维属性 + d20 检定 + 分级判定
              </div>
              <div className="welcome-feature">
                <span>🎒</span> 道具/线索/场所 — 自动记录，持久保存
              </div>
              <div className="welcome-feature">
                <span>🕵️</span> 调查工作台 — 推理板 + 人物关系图谱
              </div>
            </div>
            <p className="welcome-hint">点击右上角 📜 开始新冒险，创建你的角色卡</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message
            key={i}
            msg={{ ...msg, _index: i }}
            onImageGenerate={onImageGenerate}
          />
        ))}

        {/* AI 流式输出中的文字 */}
        {isStreaming && streamingText && (
          <div className="message message-bot">
            <div className="message-avatar">🐉</div>
            <div className="message-content">
              <div className="message-sender">
                跑团故事机
                <span className="message-time streaming-dot">正在书写...</span>
              </div>
              <div
                className="message-text streaming-text"
                dangerouslySetInnerHTML={{ __html: formatStreamingText(streamingText) }}
              />
            </div>
          </div>
        )}

        {/* AI 思考中但没有文字 */}
        {isStreaming && !streamingText && (
          <div className="message message-bot">
            <div className="message-avatar">🐉</div>
            <div className="message-content">
              <div className="message-text thinking-text">
                <span className="thinking-dot">🐉 思考中</span>
                <span className="dot-anim">...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatStreamingText(text) {
  // 先转义 HTML 防止 XSS，再做 markdown 替换
  return escapeHtml(stripReasoningBlock(text))
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

function stripReasoningBlock(text) {
  return text
    .replace(/<TRPG_EVENTS>[\s\S]*?<\/TRPG_EVENTS>/gi, '')
    .replace(/<TRPG_STATE>[\s\S]*?<\/TRPG_STATE>/gi, '')
    .replace(/<TRPG_REASONING>[\s\S]*?<\/TRPG_REASONING>/gi, '')
    .replace(/<TRPG_KNOWLEDGE>[\s\S]*?<\/TRPG_KNOWLEDGE>/gi, '')
    .trim();
}
