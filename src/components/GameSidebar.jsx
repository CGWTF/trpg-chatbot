const STAT_LABELS = {
  STR: '💪 力量', DEX: '🏃 敏捷', CON: '❤️ 体质',
  INT: '🧠 智力', WIS: '👁️ 感知', CHA: '🎭 魅力',
};

const BASE = 10;

export default function GameSidebar({
  isOpen,
  onClose,
  stats,
  onChange,
  pointLimit,
  onPointLimitChange,
  characterName,
  onCharacterNameChange,
  gameState,
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
          <h3>🎮 角色状态</h3>
          <button className="sidebar-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="game-sidebar-body">
          {/* 角色名 */}
          <div className="sidebar-section">
            <label className="sidebar-label">🧑 角色名</label>
            <input
              type="text"
              className="sidebar-name-input"
              value={characterName}
              onChange={(e) => onCharacterNameChange(e.target.value)}
              maxLength={20}
              placeholder="冒险者"
            />
          </div>

          {/* 加点追踪 */}
          <div className="sidebar-section">
            <div className="sidebar-points-row">
              <span className="sidebar-label">🎯 可用加点</span>
              <span className={`sidebar-points ${remaining < 0 ? 'over' : remaining === 0 ? 'empty' : ''}`}>
                {remaining}
              </span>
              <span>/</span>
              <input
                type="number"
                className="sidebar-points-input"
                value={pointLimit}
                onChange={(e) => onPointLimitChange(Math.max(0, parseInt(e.target.value) || 20))}
                min={0}
                max={60}
              />
            </div>
          </div>

          {/* 六维属性 */}
          <div className="sidebar-section">
            <span className="sidebar-label">📊 属性</span>
            {Object.entries(STAT_LABELS).map(([key, label]) => {
              const bonus = stats[key] || 0;
              const attr = BASE + bonus;
              return (
                <div key={key} className="stat-row">
                  <span className="stat-label">{label}</span>
                  <span className="stat-base">{BASE}</span>
                  <span className="stat-plus">+</span>
                  <input
                    type="number"
                    className="stat-input"
                    value={bonus}
                    onChange={(e) => updateStat(key, e.target.value)}
                    min={0}
                    max={10}
                  />
                  <span className="stat-eq">=</span>
                  <span className="stat-attr">{attr}</span>
                  {bonus > 0 && <span className="stat-mod">+{bonus}</span>}
                </div>
              );
            })}
          </div>

          {/* HP / SP */}
          {gameState && (
            <div className="sidebar-section">
              <span className="sidebar-label">❤️💎 生命 / 魔力</span>
              <div className="hp-sp-row">
                <span className="hp-sp-label">❤️</span>
                <div className="hp-sp-bar-bg">
                  <div className="hp-sp-bar hp" style={{ width: `${Math.max(0, (gameState.hp / gameState.maxHp) * 100)}%` }} />
                </div>
                <span className="hp-sp-val">{gameState.hp}/{gameState.maxHp}</span>
              </div>
              <div className="hp-sp-row">
                <span className="hp-sp-label">💎</span>
                <div className="hp-sp-bar-bg">
                  <div className="hp-sp-bar sp" style={{ width: `${Math.max(0, (gameState.sp / gameState.maxSp) * 100)}%` }} />
                </div>
                <span className="hp-sp-val">{gameState.sp}/{gameState.maxSp}</span>
              </div>
            </div>
          )}

          {/* 位置 */}
          {gameState?.location && (
            <div className="sidebar-section">
              <span className="sidebar-label">📍 当前位置</span>
              <div className="sidebar-text">{gameState.location}</div>
            </div>
          )}

          {/* 背包 */}
          {gameState && gameState.inventory && gameState.inventory.length > 0 && (
            <div className="sidebar-section">
              <span className="sidebar-label">🎒 道具 ({gameState.inventory.length})</span>
              <ul className="sidebar-list">
                {gameState.inventory.map((item, i) => (
                  <li key={i} className="sidebar-list-item inventory-item">{item}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 线索 */}
          {gameState && gameState.clues && gameState.clues.length > 0 && (
            <div className="sidebar-section">
              <span className="sidebar-label">🔍 线索日志 ({gameState.clues.length})</span>
              <ul className="sidebar-list">
                {gameState.clues.map((clue, i) => (
                  <li key={i} className="sidebar-list-item clue-item-sidebar">{clue}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 场所 */}
          {gameState && gameState.locations && gameState.locations.length > 0 && (
            <div className="sidebar-section">
              <span className="sidebar-label">🏛️ 已知场所 ({gameState.locations.length})</span>
              <ul className="sidebar-list">
                {gameState.locations.map((loc, i) => (
                  <li key={i} className="sidebar-list-item location-item">{loc}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 空状态提示 */}
          {(!gameState || (gameState.inventory?.length === 0 && gameState.clues?.length === 0 && gameState.locations?.length === 0)) && (
            <div className="sidebar-section sidebar-empty">
              🎒 暂无道具  ·  🔍 暂无线索  ·  🏛️ 暂无场所
              <div className="sidebar-empty-hint">道具和线索会随着冒险自动记录</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
