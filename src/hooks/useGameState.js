import { useCallback } from 'react';
import useLocalStorageState from './useLocalStorageState';
import {
  parseAIForStateChanges,
  applyStateChanges,
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
  const applyAIStateUpdate = useCallback(
    (aiFullText) => {
      const changes = parseAIForStateChanges(aiFullText);
      if (changes) {
        setGameState((prev) => applyStateChanges(prev, changes));
      }
    },
    [setGameState]
  );

  return { gameState, setGameState, applyAIStateUpdate };
}
