const STAT_LABELS = {
  STR: '💪 力量', DEX: '🏃 敏捷', CON: '❤️ 体质',
  INT: '🧠 智力', WIS: '👁️ 感知', CHA: '🎭 魅力',
};

const BASE = 10; // 固定基础属性值

const QUICK_CHECKS = [
  { label: '察觉', stat: 'WIS', desc: '感知(察觉)' },
  { label: '潜行', stat: 'DEX', desc: '敏捷(潜行)' },
  { label: '说服', stat: 'CHA', desc: '魅力(说服)' },
  { label: '运动', stat: 'STR', desc: '力量(运动)' },
  { label: '调查', stat: 'INT', desc: '智力(调查)' },
  { label: '先攻', stat: 'DEX', desc: '先攻检定' },
];

export default function CharPanel({ stats, onChange, pointLimit, onPointLimitChange, onQuickRoll, isOpen, onToggle }) {
  // 已用加值点数
  const usedPoints = Object.values(stats).reduce((sum, v) => sum + Math.max(0, parseInt(v) || 0), 0);
  const remaining = pointLimit - usedPoints;

  const updateStat = (key, value) => {
    const newVal = Math.max(0, parseInt(value) || 0);
    const otherSum = Object.entries(stats).reduce((sum, [k, v]) => {
      return k === key ? sum : sum + Math.max(0, parseInt(v) || 0);
    }, 0);
    const clamped = Math.min(newVal, pointLimit - otherSum);
    onChange({ ...stats, [key]: clamped });
  };

  return (
    <div className={`char-panel-wrapper ${isOpen ? 'open' : ''}`}>
      <button className="char-panel-toggle" onClick={onToggle}>
        📋 {isOpen ? '收起属性' : '角色属性'}
      </button>

      {isOpen && (
        <div className="char-panel">
          {/* 点数追踪 */}
          <div className="char-points-bar">
            <span className="char-points-label">🎯 可用加点:</span>
            <span className={`char-points-value ${remaining < 0 ? 'over' : remaining === 0 ? 'empty' : ''}`}>
              {remaining}
            </span>
            <span className="char-points-sep">/</span>
            <input
              type="number"
              className="char-point-limit-input"
              value={pointLimit}
              onChange={(e) => onPointLimitChange(Math.max(0, parseInt(e.target.value) || 20))}
              min={0}
              max={60}
              title="加点上限"
            />
          </div>

          {/* 属性条 */}
          <div className="char-stats">
            {Object.entries(STAT_LABELS).map(([key, label]) => {
              const bonus = stats[key] || 0;
              const attr = BASE + bonus;
              return (
                <div key={key} className="char-stat-item">
                  <span className="char-stat-label">{label}</span>
                  <span className="char-stat-base">{BASE}</span>
                  <span className="char-stat-plus">+</span>
                  <input
                    type="number"
                    className="char-stat-input"
                    value={bonus}
                    onChange={(e) => updateStat(key, e.target.value)}
                    min={0}
                    max={10}
                  />
                  <span className="char-stat-eq">=</span>
                  <span className="char-stat-attr">{attr}</span>
                  <span className={`char-stat-mod ${bonus > 0 ? 'positive' : ''}`}>
                    {bonus > 0 ? `+${bonus}` : ''}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 快速检定 */}
          <div className="char-quick-checks">
            <span className="quick-check-label">⚡ 快速检定:</span>
            {QUICK_CHECKS.map((check) => {
              const mod = stats[check.stat] || 0;
              return (
                <button
                  key={check.label}
                  className="quick-check-btn"
                  onClick={() => onQuickRoll(check)}
                  title={`d20${mod >= 0 ? '+' : ''}${mod} ${check.desc}`}
                >
                  {check.label} (d20{mod >= 0 ? '+' : ''}{mod})
                </button>
              );
            })}
            <button
              className="quick-check-btn quick-check-attack"
              onClick={() => onQuickRoll({ label: '攻击', stat: 'STR', desc: '攻击检定' })}
            >
              ⚔️ 攻击 (d20{(stats.STR || 0) >= 0 ? '+' : ''}{stats.STR || 0})
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
