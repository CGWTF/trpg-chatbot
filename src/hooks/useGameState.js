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

  // 从 AI 回复中提取 STATE 标签并应用到当前状态
  // 如果 AI 没用 STATE 标签，回退到启发式扫描
  const applyAIStateUpdate = useCallback(
    (aiFullText) => {
      const changes = parseAIForStateChanges(aiFullText);
      if (changes) {
        setGameState((prev) => applyStateChanges(prev, changes));
      } else {
        // 回退：启发式扫描 AI 回复，提取未标记的道具和线索
        const scanned = scanAIForItems(aiFullText);
        if (scanned.items.length > 0 || scanned.clues.length > 0) {
          setGameState((prev) => {
            let next = { ...prev };
            for (const item of scanned.items) {
              // 去重：背包里没有的才加
              if (!next.inventory.includes(item)) {
                next = applyStateChanges(next, { add_inventory: item });
              }
            }
            for (const clue of scanned.clues) {
              if (!next.clues.includes(clue)) {
                next = applyStateChanges(next, { add_clue: clue });
              }
            }
            return next;
          });
        }
      }
    },
    [setGameState]
  );

  return { gameState, setGameState, applyAIStateUpdate };
}
