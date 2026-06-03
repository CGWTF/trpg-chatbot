import { useState, useRef, useEffect } from 'react';

export default function ChatInput({ onSend, disabled }) {
  const [input, setInput] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;
    onSend(input.trim());
    setInput('');
    inputRef.current?.focus();
  };

  const handleQuickDice = (notation) => {
    onSend(`/r ${notation}`);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="chat-input-container">
      <div className="quick-dice">
        <span className="quick-dice-label">🎲 快速投骰:</span>
        <button onClick={() => handleQuickDice('d20')} title="d20 检定">d20</button>
        <button onClick={() => handleQuickDice('d100')} title="d100 百分骰">d100</button>
        <button onClick={() => handleQuickDice('2d6')} title="2d6">2d6</button>
        <button onClick={() => handleQuickDice('3d6')} title="3d6">3d6</button>
        <button onClick={() => handleQuickDice('1d8')} title="1d8 伤害">1d8</button>
        <button onClick={() => handleQuickDice('4d6')} title="4d6">4d6</button>
        <button onClick={() => handleQuickDice('1d20+5')} title="d20+5">d20+5</button>
      </div>

      <form className="input-form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="chat-input"
          placeholder="输入消息... /r 投骰 /help 帮助 /rp 扮演提示"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
        />
        <button type="submit" className="send-button" disabled={disabled || !input.trim()}>
          📨 发送
        </button>
      </form>
    </div>
  );
}
