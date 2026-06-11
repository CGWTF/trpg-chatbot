import { useState } from 'react';

const STAT_LABELS = {
  STR: '💪 力量', DEX: '🏃 敏捷', CON: '❤️ 体质',
  INT: '🧠 智力', WIS: '👁️ 感知', CHA: '🎭 魅力',
};

const BASE = 10;

function FoldSection({ title, badge, children, defaultOpen = false, onClear }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="fold-section">
      <div className="fold-header" onClick={() => setOpen(!open)}>
        <span className="fold-arrow">{open ? '▼' : '▶'}</span>
        <span className="fold-title">{title}</span>
        {badge != null && <span className="fold-badge">{badge}</span>}
        {onClear && (
          <button className="sidebar-clear-btn" onClick={(e) => { e.stopPropagation(); onClear(); }} title="清空">
            🗑️
          </button>
        )}
      </div>
      {open && <div className="fold-body">{children}</div>}
    </div>
  );
}

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
  setGameState,
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

  const invLen = gameState?.inventory?.length || 0;
  const clueLen = gameState?.clues?.length || 0;
  const locLen = gameState?.locations?.length || 0;

  return (
    <div className="sidebar-overlay" onClick={onClose}>
      <div className="game-sidebar" onClick={(e) => e.stopPropagation()}>
        <div className="sidebar-header">
          <h3>🎮 角色状态</h3>
          <button className="sidebar-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="game-sidebar-body">
          {/* 角色名 + 属性（始终展开） */}
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

          <FoldSection title="📊 属性" badge={remaining} defaultOpen>
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
          </FoldSection>

          {/* HP/SP */}
          {gameState && (
            <FoldSection title="❤️💎 生命 / 魔力" defaultOpen>
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
            </FoldSection>
          )}

          {/* 位置 */}
          {gameState?.location && (
            <div className="sidebar-section">
              <span className="sidebar-label">📍 当前位置</span>
              <div className="sidebar-text">{gameState.location}</div>
            </div>
          )}

          {/* 🎒 道具 */}
          <FoldSection
            title="🎒 道具"
            badge={invLen}
            defaultOpen={invLen > 0}
            onClear={() => setGameState((p) => ({ ...p, inventory: [] }))}
          >
            {invLen > 0 ? (
              <ul className="sidebar-list">
                {gameState.inventory.map((item, i) => (
                  <li key={i} className="sidebar-list-item inventory-item">{item}</li>
                ))}
              </ul>
            ) : (
              <div className="sidebar-empty-hint">暂无道具，冒险中会自动记录</div>
            )}
          </FoldSection>

          {/* 🔍 线索 */}
          <FoldSection
            title="🔍 线索日志"
            badge={clueLen}
            defaultOpen={clueLen > 0}
            onClear={() => setGameState((p) => ({ ...p, clues: [] }))}
          >
            {clueLen > 0 ? (
              <ul className="sidebar-list">
                {gameState.clues.map((clue, i) => (
                  <li key={i} className="sidebar-list-item clue-item-sidebar">{clue}</li>
                ))}
              </ul>
            ) : (
              <div className="sidebar-empty-hint">暂无线索，发现时会自动记录</div>
            )}
          </FoldSection>

          {/* 🏛️ 场所 */}
          <FoldSection
            title="🏛️ 已知场所"
            badge={locLen}
            defaultOpen={locLen > 0}
            onClear={() => setGameState((p) => ({ ...p, locations: [] }))}
          >
            {locLen > 0 ? (
              <ul className="sidebar-list">
                {gameState.locations.map((loc, i) => (
                  <li key={i} className="sidebar-list-item location-item">{loc}</li>
                ))}
              </ul>
            ) : (
              <div className="sidebar-empty-hint">暂无场所，探索时会自动记录</div>
            )}
          </FoldSection>
        </div>
      </div>
    </div>
  );
}
