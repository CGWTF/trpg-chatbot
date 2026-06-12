import { useCallback } from 'react';
import {
  parseAIForStateChanges,
  applyStateChanges,
  scanAIForItems,
  parseTRPGState,
  parseTRPGEvents,
  scanPriorityRecords,
  parseAIForReasoningUpdates,
  groundHypotheses,
  mergeHypotheses,
} from '../utils/rollContext';
import { extractKnowledge } from '../utils/knowledgeApi';

function localId(prefix, value) {
  let hash = 0;
  for (const char of value) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `${prefix}_${Math.abs(hash).toString(36)}`;
}

function mergeEventGraph(current = {}, events, replace = false) {
  if (!events) return current;
  const existing = replace ? [] : (current.entities || []);
  const entities = [...existing];
  for (const entity of events.entities) {
    const index = entities.findIndex((value) => value.name === entity.name && value.type === entity.type);
    if (index >= 0) {
      entities[index] = { ...entities[index], ...entity };
    } else {
      entities.push({
        ...entity,
        id: localId(entity.type, entity.name),
        confidence: 1,
      });
    }
  }

  const byName = new Map(entities.map((entity) => [entity.name, entity.id]));
  const relations = replace ? [] : [...(current.relations || [])];
  for (const relation of events.relations) {
    const source = byName.get(relation.source);
    const target = byName.get(relation.target);
    if (!source || !target) continue;
    const id = localId('relation', `${relation.source}:${relation.type}:${relation.target}`);
    const normalized = { ...relation, id, source, target };
    const index = relations.findIndex((value) => value.id === id);
    if (index >= 0) relations[index] = normalized;
    else relations.push(normalized);
  }

  return {
    entities,
    relations,
    analysis: replace ? {} : (current.analysis || {}),
    extractor: 'events-local',
    embeddingRecommended: current.embeddingRecommended || false,
  };
}

/**
 * 游戏世界状态：HP/SP、道具背包、线索日志、当前位置
 * 独立于 AI 对话层，通过 localStorage 持久化
 */
