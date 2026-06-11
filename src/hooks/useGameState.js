import { useCallback } from 'react';
import useLocalStorageState from './useLocalStorageState';
import {
  parseAIForStateChanges,
  applyStateChanges,
  scanAIForItems,
  getDefaultGameState,
} from '../utils/rollContext';

/**
 * 游戏世界状态：HP/SP、道具背包、线索日志、当前位置
 * 独立于 AI 对话层，通过 localStorage 持久化
 */
export default function useGameState() {
  const [gameState, setGameState] = useLocalStorageState(
    'trpg_game_state',
    getDefaultGameState()
  );

  // 从 AI 回复中提取 STATE 标签 + 启发式扫描，合并结果
  const applyAIStateUpdate = useCallback(
    (aiFullText) => {
      const changes = parseAIForStateChanges(aiFullText);
      const scanned = scanAIForItems(aiFullText);

      // 如果没有显式 STATE 标签也没有扫描到东西，跳过
      if (!changes && scanned.items.length === 0 && scanned.clues.length === 0 && scanned.locations.length === 0) {
        return;
      }
      setGameState((prev) => {
        let next = { ...prev };
        // 先应用 STATE 标签（优先级更高）
        if (changes) {
          next = applyStateChanges(next, changes);
        }
        // 补充扫描器找到的遗漏项（去重）
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
        return next;
      });
    },
    [setGameState]
  );

  return { gameState, setGameState, applyAIStateUpdate };
}
