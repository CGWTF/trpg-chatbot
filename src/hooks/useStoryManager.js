import { useState, useCallback, useEffect } from 'react';
import {
  getAllStories,
  getCurrentStoryId,
  createStory,
  saveStory,
  deleteStory,
  switchToStory,
} from '../utils/storage';

/** 批量 revoke messages 中的 blob URL */
function revokeMessageBlobs(msgs) {
  msgs.forEach(m => {
    if (m.image?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(m.image.url);
    }
  });
}

/**
 * 故事存档管理器
 * 管理消息、存档列表、增删切换、自动保存
 */
export default function useStoryManager(welcomeMsg) {
  const [stories, setStories] = useState(getAllStories);
  const [currentId, setCurrentId] = useState(getCurrentStoryId);

  // 初始化消息
  const [messages, setMessages] = useState(() => {
    if (currentId) {
      const found = getAllStories().find(s => s.id === currentId);
      if (found) {
        return cleanBlobs(found.messages);
      }
    }
    const s = createStory(welcomeMsg);
    setCurrentId(s.id);
    setStories(getAllStories());
    return s.messages;
  });

  // 自动保存
  useEffect(() => {
    if (currentId && messages.length > 0) {
      saveStory(currentId, messages);
      setStories(getAllStories());
    }
  }, [messages, currentId]);

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  const newStory = useCallback(() => {
    const s = createStory(welcomeMsg);
    setCurrentId(s.id);
    setMessages(s.messages);
    setStories(getAllStories());
  }, [welcomeMsg]);

  const switchStory = useCallback((id) => {
    const s = switchToStory(id);
    if (s) {
      setCurrentId(id);
      // 同 session 内 blob URL 仍有效，不需要 cleanBlobs
      setMessages(s.messages);
    }
  }, []);

  const removeStory = useCallback((id) => {
    // 先取到要被删的故事的 messages，再 revoke
    const stories = getAllStories();
    const target = stories.find(s => s.id === id);
    if (target) revokeMessageBlobs(target.messages);

    deleteStory(id);
    setStories(getAllStories());
    if (id === currentId) {
      const s = createStory(welcomeMsg);
      setCurrentId(s.id);
      setMessages(s.messages);
      setStories(getAllStories());
    }
  }, [currentId, welcomeMsg]);

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

/** 清理失效的 blob URL */
function cleanBlobs(msgs) {
  return msgs.map(m => {
    if (m.image?.url?.startsWith('blob:')) return { ...m, image: null };
    return m;
  });
}
