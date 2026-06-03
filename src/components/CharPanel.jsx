import { useState } from 'react';

const DEFAULT_STATS = {
  STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0,
};

const STAT_LABELS = {
  STR: '💪 力量', DEX: '🏃 敏捷', CON: '❤️ 体质',
  INT: '🧠 智力', WIS: '👁️ 感知', CHA: '🎭 魅力',
};

const QUICK_CHECKS = [
  { label: '察觉', stat: 'WIS', desc: '感知(察觉)' },
  { label: '潜行', stat: 'DEX', desc: '敏捷(潜行)' },
  { label: '说服', stat: 'CHA', desc: '魅力(说服)' },
  { label: '运动', stat: 'STR', desc: '力量(运动)' },
  { label: '调查', stat: 'INT', desc: '智力(调查)' },
  { label: '先攻', stat: 'DEX', desc: '先攻检定' },
];

export default function CharPanel({ stats, onChange, onQuickRoll, isOpen, onToggle }) {
  const updateStat = (key, value) => {
    const v = parseInt(value) || 0;
    onChange({ ...stats, [key]: Math.max(-5, Math.min(10, v)) });
  };

  return (
    <div className={`char-panel-wrapper ${isOpen ? 'open' : ''}`}>
      <button className="char-panel-toggle" onClick={onToggle}>
        📋 {isOpen ? '收起属性' : '角色属性'}
      </button>

      {isOpen && (
        <div className="char-panel">
          <div className="char-stats">
            {Object.entries(STAT_LABELS).map(([key, label]) => (
              <div key={key} className="char-stat-item">
                <span className="char-stat-label">{label}</span>
                <input
                  type="number"
                  className="char-stat-input"
                  value={stats[key] || 0}
                  onChange={(e) => updateStat(key, e.target.value)}
                  min={-5}
                  max={10}
                />
                <span className="char-stat-mod">
                  {stats[key] >= 0 ? '+' : ''}{stats[key]}
                </span>
              </div>
            ))}
          </div>

          <div className="char-quick-checks">
            <span className="quick-check-label">⚡ 快速检定:</span>
            {QUICK_CHECKS.map((check) => (
              <button
                key={check.label}
                className="quick-check-btn"
                onClick={() => onQuickRoll(check)}
                title={`d20${stats[check.stat] >= 0 ? '+' : ''}${stats[check.stat]} ${check.desc}`}
              >
                {check.label} (d20{stats[check.stat] >= 0 ? '+' : ''}{stats[check.stat]})
              </button>
            ))}
            <button
              className="quick-check-btn quick-check-attack"
              onClick={() => onQuickRoll({ label: '攻击', stat: 'STR', desc: '攻击检定' })}
            >
              ⚔️ 攻击 (d20{stats.STR >= 0 ? '+' : ''}{stats.STR})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
