import { useState, useCallback, useEffect, useRef } from 'react';
import {
  getAllStories,
  getCurrentStoryId,
  setCurrentStoryId,
  saveAllStories,
  createStory,
  deleteStory,
  switchToStory,
} from '../utils/storage';

/**
 * 故事存档管理器（写穿模式）
 *
 * React state 是唯一数据源；localStorage 是写穿缓存，仅在 mount 时读取、
 * 变更时写入。不再从 localStorage 读回同步 UI，消除级联 render。
 */
export default function useStoryManager(welcomeMsg) {
  // ── 初始化：一次性从 localStorage 读取 ──
  const [stories, setStories] = useState(() => {
    const all = getAllStories();
    // 如果没有存档或当前 ID 对应存档不存在，就地创建一个
    const currentId = getCurrentStoryId();
    if (!all.length || !all.find((s) => s.id === currentId)) {
      createStory(welcomeMsg); // 内部已写 localStorage
      return getAllStories();
    }
    return all;
  });

  const [currentId, setCurrentId] = useState(() => {
    const id = getCurrentStoryId();
    const all = getAllStories();
    return id && all.find((s) => s.id === id) ? id : all[0]?.id || '';
  });

  // 用 ref 追踪 render 次数，跳过首次 mount 的写回
  const mountedRef = useRef(false);

  // ── 写穿：stories 变更后同步到 localStorage ──
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      return; // mount 时 localStorage 已有最新数据，跳过
    }
    saveAllStories(stories);
    setCurrentStoryId(currentId);
  }, [stories, currentId]);

  // ── 当前故事的消息 ──
  const currentStory = stories.find((s) => s.id === currentId);
  const messages = currentStory ? currentStory.messages : [welcomeMsg];

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
            title: generateTitle(newMessages),
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
            title: generateTitle(newMessages),
            updatedAt: new Date().toISOString(),
          };
        })
      );
    },
    [currentId]
  );

  const newStory = useCallback(() => {
    const story = createStory(welcomeMsg);
    setStories((prev) => [story, ...prev]);
    setCurrentId(story.id);
  }, [welcomeMsg]);

  const switchStory = useCallback((id) => {
    const s = switchToStory(id);
    if (s) {
      setCurrentId(id);
    }
  }, []);

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

      deleteStory(id);
      setStories((prev) => prev.filter((s) => s.id !== id));

      if (id === currentId) {
        // 删的是当前故事 → 创建新的
        const story = createStory(welcomeMsg);
        setStories((prev) => [story, ...prev]);
        setCurrentId(story.id);
      }
    },
    [currentId, stories, welcomeMsg]
  );

  return {
    stories,
    currentId,
    messages,
    setMessages,
    addMessage,
    newStory,
    switchStory,
    removeStory,
  };
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
