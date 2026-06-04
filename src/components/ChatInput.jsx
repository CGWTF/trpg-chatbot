import { useState, useRef, useEffect } from 'react';
import { getStatName } from '../utils/rollContext';

const QUICK_CHECKS = [
  { label: '察觉', stat: 'WIS', desc: '感知(察觉)' },
  { label: '潜行', stat: 'DEX', desc: '敏捷(潜行)' },
  { label: '说服', stat: 'CHA', desc: '魅力(说服)' },
  { label: '运动', stat: 'STR', desc: '力量(运动)' },
  { label: '调查', stat: 'INT', desc: '智力(调查)' },
  { label: '先攻', stat: 'DEX', desc: '先攻检定' },
];

export default function ChatInput({ onSend, disabled, pendingRollRequest, charStats, onQuickRoll }) {
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
      {pendingRollRequest && (
        <div className="roll-request-banner">
          ⚡ AI 请求检定: <strong>{pendingRollRequest.skill}</strong>
          {' '}({getStatName(pendingRollRequest.stat)}) — DC {pendingRollRequest.dc}
        </div>
      )}

      {/* 快速检定：角色属性相关，有加值，AI 请求检定时高亮 */}
      {onQuickRoll && (
        <div className="quick-checks-row">
          <span className="quick-dice-label">⚡ 快速检定:</span>
          {QUICK_CHECKS.map((check) => {
            const mod = (charStats && charStats[check.stat]) || 0;
            const isHighlighted = pendingRollRequest && pendingRollRequest.stat === check.stat;
            return (
              <button
                key={check.label}
                className={`quick-check-btn ${isHighlighted ? 'roll-highlight' : ''}`}
                onClick={() => onQuickRoll(check)}
                title={`d20${mod >= 0 ? '+' : ''}${mod} ${check.desc}`}
              >
                {check.label} {mod !== 0 ? `(${mod > 0 ? '+' : ''}${mod})` : ''}
              </button>
            );
          })}
          <button
            className={`quick-check-btn quick-check-attack ${pendingRollRequest && pendingRollRequest.stat === 'STR' ? 'roll-highlight' : ''}`}
            onClick={() => onQuickRoll({ label: '攻击', stat: 'STR', desc: '攻击检定' })}
            title={`d20${(charStats && charStats.STR || 0) >= 0 ? '+' : ''}${charStats && charStats.STR || 0} 攻击检定`}
          >
            ⚔️ 攻击 {((charStats && charStats.STR) || 0) !== 0 ? `(${(charStats && charStats.STR || 0) > 0 ? '+' : ''}${charStats && charStats.STR || 0})` : ''}
          </button>
        </div>
      )}

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
