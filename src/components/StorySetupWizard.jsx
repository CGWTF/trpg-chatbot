import { useState } from 'react';

const STAT_LABELS = {
  STR: '💪 力量', DEX: '🏃 敏捷', CON: '❤️ 体质',
  INT: '🧠 智力', WIS: '👁️ 感知', CHA: '🎭 魅力',
};

const SCALES = [
  { key: 'small', label: '🏕️ 小型冒险', rounds: 150, desc: '紧凑剧情，5~7个转折，适合短篇故事' },
  { key: 'medium', label: '🏰 中型冒险', rounds: 220, desc: '标准跑团体验，丰富支线与角色发展' },
  { key: 'large', label: '🌍 大型史诗', rounds: 300, desc: '宏大世界观，多势力博弈，长篇冒险' },
];

const PACING_TIERS = {
  small:  { early: 80, mid: 110, late: 135, force: 150 },
  medium: { early: 120, mid: 160, late: 200, force: 220 },
  large:  { early: 180, mid: 230, late: 270, force: 300 },
};

function getPacingTiers(scale) {
  return PACING_TIERS[scale] || PACING_TIERS.medium;
}

export default function StorySetupWizard({ isOpen, onClose, onComplete, initialStats, initialName }) {
  const [page, setPage] = useState(1);
  const [name, setName] = useState(initialName || '');
  const [storyTitle, setStoryTitle] = useState('');
  const [gender, setGender] = useState('');
  const [age, setAge] = useState('');
  const [identity, setIdentity] = useState('');
  const [background, setBackground] = useState('');
  const [stats, setStats] = useState({ ...initialStats });
  const [pointLimit] = useState(20);
  const [scale, setScale] = useState('medium');

  if (!isOpen) return null;

  const usedPoints = Object.values(stats).reduce((sum, v) => sum + Math.max(0, parseInt(v) || 0), 0);
  const remaining = pointLimit - usedPoints;

  const updateStat = (key, value) => {
    const newVal = Math.max(0, parseInt(value) || 0);
    const otherSum = Object.entries(stats).reduce((sum, [k, v]) => {
      return k === key ? sum : sum + Math.max(0, parseInt(v) || 0);
    }, 0);
    const clamped = Math.min(newVal, pointLimit - otherSum);
    setStats({ ...stats, [key]: clamped });
  };

  const handleComplete = () => {
    onComplete({
      storyTitle: storyTitle.trim() || `${name}的冒险`,
      character: { name, gender, age, identity, background, stats, pointLimit },
      scale,
      pacing: getPacingTiers(scale),
    });
    onClose();
  };

  const canNext = page === 1 ? name.trim() && remaining >= 0 : true;

  return (
    <div className="sidebar-overlay" onClick={onClose}>
      <div className="setup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="sidebar-header">
          <h3>📜 新冒险 — {page === 1 ? '角色创建' : '故事规模'}</h3>
          <button className="sidebar-close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="setup-body">
          {page === 1 ? (
            <>
              <div className="setup-grid">
                <div className="setup-field">
                  <label>🧑 角色名</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} maxLength={20} placeholder="冒险者" />
                </div>
                <div className="setup-field">
                  <label>⚧ 性别</label>
                  <select value={gender} onChange={(e) => setGender(e.target.value)}>
                    <option value="">选择...</option>
                    <option value="male">男</option>
                    <option value="female">女</option>
                    <option value="other">其他</option>
                  </select>
                </div>
                <div className="setup-field">
                  <label>🎂 年龄</label>
                  <input type="text" value={age} onChange={(e) => setAge(e.target.value)} maxLength={10} placeholder="如: 28 / 青年" />
                </div>
                <div className="setup-field">
                  <label>🎭 身份</label>
                  <input type="text" value={identity} onChange={(e) => setIdentity(e.target.value)} maxLength={30} placeholder="如: 流浪剑客 / 宫廷密探" />
                </div>
              </div>
              <div className="setup-field" style={{ marginTop: 8 }}>
                <label>📜 冒险名称</label>
                <input type="text" value={storyTitle} onChange={(e) => setStoryTitle(e.target.value)} maxLength={30} placeholder="如: 凯尔敏的阴影 / 留空则自动生成" />
              </div>
              <div className="setup-field" style={{ marginTop: 4 }}>
                <label>📖 游戏背景</label>
                <textarea value={background} onChange={(e) => setBackground(e.target.value)} maxLength={200}
                  placeholder="描述故事世界观、时代背景、初始场景……（可选，留空则由 AI 自由发挥）" rows={3} />
              </div>

              <div className="setup-divider" />

              <div className="setup-points-row">
                <span>🎯 属性加点 (剩余 {remaining})</span>
              </div>
              <div className="setup-stats-grid">
                {Object.entries(STAT_LABELS).map(([key, label]) => (
                  <div key={key} className="setup-stat-row">
                    <span>{label}</span>
                    <input type="number" value={stats[key] || 0}
                      onChange={(e) => updateStat(key, e.target.value)} min={0} max={10} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="setup-desc">选择故事规模决定对话轮次上限和节奏推进速度。</p>
              {SCALES.map((s) => (
                <div key={s.key}
                  className={`setup-scale-card ${scale === s.key ? 'selected' : ''}`}
                  onClick={() => setScale(s.key)}
                >
                  <div className="setup-scale-header">
                    <strong>{s.label}</strong>
                    <span>~{s.rounds} 轮</span>
                  </div>
                  <p>{s.desc}</p>
                  {scale === s.key && (
                    <div className="setup-pacing">
                      {[
                        { label: '节奏提示', at: getPacingTiers(s.key).early },
                        { label: '终章预备', at: getPacingTiers(s.key).mid },
                        { label: '强制终章', at: getPacingTiers(s.key).late },
                        { label: '最终收束', at: getPacingTiers(s.key).force },
                      ].map((t) => (
                        <span key={t.label} className="pacing-dot">{t.label} ~{t.at}轮</span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <div className="setup-footer">
          {page === 2 && (
            <button className="setup-btn secondary" onClick={() => setPage(1)}>← 上一步</button>
          )}
          <div className="setup-spacer" />
          {page === 1 ? (
            <button className="setup-btn primary" onClick={() => setPage(2)} disabled={!canNext}>
              下一步 →
            </button>
          ) : (
            <button className="setup-btn primary" onClick={handleComplete}>
              ✨ 开始冒险
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
