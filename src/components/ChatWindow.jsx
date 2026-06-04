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
            <p>我是你的冒险向导，可以帮你:</p>
            <div className="welcome-features">
              <div className="welcome-feature">
                <span>🎲</span> 投骰子 — 输入 <code>/r 2d6+1</code> 或点击下方快速按钮
              </div>
              <div className="welcome-feature">
                <span>📖</span> 查规则 — 直接提问，如"AC怎么算"、"先攻规则"
              </div>
              <div className="welcome-feature">
                <span>📖</span> 互动故事 — 说"开始冒险"，AI作为GM带你进入故事
              </div>
              <div className="welcome-feature">
                <span>🖼️</span> 场景配图 — 点 GM 回复下的"生成配图"或输入 <code>/image 描述</code>
              </div>
              <div className="welcome-feature">
                <span>🎭</span> 扮演灵感 — 输入 <code>/rp</code> 获取随机提示
              </div>
            </div>
            <p className="welcome-hint">试着问我一个问题，或者说"开始冒险"来体验互动故事吧！</p>
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
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}
