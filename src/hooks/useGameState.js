import { useCallback } from 'react';
import {
  parseAIForStateChanges,
  applyStateChanges,
  scanAIForItems,
  parseAIForReasoningUpdates,
  groundHypotheses,
  mergeHypotheses,
} from '../utils/rollContext';
import { extractKnowledge } from '../utils/knowledgeApi';

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
    async (aiFullText) => {
      const changes = parseAIForStateChanges(aiFullText);
      const scanned = scanAIForItems(aiFullText);
      const hypotheses = groundHypotheses(parseAIForReasoningUpdates(aiFullText), {
        clues: [...(gameState.clues || []), ...scanned.clues],
        inventory: [...(gameState.inventory || []), ...scanned.items],
        locations: [...(gameState.locations || []), ...scanned.locations],
        currentLocation: scanned.currentLocation || gameState.location,
        generatedText: aiFullText,
      });

      const hasLocalChanges = changes || scanned.items.length > 0 || scanned.clues.length > 0
        || scanned.locations.length > 0 || scanned.currentLocation || hypotheses.length > 0;

      // 预先算出本轮新增的线索/道具/场所，供 analyzeKnowledge 使用
      const newClues = [...(gameState.clues || []), ...scanned.clues];
      const newItems = [...(gameState.inventory || []), ...scanned.items];
      const newLocations = [...(gameState.locations || []), ...scanned.locations];

      if (hasLocalChanges) {
        setGameState((prev) => {
          let next = { ...prev };
          if (changes) {
            next = applyStateChanges(next, changes);
          }
          for (const item of scanned.items) {
            if (!next.inventory.includes(item)) {
              next = applyStateChanges(next, { add_inventory: item });
            }
          }
          for (const clue of scanned.clues) {
            if (!next.clues.includes(clue)) {
              next = applyStateChanges(next, { add_clue: clue });
            }
          }
          for (const loc of scanned.locations) {
            if (!next.locations.includes(loc)) {
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
      await analyzeKnowledge(aiFullText, {
        baseGraph: {
          ...(gameState.knowledgeGraph || { entities: [], relations: [] }),
          _reasoningHints: {
            recentClues: newClues.slice(-10),
            recentItems: newItems.slice(-10),
            recentLocations: newLocations.slice(-10),
            currentLocation: scanned.currentLocation || gameState.location,
          },
        },
      });
    },
    [analyzeKnowledge, gameState.clues, gameState.inventory, gameState.location, gameState.locations, setGameState]
  );

  return { gameState, setGameState, applyAIStateUpdate, analyzeKnowledge };
}
