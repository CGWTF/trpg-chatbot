import { useState, useMemo } from 'react';
import React from 'react';
import EvidenceBoard from './EvidenceBoard';

export default function InvestigationWorkspace({
  isOpen,
  onClose,
  gameState,
  setGameState,
  activeTab,
  onTabChange,
  onAnalyze,
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
        <button className="investigation-close-btn" onClick={onClose} title="关闭调查工作台" aria-label="关闭调查工作台">✕</button>
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
        <button
          className={activeTab === 'board' ? 'active' : ''}
          onClick={() => onTabChange('board')}
        >
          🧩 证据板 <span>{((gameState?.clues?.length || 0) + (gameState?.inventory?.length || 0))}</span>
        </button>
      </nav>

      <main className="investigation-content">
        {activeTab === 'reasoning' ? (
          <ReasoningView
            hypotheses={hypotheses}
            onClear={() => setGameState((prev) => ({ ...prev, hypotheses: [] }))}
          />
        ) : activeTab === 'board' ? (
          <EvidenceBoard gameState={gameState} />
        ) : (
          <RelationsView
            graph={graph}
            onAnalyze={onAnalyze}
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

      {/* 整理信息的六个结构化分区 */}
      <aside className="investigation-items">
        <FoldBox title="主线任务" count={gameState?.quests?.length || 0}
          onClear={() => setGameState((p) => ({ ...p, quests: [] }))}>
          {(gameState?.quests || []).map((quest, i) => <li key={i} className="sidebar-list-item">{quest}</li>)}
        </FoldBox>
        <FoldBox title="已获得道具" count={gameState?.inventory?.length || 0}
          onClear={() => setGameState((p) => ({ ...p, inventory: [] }))}>
          {(gameState?.inventory || []).map((item, i) => <li key={i} className="sidebar-list-item inventory-item">{item}</li>)}
        </FoldBox>
        <FoldBox title="关键人物" count={people.length}
          onClear={() => setGameState((p) => {
            const personIds = new Set((p.knowledgeGraph?.entities || [])
              .filter((entity) => entity.type === 'person')
              .map((entity) => entity.id));
            return {
              ...p,
              knowledgeGraph: {
                ...p.knowledgeGraph,
                entities: (p.knowledgeGraph?.entities || []).filter((entity) => entity.type !== 'person'),
                relations: (p.knowledgeGraph?.relations || []).filter(
                  (relation) => !personIds.has(relation.source) && !personIds.has(relation.target)
                ),
              },
            };
          })}>
          {people.map((person) => <li key={person.id} className="sidebar-list-item">{person.name}</li>)}
        </FoldBox>
        <FoldBox title="已知地点" count={gameState?.locations?.length || 0}
          onClear={() => setGameState((p) => ({ ...p, locations: [] }))}>
          {(gameState?.locations || []).map((loc, i) => <li key={i} className="sidebar-list-item location-item">{loc}</li>)}
        </FoldBox>
        <FoldBox title="潜在威胁" count={gameState?.threats?.length || 0}
          onClear={() => setGameState((p) => ({ ...p, threats: [] }))}>
          {(gameState?.threats || []).map((threat, i) => <li key={i} className="sidebar-list-item">{threat}</li>)}
        </FoldBox>
        <FoldBox title="重要情报" count={gameState?.clues?.length || 0}
          onClear={() => setGameState((p) => ({ ...p, clues: [] }))}
          summary={gameState?.knowledgeGraph?.entities?.length ? `已关联 ${gameState.knowledgeGraph.entities.length} 个实体 · ${gameState.knowledgeGraph.relations.length} 条关系` : null}>
          {(gameState?.clues || []).map((clue, i) => <li key={i} className="sidebar-list-item clue-item-sidebar">{clue}</li>)}
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
              <EvidenceColumn
                title="支持证据"
                items={hypothesis.evidence}
                sources={hypothesis.evidenceSources}
                type="support"
              />
              <EvidenceColumn
                title="反证"
                items={hypothesis.contradictions}
                sources={hypothesis.contradictionSources}
                type="against"
              />
            </article>
          ))}
        </div>
      ) : (
        <EmptyState>发现多条相关线索后，会形成可追踪的推理假设。</EmptyState>
      )}
    </div>
  );
}

