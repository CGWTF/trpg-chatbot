import { useEffect } from 'react';
import useLocalStorageState from './useLocalStorageState';

/**
 * 角色属性状态：六维加值、加点上限、角色名、一次性迁移
 */
export default function useCharacterState() {
  const [charStats, setCharStats] = useLocalStorageState('trpg_char_stats', {
    STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0,
  });
  const [pointLimit, setPointLimit] = useLocalStorageState('trpg_point_limit', 20);
  const [characterName, setCharacterName] = useLocalStorageState('trpg_character_name', '冒险者');

  // 一次性迁移：D&D 属性值格式 (≥7) → 加值点数 (值-10)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('trpg_char_stats');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const vals = Object.values(parsed);
      if (vals.length === 6 && vals.every((v) => typeof v === 'number' && v >= 7)) {
        const migrated = {};
        for (const [k, v] of Object.entries(parsed)) {
          migrated[k] = Math.max(0, (parseInt(v) || 10) - 10);
        }
        setCharStats(migrated);
      }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem('trpg_point_limit');
      if (raw && parseInt(raw) >= 60) {
        setPointLimit(20);
      }
    } catch { /* ignore */ }
  }, []); // 仅首次挂载

  return {
    charStats, setCharStats,
    pointLimit, setPointLimit,
    characterName, setCharacterName,
  };
}