export default function useGameState(gameState, setGameState) {
  const analyzeKnowledge = useCallback(
    async (text, { replaceGraph = false, baseGraph } = {}) => {
      if (!text?.trim()) return false;
      const graph = baseGraph ?? (replaceGraph ? { entities: [], relations: [] } : gameState.knowledgeGraph);
      const knowledge = await extractKnowledge(text, graph);
      if (!knowledge) return false;
      setGameState((prev) => ({
        ...prev,
        knowledgeGraph: {
          ...knowledge.graph,
          analysis: knowledge.analysis,
          extractor: knowledge.extractor,
          embeddingRecommended: knowledge.embeddingRecommended,
        },
      }));
      return true;
    },
    [gameState.knowledgeGraph, setGameState]
  );

  // 从 AI 回复中提取 STATE 标签 + 启发式扫描，合并结果
  const applyAIStateUpdate = useCallback(
    async (aiFullText, { forceRefresh = false, priorityOnly = false } = {}) => {
      const changes = parseAIForStateChanges(aiFullText);
      const events = parseTRPGEvents(aiFullText);
      const scannedPriorityRecords = scanPriorityRecords(aiFullText);
      const priorityRecords = !priorityOnly && events && (events.items.length || events.entities.length)
        ? { items: [], entities: [], quests: [], locations: [], threats: [], clues: [] }
        : scannedPriorityRecords;

      // 主策略：统一事件块；旧 TRPG_STATE 和启发式扫描作为兼容回退
      const stateBlock = parseTRPGState(aiFullText);
      const scanned = priorityOnly
        ? {
            items: events?.items.some((item) => item.action === 'acquired')
              ? events.items.filter((item) => item.action === 'acquired').map((item) => item.name)
              : priorityRecords.items,
            removedItems: [],
            clues: [],
            removedClues: [],
            locations: events?.locations.length
              ? events.locations.map((location) => location.name)
              : priorityRecords.locations,
            currentLocation: null,
            quests: events?.quests.some((quest) => quest.action === 'active')
              ? events.quests.filter((quest) => quest.action === 'active').map((quest) => quest.text)
              : priorityRecords.quests,
            threats: events?.threats.some((threat) => threat.action === 'active')
              ? events.threats.filter((threat) => threat.action === 'active').map((threat) => threat.text)
              : priorityRecords.threats,
            importantIntel: events?.clues.some((clue) => clue.action === 'discovered')
              ? events.clues.filter((clue) => clue.action === 'discovered').map((clue) => clue.text)
              : priorityRecords.clues,
          }
        : events
        ? {
            items: events.items.filter((item) => item.action === 'acquired').map((item) => item.name),
            removedItems: events.items.filter((item) => item.action === 'lost').map((item) => item.name),
            clues: events.clues.filter((clue) => clue.action === 'discovered').map((clue) => clue.text),
            removedClues: events.clues.filter((clue) => clue.action === 'retracted').map((clue) => clue.text),
            locations: events.locations.map((location) => location.name),
            currentLocation: events.currentLocation
              || events.locations.find((location) => location.action === 'entered')?.name
              || null,
            quests: events.quests.filter((quest) => quest.action === 'active').map((quest) => quest.text),
            threats: events.threats.filter((threat) => threat.action === 'active').map((threat) => threat.text),
            importantIntel: events.clues.filter((clue) => clue.action === 'discovered').map((clue) => clue.text),
          }
        : stateBlock
        ? { items: stateBlock.inventory, clues: stateBlock.clues, locations: stateBlock.locations, currentLocation: stateBlock.currentLocation }
        : scanAIForItems(aiFullText);

      scanned.removedItems ||= [];
      scanned.removedClues ||= [];
      scanned.quests ||= [];
      scanned.threats ||= [];
      scanned.importantIntel ||= [];
      scanned.items = [...new Set([...scanned.items, ...priorityRecords.items])];

      // 统一事件块明确声明 snapshot；旧格式继续使用原先的刷新检测
      const totalEntries = (scanned.items?.length || 0) + (scanned.clues?.length || 0) + (scanned.locations?.length || 0);
      const isRefresh = forceRefresh || events?.mode === 'snapshot' || (!events && totalEntries >= 5);
      const eventEntities = priorityOnly
        ? (events?.entities || []).filter((entity) => entity.type === 'person')
        : (events?.entities || []);
      const localEvents = {
        entities: [
          ...eventEntities,
          ...priorityRecords.entities.filter((entity) =>
            !eventEntities.some((value) => value.name === entity.name && value.type === entity.type)
          ),
        ],
        relations: priorityOnly ? [] : (events?.relations || []),
      };
      const authoritativeDataFound = scanned.items.length > 0
        || scanned.quests.length > 0 || scanned.locations.length > 0
        || scanned.threats.length > 0 || scanned.importantIntel.length > 0
        || localEvents.entities.some((entity) => entity.type === 'person');
      if (forceRefresh && priorityOnly && !authoritativeDataFound) {
        return {
          items: 0,
          people: 0,
          entities: 0,
          knowledgeUpdated: false,
          authoritative: false,
          preservedExisting: true,
        };
      }
      const eventGraph = mergeEventGraph(gameState.knowledgeGraph, localEvents, isRefresh);

      const hypotheses = groundHypotheses(parseAIForReasoningUpdates(aiFullText), {
        clues: [...(gameState.clues || []), ...scanned.clues],
        inventory: [...(gameState.inventory || []), ...scanned.items],
        locations: [...(gameState.locations || []), ...scanned.locations],
        currentLocation: scanned.currentLocation || gameState.location,
        generatedText: aiFullText,
      });

      const hasLocalChanges = changes || scanned.items.length > 0 || scanned.clues.length > 0
        || scanned.removedItems.length > 0 || scanned.removedClues.length > 0
        || scanned.locations.length > 0 || scanned.quests.length > 0 || scanned.threats.length > 0
        || scanned.importantIntel.length > 0 || scanned.currentLocation || hypotheses.length > 0
        || localEvents.entities.length > 0 || localEvents.relations.length > 0;

      // 预先算出本轮新增的线索/道具/场所，供 analyzeKnowledge 使用
      const newClues = [...(gameState.clues || []), ...scanned.clues, ...scanned.importantIntel];
      const newItems = [...(gameState.inventory || []), ...scanned.items];
      const newLocations = [...(gameState.locations || []), ...scanned.locations];

      if (hasLocalChanges || isRefresh) {
        setGameState((prev) => {
          let next = {
            ...prev,
            quests: [...(prev.quests || [])],
            threats: [...(prev.threats || [])],
          };
          // 刷新模式：清空旧数据，用 AI 整理的替换
          if (isRefresh) {
            next = {
              ...next,
              inventory: [],
              quests: [],
              threats: [],
              clues: [],
              locations: [],
              location: scanned.currentLocation || '',
              hypotheses: [],
              knowledgeGraph: eventGraph,
            };
          } else if (localEvents.entities.length || localEvents.relations.length) {
            next.knowledgeGraph = eventGraph;
          }
          if (changes) {
            next = applyStateChanges(next, changes);
          }
          for (const item of scanned.items) {
            if (!next.inventory.includes(item) && next.inventory.length < 12) {
              next = applyStateChanges(next, { add_inventory: item });
            }
          }
          for (const quest of scanned.quests) {
            if (!next.quests.includes(quest)) next.quests.push(quest);
          }
          for (const threat of scanned.threats) {
            if (!next.threats.includes(threat)) next.threats.push(threat);
          }
          for (const intel of scanned.importantIntel) {
            if (!next.clues.includes(intel)) next.clues.push(intel);
          }
          for (const item of scanned.removedItems) {
            next = applyStateChanges(next, { remove_inventory: item });
          }
          for (const clue of scanned.clues) {
            if (!next.clues.includes(clue)) {
              next = applyStateChanges(next, { add_clue: clue });
            }
          }
          for (const clue of scanned.removedClues) {
            next.clues = next.clues.filter((value) => value !== clue);
          }
          for (const loc of scanned.locations) {
            if (!next.locations.includes(loc) && next.locations.length < 8) {
              next = applyStateChanges(next, { add_location: loc });
            }
          }
          if (!changes?.location && scanned.currentLocation) {
            next = applyStateChanges(next, { location: scanned.currentLocation });
          }
          if (hypotheses.length > 0) {
            next.hypotheses = mergeHypotheses(next.hypotheses, hypotheses);
          }
          return next;
        });
      }

      // 使用包含本轮新增项的上下文调用 NLP（避免闭包里的旧 knowledgeGraph）
      const knowledgeUpdated = priorityOnly
        ? false
        : await analyzeKnowledge(aiFullText, {
            replaceGraph: isRefresh,
            baseGraph: {
              ...eventGraph,
              _reasoningHints: {
                recentClues: newClues.slice(-10),
                recentItems: newItems.slice(-10),
                recentLocations: newLocations.slice(-10),
                currentLocation: scanned.currentLocation || gameState.location,
              },
            },
          });
      return {
        items: scanned.items.length,
        quests: scanned.quests.length,
        threats: scanned.threats.length,
        intelligence: scanned.importantIntel.length,
        people: localEvents.entities.filter((entity) => entity.type === 'person').length,
        entities: localEvents.entities.length,
        knowledgeUpdated,
        authoritative: forceRefresh,
      };
    },
    [analyzeKnowledge, gameState.clues, gameState.inventory, gameState.knowledgeGraph, gameState.location, gameState.locations, setGameState]
  );

  return { gameState, setGameState, applyAIStateUpdate, analyzeKnowledge };
}
