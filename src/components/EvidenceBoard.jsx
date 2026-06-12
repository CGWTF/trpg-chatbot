import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow, Controls, Background, MiniMap, useNodesState, useEdgesState,
  addEdge, MarkerType, Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const NODE_STYLE = {
  item:   { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  icon: '🎒' },
  clue:   { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  icon: '🔍' },
  person: { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: '👤' },
  place:  { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',   icon: '📍' },
  organization: { color: '#ec4899', bg: 'rgba(236,72,153,0.12)', icon: '🏛️' },
};

function makeNode(id, type, name, x, y) {
  const t = NODE_STYLE[type] || NODE_STYLE.clue;
  return {
    id, type: 'default',
    position: { x, y },
    data: { label: `${t.icon} ${name}`, name, type },
    style: {
      background: t.bg, border: `2px solid ${t.color}`, color: t.color,
      borderRadius: 8, padding: '6px 12px', fontSize: 12, maxWidth: 200,
      boxShadow: `0 0 8px ${t.color}22`,
    },
  };
}

function buildGraph(gameState) {
  const nodes = [];
  const edges = [];
  // 中心："我"
  nodes.push(makeNode('center', 'person', '我', 400, 300));

  // 人物环形排列
  const graph = gameState?.knowledgeGraph;
  const entities = graph?.entities || [];
  const people = entities.filter(e => e.type === 'person');
  const places = entities.filter(e => e.type === 'place');
  const orgs = entities.filter(e => e.type === 'organization');

  const ring1 = 200; // 线索圈
  const ring2 = 320; // 人物/地点圈

  // 线索围绕中心
  const clues = gameState?.clues || [];
  const itemNames = gameState?.inventory || [];

  clues.forEach((c, i) => {
    const angle = (i / Math.max(clues.length, 1)) * Math.PI * 2;
    const x = 400 + Math.cos(angle) * ring1;
    const y = 300 + Math.sin(angle) * ring1;
    nodes.push(makeNode(`c${i}`, 'clue', c, x, y));
  });

  // 人物和场所外围
  [...people, ...places, ...orgs].forEach((e, i) => {
    const total = people.length + places.length + orgs.length;
    const angle = (i / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
    const x = 400 + Math.cos(angle) * ring2;
    const y = 300 + Math.sin(angle) * ring2;
    nodes.push(makeNode(`e${e.id}`, e.type, e.name, x, y));
  });

  // 道具最外圈
  itemNames.forEach((item, i) => {
    const angle = (i / Math.max(itemNames.length, 1)) * Math.PI * 2 + Math.PI / 4;
    const x = 400 + Math.cos(angle) * 440;
    const y = 300 + Math.sin(angle) * 440;
    nodes.push(makeNode(`item${i}`, 'item', item, x, y));
  });

  const nodeIds = new Set(nodes.map((node) => node.id));
  for (const relation of graph?.relations || []) {
    const source = `e${relation.source}`;
    const target = `e${relation.target}`;
    if (!nodeIds.has(source) || !nodeIds.has(target)) continue;
    edges.push({
      id: `relation-${relation.id || `${relation.source}-${relation.type}-${relation.target}`}`,
      source,
      target,
      label: relation.type,
      markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' },
      style: { stroke: '#6b7280', strokeWidth: 1.5 },
    });
  }

  return { nodes, edges };
}

export default function EvidenceBoard({ gameState, setGameState }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loaded, setLoaded] = useState(false);
  const [synthesized, setSynthesized] = useState(false);

  const populate = useCallback(() => {
    const saved = gameState?.evidenceBoard;
    const hasSavedBoard = saved?.nodes?.length || saved?.edges?.length;
    const { nodes: ns, edges: es } = hasSavedBoard ? saved : buildGraph(gameState);
    setNodes(ns);
    setEdges(es);
    setLoaded(true);
    setSynthesized(false);
  }, [gameState, setNodes, setEdges]);

  useEffect(() => {
    if (!loaded) return;
    setGameState?.((prev) => ({
      ...prev,
      evidenceBoard: { nodes, edges },
    }));
  }, [edges, loaded, nodes, setGameState]);

  // 合成图谱：自动连接线索到相关实体
  const synthesize = useCallback(() => {
    const { nodes: ns, edges: relationEdges } = buildGraph(gameState);
    setNodes(ns);

    // 自动连线：线索文字提到实体名 → 创建边
    const clueNodes = ns.filter(n => n.data.type === 'clue');
    const entityNodes = ns.filter(n => ['person', 'place', 'organization'].includes(n.data.type));

    const autoEdges = [];
    clueNodes.forEach(clue => {
      const clueText = clue.data.label || '';
      entityNodes.forEach(ent => {
        const entName = ent.data.name || '';
        if (entName.length >= 2 && clueText.includes(entName)) {
          autoEdges.push({
            id: `auto-${clue.id}-${ent.id}`,
            source: clue.id,
            target: ent.id,
            style: { stroke: NODE_STYLE[ent.data.type]?.color || '#6b7280', strokeWidth: 1.5, strokeDasharray: '5,5' },
            markerEnd: { type: MarkerType.ArrowClosed, color: NODE_STYLE[ent.data.type]?.color || '#6b7280', width: 10, height: 10 },
          });
        }
      });
    });

    setEdges([...relationEdges, ...autoEdges]);
    setSynthesized(true);
  }, [gameState, setNodes, setEdges]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' }, style: { stroke: '#6b7280', strokeWidth: 2 } }, eds)),
    [setEdges]
  );

  const clearBoard = () => {
    setNodes([]);
    setEdges([]);
    setLoaded(false);
    setSynthesized(false);
    setGameState?.((prev) => ({ ...prev, evidenceBoard: { nodes: [], edges: [] } }));
  };

  if (!loaded) {
    return (
      <div className="evidence-empty">
        <p>加载线索和实体，生成推理图谱</p>
        <button className="setup-btn primary" onClick={populate}>📥 加载证据</button>
      </div>
    );
  }

  return (
    <div className="evidence-board" style={{ height: '100%', minHeight: 400 }}>
      <ReactFlow
        nodes={nodes} edges={edges}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView deleteKeyCode="Delete" multiSelectionKeyCode="Shift"
      >
        <Controls />
        <Background color="#ffffff10" gap={20} />
        <MiniMap nodeColor={(n) => NODE_STYLE[n.data?.type]?.color || '#666'} style={{ background: '#0f1624' }} />
        <Panel position="top-right" style={{ display: 'flex', gap: 4 }}>
          <button className="sidebar-clear-btn" onClick={populate} title="重新加载">🔄</button>
          <button className="sidebar-clear-btn" onClick={synthesize} title="合成图谱" style={{ color: synthesized ? '#f59e0b' : undefined }}>🧬</button>
          <button className="sidebar-clear-btn" onClick={clearBoard} title="清空画布">🗑️</button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