function RelationsView({ graph, onClear, onAnalyze, characterName }) {
  const [selectedId, setSelectedId] = useState(null);
  const [analysisState, setAnalysisState] = useState({ running: false, message: '' });

  const handleAnalyze = async () => {
    if (analysisState.running) return;
    setAnalysisState({ running: true, message: '正在分析全部当前记录…' });
    try {
      const result = await onAnalyze?.();
      const peopleCount = result?.people || 0;
      const itemCount = result?.items || 0;
      const categoryCount = (result?.quests || 0) + (result?.threats || 0) + (result?.intelligence || 0);
      const message = result?.noSummary
        ? '未找到整理信息请求，请先在对话中要求整理信息'
        : result?.preservedExisting
          ? '未识别到整理结果，已保留现有工作台内容'
        : peopleCount || itemCount || categoryCount
        ? `已按最近整理结果覆盖：${peopleCount} 个人物、${itemCount} 件道具、${categoryCount} 条任务/威胁/情报`
        : result?.knowledgeUpdated
          ? '分析完成，但没有发现新的具名人物或持有物品'
          : '已清除旧提取结果，但整理回复中没有具名人物或持有物品';
      setAnalysisState({ running: false, message });
    } catch {
      setAnalysisState({ running: false, message: '分析失败，请确认服务已启动后重试' });
    }
  };

  // 确保"我"始终作为一个实体存在
  const meEntity = useMemo(() => {
    const me = graph.entities.find(e => e.type === 'person' && e.name === (characterName || '我'));
    return me || { id: 'me', type: 'person', name: characterName || '我', description: '玩家角色' };
  }, [graph.entities, characterName]);

  // 合并"我"到实体列表
  const allEntities = useMemo(() => {
    const has = graph.entities.some(e => e.id === 'me' || e.name === (characterName || '我'));
    return has ? graph.entities : [meEntity, ...graph.entities];
  }, [graph.entities, meEntity, characterName]);

  const selected = allEntities.find(e => e.id === selectedId);
  const selectedRelations = selected
    ? graph.relations.filter(r => r.source === selected.id || r.target === selected.id)
    : [];

  const TYPE_LABELS = { person: '👤 人物', place: '📍 地点', organization: '🏛️ 组织' };

  return (
    <div className="investigation-view">
      <ViewHeader
        title="人物关系分析"
        meta={`${allEntities.length} 个实体 · ${graph.relations.length} 条关系`}
        onClear={graph.entities.length ? onClear : null}
        action={{ label: analysisState.running ? '分析中…' : '重新分析', onClick: handleAnalyze, disabled: analysisState.running }}
      />
      <div className="graph-stats">
        {['person', 'place', 'organization'].map(t => {
          const count = allEntities.filter(e => e.type === t).length;
          return <Stat key={t} label={TYPE_LABELS[t]} value={count} />;
        })}
        <Stat label="关系" value={graph.relations.length} />
      </div>

      <div className="relations-layout">
        {/* 左栏：实体列表（可点击） */}
        <section className="investigation-panel" style={{ flex: 1, maxHeight: 320, overflowY: 'auto' }}>
          <h3>全部实体</h3>
          {['person', 'place', 'organization'].map(type => {
            const group = allEntities.filter(e => e.type === type);
            if (!group.length) return null;
            return (
              <div key={type} className="entity-type-group">
                <span className="entity-type-label">{TYPE_LABELS[type]} ({group.length})</span>
                {group.map(e => (
                  <div key={e.id}
                    className={`entity-row ${selectedId === e.id ? 'entity-row-selected' : ''}`}
                    onClick={() => setSelectedId(selectedId === e.id ? null : e.id)}
                  >
                    <strong>{e.name}</strong>
                    {e.description && <small>{e.description}</small>}
                  </div>
                ))}
              </div>
            );
          })}
        </section>

        {/* 右栏：选中实体详情 + 关系 */}
        <section className="investigation-panel relation-detail-panel" style={{ flex: 1.4, maxHeight: 320, overflowY: 'auto' }}>
          {selected ? (
            <>
              <h3>{selected.name}</h3>
              <div className="entity-tags">
                <span className={`entity-tag tag-${selected.type}`}>{TYPE_LABELS[selected.type]}</span>
                {selected.description && <span className="entity-desc">{selected.description}</span>}
              </div>
              <h4 style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                关联关系 ({selectedRelations.length})
              </h4>
              <div className="relation-table">
                {selectedRelations.length ? selectedRelations.map(r => (
                  <div key={r.id}>
                    <span>{entityName(allEntities, r.source)}</span>
                    <strong>{r.type}</strong>
                    <span>{entityName(allEntities, r.target)}</span>
                  </div>
                )) : <span className="relation-empty">暂无关联</span>}
              </div>
            </>
          ) : (
            <div className="relation-empty" style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>
              ← 点击左侧实体查看详情与关联
            </div>
          )}
        </section>
      </div>

      <p className="investigation-meta">
        抽取器：{graph.extractor || '尚未分析'}
        {graph.embeddingRecommended && ' · 建议启用 Embedding'}
        {analysisState.message && ` · ${analysisState.message}`}
      </p>
    </div>
  );
}

function ViewHeader({ title, meta, onClear, action }) {
  return (
    <header className="investigation-view-header">
      <div><h3>{title}</h3><span>{meta}</span></div>
      <div className="investigation-view-actions">
        {action && <button onClick={action.onClick} disabled={action.disabled}>{action.label}</button>}
        {onClear && <button className="danger" onClick={onClear} title={`清空${title}`}>清空</button>}
      </div>
    </header>
  );
}

const SOURCE_LABELS = {
  clue: '线索',
  item: '道具',
  location: '场所',
  narrative: '本轮叙事',
};

function EvidenceColumn({ title, items, sources = [], type }) {
  return (
    <div className={`reasoning-evidence reasoning-evidence-${type}`}>
      <h4>{title}</h4>
      {items.length ? items.map((item, index) => {
        const source = sources.find((entry) => entry.text === item);
        return (
          <p key={`${item}-${index}`}>
            {source && (
              <small className={`evidence-source-badge evidence-source-${source.source}`}>
                {SOURCE_LABELS[source.source] || source.source}
              </small>
            )}
            {item}
          </p>
        );
      }) : <span>暂无</span>}
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

function FoldBox({ title, count, onClear, summary, children }) {
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
        <>
        {summary && <div className="fold-summary">{summary}</div>}
        <ul className="sidebar-list" style={{ padding: '4px 0' }}>
          {items.length > 0 ? items : <div className="sidebar-empty-hint" style={{ padding: '6px 12px' }}>暂无记录</div>}
        </ul>
        </>
      )}
    </div>
  );
}
