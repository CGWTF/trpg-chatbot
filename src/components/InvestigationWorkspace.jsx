import { useState } from 'react';
import React from 'react';

export default function InvestigationWorkspace({
  isOpen,
  onClose,
  gameState,
  setGameState,
  activeTab,
  onTabChange,
}) {
  if (!isOpen) return null;

  const hypotheses = gameState?.hypotheses || [];
  const graph = gameState?.knowledgeGraph || { entities: [], relations: [], analysis: {} };
  const people = graph.entities.filter((entity) => entity.type === 'person');

  return (
    <section className="investigation-workspace">
      <header className="investigation-header">
        <div>
          <h2>调查工作台</h2>
          <p>整理假设、证据与人物关系</p>
        </div>
        <button className="investigation-close-btn" onClick={onClose} title="关闭调查工作台">✕</button>
      </header>

      <nav className="investigation-tabs" aria-label="调查视图">
        <button
          className={activeTab === 'reasoning' ? 'active' : ''}
          onClick={() => onTabChange('reasoning')}
        >
          🧠 推理板 <span>{hypotheses.length}</span>
        </button>
        <button
          className={activeTab === 'relations' ? 'active' : ''}
          onClick={() => onTabChange('relations')}
        >
          🕸️ 人物关系 <span>{people.length}/{graph.relations.length}</span>
        </button>
      </nav>

      <main className="investigation-content">
        {activeTab === 'reasoning' ? (
          <ReasoningView
            hypotheses={hypotheses}
            onClear={() => setGameState((prev) => ({ ...prev, hypotheses: [] }))}
          />
        ) : (
          <RelationsView
            graph={graph}
            people={people}
            onClear={() => setGameState((prev) => ({
              ...prev,
              knowledgeGraph: {
                entities: [],
                relations: [],
                analysis: {},
                extractor: '',
                embeddingRecommended: false,
              },
            }))}
          />
        )}
      </main>

      {/* 道具 / 线索 / 场所（折叠面板，始终可见） */}
      <aside className="investigation-items">
        <FoldBox title="🎒 道具" count={gameState?.inventory?.length || 0}
          onClear={() => setGameState((p) => ({ ...p, inventory: [] }))}>
          {(gameState?.inventory || []).map((item, i) => <li key={i} className="sidebar-list-item inventory-item">{item}</li>)}
        </FoldBox>
        <FoldBox title="🔍 线索日志" count={gameState?.clues?.length || 0}
          onClear={() => setGameState((p) => ({ ...p, clues: [] }))}>
          {(gameState?.clues || []).map((clue, i) => <li key={i} className="sidebar-list-item clue-item-sidebar">{clue}</li>)}
        </FoldBox>
        <FoldBox title="🏛️ 已知场所" count={gameState?.locations?.length || 0}
          onClear={() => setGameState((p) => ({ ...p, locations: [] }))}>
          {(gameState?.locations || []).map((loc, i) => <li key={i} className="sidebar-list-item location-item">{loc}</li>)}
        </FoldBox>
      </aside>

    </section>
  );
}

function ReasoningView({ hypotheses, onClear }) {
  return (
    <div className="investigation-view">
      <ViewHeader title="推理假设" meta={`${hypotheses.length} 条`} onClear={hypotheses.length ? onClear : null} />
      {hypotheses.length ? (
        <div className="reasoning-grid">
          {hypotheses.map((hypothesis) => (
            <article key={hypothesis.id} className={`reasoning-card reasoning-${hypothesis.status}`}>
              <div className="reasoning-card-header">
                <h3>{hypothesis.statement}</h3>
                <strong>{hypothesis.confidence}%</strong>
              </div>
              <div className="reasoning-meter"><span style={{ width: `${hypothesis.confidence}%` }} /></div>
              <EvidenceColumn title="支持证据" items={hypothesis.evidence} type="support" />
              <EvidenceColumn title="反证" items={hypothesis.contradictions} type="against" />
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>发现多条相关线索后，会形成可追踪的推理假设。</EmptyState>
      )}
    </div>
  );
}

function RelationsView({ graph, people, onClear }) {
  return (
    <div className="investigation-view">
      <ViewHeader title="人物关系分析" meta={`${graph.entities.length} 个实体`} onClear={graph.entities.length ? onClear : null} />
      <div className="graph-stats">
        <Stat label="人物" value={people.length} />
        <Stat label="全部实体" value={graph.entities.length} />
        <Stat label="关系" value={graph.relations.length} />
        <Stat label="关系群组" value={graph.analysis?.componentCount || 0} />
      </div>

      {graph.entities.length ? (
        <div className="relations-layout">
          <section className="investigation-panel">
            <h3>关键人物</h3>
            <div className="central-person-list">
              {(graph.analysis?.centralEntities || []).map((entity, index) => (
                <div key={entity.entityId}>
                  <span>{index + 1}</span>
                  <strong>{entity.name}</strong>
                  <small>{Math.round(entity.score * 100)}%</small>
                </div>
              ))}
            </div>
          </section>
          <section className="investigation-panel relation-table-panel">
            <h3>关系记录</h3>
            <div className="relation-table">
              {graph.relations.map((relation) => (
                <div key={relation.id}>
                  <span>{entityName(graph.entities, relation.source)}</span>
                  <strong>{relation.type}</strong>
                  <span>{entityName(graph.entities, relation.target)}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <EmptyState>启动 NLP 服务后，重要人物、地点和关系会自动进入这里。</EmptyState>
      )}
      <p className="investigation-meta">
        抽取器：{graph.extractor || '等待 NLP 服务'}
        {graph.embeddingRecommended && ' · 当前规模建议启用 Embedding 检索'}
      </p>
    </div>
  );
}

function ViewHeader({ title, meta, onClear }) {
  return (
    <header className="investigation-view-header">
      <div><h3>{title}</h3><span>{meta}</span></div>
      {onClear && <button onClick={onClear} title={`清空${title}`}>清空</button>}
    </header>
  );
}

function EvidenceColumn({ title, items, type }) {
  return (
    <div className={`reasoning-evidence reasoning-evidence-${type}`}>
      <h4>{title}</h4>
      {items.length ? items.map((item) => <p key={item}>{item}</p>) : <span>暂无</span>}
    </div>
  );
}

function Stat({ label, value }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function EmptyState({ children }) {
  return <div className="investigation-empty">{children}</div>;
}

function entityName(entities, id) {
  return entities.find((entity) => entity.id === id)?.name || id;
}

function FoldBox({ title, count, onClear, children }) {
  const [open, setOpen] = useState(false);
  const items = React.Children.toArray(children).filter(Boolean);
  return (
    <div className="fold-box">
      <div className="fold-box-header" onClick={() => setOpen(!open)}>
        <span className="fold-arrow">{open ? '▼' : '▶'}</span>
        <span className="fold-title">{title}</span>
        <span className="fold-badge">{count}</span>
        {count > 0 && onClear && <button className="sidebar-clear-btn" onClick={(e) => { e.stopPropagation(); onClear(); }}>🗑️</button>}
      </div>
      {open && (
        <ul className="sidebar-list" style={{ padding: '4px 0' }}>
          {items.length > 0 ? items : <div className="sidebar-empty-hint" style={{ padding: '6px 12px' }}>暂无记录</div>}
        </ul>
      )}
    </div>
  );
}
