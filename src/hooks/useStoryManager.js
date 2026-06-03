import { useState, useCallback, useEffect } from 'react';
import {
  getAllStories,
  getCurrentStoryId,
  createStory,
  saveStory,
  deleteStory,
  switchToStory,
} from '../utils/storage';

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
      setMessages(cleanBlobs(s.messages));
    }
  }, []);

  const removeStory = useCallback((id) => {
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
