import { useState, useCallback, useEffect } from 'react';
import {
  getAllStories,
  getCurrentStoryId,
  setCurrentStoryId,
  saveAllStories,
  createStory,
  renameStory as renameStoryInStorage,
  parseStoryBackup,
} from '../utils/storage';
import { getDefaultGameState, normalizeGameState } from '../utils/rollContext';

const DEFAULT_CHARACTER = {
  name: '冒险者',
  stats: { STR: 0, DEX: 0, CON: 0, INT: 0, WIS: 0, CHA: 0 },
  pointLimit: 20,
};

function createStoryDefaults() {
  return {
    character: structuredClone(DEFAULT_CHARACTER),
    gameState: getDefaultGameState(),
  };
}

function normalizeStory(story, legacyDefaults) {
  return {
    ...story,
    messages: Array.isArray(story.messages) ? story.messages : [],
    character: {
      ...structuredClone(DEFAULT_CHARACTER),
      ...(story.character || legacyDefaults.character),
      stats: { ...DEFAULT_CHARACTER.stats, ...(story.character?.stats || legacyDefaults.character.stats) },
    },
    gameState: normalizeGameState(story.gameState || legacyDefaults.gameState),
  };
}

function readLegacyDefaults() {
  const read = (key, fallback) => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch {
      return fallback;
    }
  };
  return {
    character: {
      name: read('trpg_character_name', DEFAULT_CHARACTER.name),
      stats: read('trpg_char_stats', DEFAULT_CHARACTER.stats),
      pointLimit: read('trpg_point_limit', DEFAULT_CHARACTER.pointLimit),
    },
    gameState: read('trpg_game_state', getDefaultGameState()),
  };
}

/**
 * 故事存档管理器（写穿模式）
 *
 * React state 是唯一数据源；localStorage 是写穿缓存，仅在 mount 时读取、
 * 变更时写入。不再从 localStorage 读回同步 UI，消除级联 render。
 */
export default function useStoryManager(welcomeMsg) {
  // ── 初始化：一次性从 localStorage 读取 ──
  const [initial] = useState(() => {
    const legacyDefaults = readLegacyDefaults();
    const loaded = getAllStories().map((story) => normalizeStory(story, legacyDefaults));
    const stories = loaded.length
      ? loaded
      : [createStory(welcomeMsg, createStoryDefaults())];
    const savedId = getCurrentStoryId();
    return {
      stories,
      currentId: stories.some((story) => story.id === savedId) ? savedId : stories[0].id,
    };
  });
  const [stories, setStories] = useState(initial.stories);
  const [currentId, setCurrentId] = useState(initial.currentId);
  const [saveStatus, setSaveStatus] = useState('saved');

  // ── 写穿：stories 变更后同步到 localStorage ──
  useEffect(() => {
    const saved = saveAllStories(stories) && setCurrentStoryId(currentId);
    const timer = setTimeout(() => setSaveStatus(saved ? 'saved' : 'error'), 0);
    return () => clearTimeout(timer);
  }, [stories, currentId]);

  // ── 当前故事的消息 ──
  const currentStory = stories.find((s) => s.id === currentId);
  const messages = currentStory ? currentStory.messages : [welcomeMsg];
  const character = currentStory?.character || DEFAULT_CHARACTER;
  const gameState = currentStory?.gameState || getDefaultGameState();

  // ── 写操作：同时更新 React state 和 localStorage ──

  const addMessage = useCallback(
    (msg) => {
      setStories((prev) =>
        prev.map((s) => {
          if (s.id !== currentId) return s;
          const newMessages = [...s.messages, msg];
          return {
            ...s,
            messages: newMessages,
            title: s.title === '新冒险' ? generateTitle(newMessages) : s.title,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    },
    [currentId]
  );

  // 支持批量设置消息（图片回调等场景）
  const setMessages = useCallback(
    (updater) => {
      setStories((prev) =>
        prev.map((s) => {
          if (s.id !== currentId) return s;
          const newMessages =
            typeof updater === 'function' ? updater(s.messages) : updater;
          return {
            ...s,
            messages: newMessages,
            title: s.title === '新冒险' ? generateTitle(newMessages) : s.title,
            updatedAt: new Date().toISOString(),
          };
        })
      );
    },
    [currentId]
  );

  const newStory = useCallback(() => {
    const story = createStory(welcomeMsg, createStoryDefaults());
    setStories((prev) => [story, ...prev]);
    setCurrentId(story.id);
  }, [welcomeMsg]);

  const switchStory = useCallback((id) => {
    setCurrentId((current) => (
      stories.some((story) => story.id === id) ? id : current
    ));
  }, [stories]);

  const removeStory = useCallback(
    (id) => {
      // revoke blob URLs before deleting
      const target = stories.find((s) => s.id === id);
      if (target) {
        target.messages.forEach((m) => {
          if (m.image?.url?.startsWith('blob:')) {
            URL.revokeObjectURL(m.image.url);
          }
        });
      }

      setStories((prev) => prev.filter((s) => s.id !== id));

      if (id === currentId) {
        // 删的是当前故事 → 创建新的
        const story = createStory(welcomeMsg, createStoryDefaults());
        setStories((prev) => [story, ...prev]);
        setCurrentId(story.id);
      }
    },
    [currentId, stories, welcomeMsg]
  );

  const setCharacter = useCallback(
    (updater) => updateStorySlice(setStories, currentId, 'character', updater),
    [currentId]
  );
  const setGameState = useCallback(
    (updater) => updateStorySlice(setStories, currentId, 'gameState', updater),
    [currentId]
  );


  const renameCurrentStory = useCallback((title) => {
    renameStoryInStorage(currentId, title);
    setStories((prev) => prev.map((s) => {
      if (s.id !== currentId) return s;
      return { ...s, title: String(title).trim().slice(0, 30) || '未命名冒险', updatedAt: new Date().toISOString() };
    }));
  }, [currentId]);

  const importStoryBackup = useCallback((raw) => {
    const legacyDefaults = readLegacyDefaults();
    const imported = parseStoryBackup(raw).map((story) => normalizeStory(story, legacyDefaults));
    const nextId = imported[0].id;
    setStories(imported);
    setCurrentId(nextId);
    return imported.length;
  }, []);

  return {
    stories,
    currentId,
    messages,
    setMessages,
    addMessage,
    newStory,
    switchStory,
    removeStory,
    renameStory: renameCurrentStory,
    character,
    gameState,
    setCharacter,
    setGameState,
    saveStatus,
    importStoryBackup,
  };
}

function updateStorySlice(setStories, currentId, key, updater) {
  setStories((prev) => prev.map((story) => {
    if (story.id !== currentId) return story;
    const next = typeof updater === 'function' ? updater(story[key]) : updater;
    return { ...story, [key]: next, updatedAt: new Date().toISOString() };
  }));
}

/** 生成故事标题 (取第一条用户消息的前20字) */
function generateTitle(messages) {
  const firstUser = messages.find((m) => m.type === 'user');
  if (firstUser) {
    const text = firstUser.text.replace(/\/\w+\s*/g, '').trim();
    return text.substring(0, 20) || '未命名冒险';
  }
  return '新冒险';
}
