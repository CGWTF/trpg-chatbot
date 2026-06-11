const STAT_LABELS = {
  STR: '💪 力量', DEX: '🏃 敏捷', CON: '❤️ 体质',
  INT: '🧠 智力', WIS: '👁️ 感知', CHA: '🎭 魅力',
};

const BASE = 10;

export default function GameSidebar({
  isOpen, onClose, stats, onChange, pointLimit, onPointLimitChange,
  characterName, onCharacterNameChange, gameState, onOpenReasoning,
}) {
  if (!isOpen) return null;

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
    <div className="sidebar-overlay" onClick={onClose}>
      <div className="game-sidebar" onClick={(e) => e.stopPropagation()}>
        <div className="sidebar-header">
          <h3>🎮 角色</h3>
          <button className="sidebar-close-btn" onClick={onClose}>✕</button>
        </div>
        <div className="game-sidebar-body">
          <div className="sidebar-section">
            <label className="sidebar-label">🧑 角色名</label>
            <input type="text" className="sidebar-name-input" value={characterName}
              onChange={(e) => onCharacterNameChange(e.target.value)} maxLength={20} placeholder="冒险者" />
          </div>

          <div className="sidebar-points-row" style={{ padding: '4px 0', alignItems: 'center', gap: 8 }}>
            <span className="sidebar-label" style={{ marginBottom: 0 }}>🎯 加点</span>
            <span className={`sidebar-points ${remaining < 0 ? 'over' : remaining === 0 ? 'empty' : ''}`}>{remaining}</span>
            <span style={{ color: 'var(--text-muted)' }}>/</span>
            <input type="number" className="sidebar-points-input" value={pointLimit}
              onChange={(e) => onPointLimitChange(Math.max(0, parseInt(e.target.value) || 20))} min={0} max={60} />
          </div>

          <div className="sidebar-section">
            {Object.entries(STAT_LABELS).map(([key, label]) => {
              const bonus = stats[key] || 0;
              return (
                <div key={key} className="stat-row">
                  <span className="stat-label">{label}</span>
                  <span className="stat-base">{BASE}</span>
                  <span className="stat-plus">+</span>
                  <input type="number" className="stat-input" value={bonus}
                    onChange={(e) => updateStat(key, e.target.value)} min={0} max={10} />
                  <span className="stat-eq">=</span>
                  <span className="stat-attr">{BASE + bonus}</span>
                  {bonus > 0 && <span className="stat-mod">+{bonus}</span>}
                </div>
              );
            })}
          </div>

          {gameState && (
            <div className="sidebar-section">
              <div className="hp-sp-row">
                <span className="hp-sp-label">❤️</span>
                <div className="hp-sp-bar-bg"><div className="hp-sp-bar hp"
                  style={{ width: `${Math.max(0, (gameState.hp / gameState.maxHp) * 100)}%` }} /></div>
                <span className="hp-sp-val">{gameState.hp}/{gameState.maxHp}</span>
              </div>
              <div className="hp-sp-row" style={{ marginTop: 4 }}>
                <span className="hp-sp-label">💎</span>
                <div className="hp-sp-bar-bg"><div className="hp-sp-bar sp"
                  style={{ width: `${Math.max(0, (gameState.sp / gameState.maxSp) * 100)}%` }} /></div>
                <span className="hp-sp-val">{gameState.sp}/{gameState.maxSp}</span>
              </div>
            </div>
          )}

          {gameState?.location && (
            <div className="sidebar-section">
              <span className="sidebar-label">📍 当前位置</span>
              <div className="sidebar-text">{gameState.location}</div>
            </div>
          )}

          {onOpenReasoning && (
            <button className="new-story-btn" onClick={() => { onOpenReasoning(); onClose(); }}
              style={{ margin: '8px 0 0', width: '100%' }}>
              🕵️ 打开调查工作台
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
