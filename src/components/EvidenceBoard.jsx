import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow, Controls, Background, MiniMap, useNodesState, useEdgesState,
  addEdge, MarkerType, Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const NODE_TYPES = {
  item:      { color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  icon: '🎒', label: '道具' },
  clue:      { color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)',  icon: '🔍', label: '线索' },
  person:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)',  icon: '👤', label: '人物' },
  place:     { color: '#06b6d4', bg: 'rgba(6,182,212,0.12)',   icon: '📍', label: '地点' },
  organization: { color: '#ec4899', bg: 'rgba(236,72,153,0.12)', icon: '🏛️', label: '组织' },
};

function buildNodes(gameState) {
  const nodes = [];
  let id = 0;
  const add = (type, name, desc = '') => {
    const t = NODE_TYPES[type];
    nodes.push({
      id: `n${id++}`,
      type: 'default',
      position: { x: (nodes.length % 3) * 260 + 40, y: Math.floor(nodes.length / 3) * 100 + 20 },
      data: { label: name, type, desc },
      style: {
        background: t.bg, border: `2px solid ${t.color}`, color: t.color,
        borderRadius: 8, padding: '8px 14px', fontSize: 13, maxWidth: 220,
        boxShadow: `0 0 8px ${t.color}22`,
      },
    });
  };

  (gameState?.inventory || []).forEach(i => add('item', i));
  (gameState?.clues || []).forEach(c => add('clue', c));

  const graph = gameState?.knowledgeGraph;
  if (graph?.entities) {
    graph.entities.forEach(e => {
      if (NODE_TYPES[e.type]) add(e.type, e.name, e.description || '');
    });
  }

  return nodes;
}

function buildEdges(gameState) {
  const edges = [];
  let eid = 0;
  const graph = gameState?.knowledgeGraph;
  if (graph?.relations) {
    // Find node IDs by name
    const nameToId = {};
    document.querySelectorAll('.react-flow__node').forEach(el => {
      const text = el.textContent || '';
      // Not reliable — skip edge building via DOM
    });
    // Instead use graph data directly
    // Edges require node IDs which we don't have cross-reference here
    // Skip for now — user connects manually
  }
  return edges;
}

export default function EvidenceBoard({ gameState, setGameState }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loaded, setLoaded] = useState(false);

  // Lazy populate — only once when data changes
  const populate = useCallback(() => {
    const ns = buildNodes(gameState);
    setNodes(ns);
    setEdges([]);
    setLoaded(true);
  }, [gameState, setNodes, setEdges]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, markerEnd: { type: MarkerType.ArrowClosed, color: '#6b7280' }, style: { stroke: '#6b7280', strokeWidth: 2 } }, eds)),
    [setEdges]
  );

  const clearBoard = () => { setNodes([]); setEdges([]); setLoaded(false); };

  if (!loaded) {
    return (
      <div className="evidence-empty">
        <p>拖拽证据卡，连线构建推理</p>
        <button className="setup-btn primary" onClick={populate}>📥 加载证据</button>
      </div>
    );
  }

  return (
    <div className="evidence-board" style={{ height: '100%', minHeight: 400 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        attributionPosition="bottom-left"
        deleteKeyCode="Delete"
        multiSelectionKeyCode="Shift"
      >
        <Controls />
        <Background color="#ffffff10" gap={20} />
        <MiniMap
          nodeColor={(n) => NODE_TYPES[n.data?.type]?.color || '#666'}
          style={{ background: '#0f1624' }}
        />
        <Panel position="top-right">
          <button className="sidebar-clear-btn" onClick={populate} title="重新加载" style={{ marginRight: 4 }}>🔄</button>
          <button className="sidebar-clear-btn" onClick={clearBoard} title="清空画布">🗑️</button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
