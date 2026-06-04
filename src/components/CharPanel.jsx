const STAT_LABELS = {
  STR: '💪 力量', DEX: '🏃 敏捷', CON: '❤️ 体质',
  INT: '🧠 智力', WIS: '👁️ 感知', CHA: '🎭 魅力',
};

const BASE = 10; // 固定基础属性值

export default function CharPanel({ stats, onChange, pointLimit, onPointLimitChange, isOpen, onToggle, gameState }) {
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

          {/* 角色状态 (HP/SP/位置/背包) */}
          {gameState && (
            <div className="game-state-section">
              <div className="game-state-row">
                <span className="game-state-label">❤️ HP:</span>
                <div className="game-state-bar-bg">
                  <div
                    className="game-state-bar hp"
                    style={{ width: `${Math.max(0, (gameState.hp / gameState.maxHp) * 100)}%` }}
                  />
                </div>
                <span className="game-state-val">{gameState.hp}/{gameState.maxHp}</span>
              </div>
              <div className="game-state-row">
                <span className="game-state-label">💎 SP:</span>
                <div className="game-state-bar-bg">
                  <div
                    className="game-state-bar sp"
                    style={{ width: `${Math.max(0, (gameState.sp / gameState.maxSp) * 100)}%` }}
                  />
                </div>
                <span className="game-state-val">{gameState.sp}/{gameState.maxSp}</span>
              </div>
              {gameState.location && (
                <div className="game-state-row">
                  <span className="game-state-label">📍 位置:</span>
                  <span className="game-state-text">{gameState.location}</span>
                </div>
              )}
              {gameState.inventory && gameState.inventory.length > 0 && (
                <div className="game-state-row">
                  <span className="game-state-label">🎒 背包:</span>
                  <span className="game-state-text">{gameState.inventory.join(' · ')}</span>
                </div>
              )}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
