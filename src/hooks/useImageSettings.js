import { useCallback } from 'react';
import useLocalStorageState from './useLocalStorageState';
import { getImageConfig, saveImageConfig } from '../utils/storage';

/**
 * 图片生成配置与操作
 * 封装 imageConfig 持久化、更新、以及将生成结果挂到消息上的逻辑
 */
export default function useImageSettings(setMessages) {
  const [imageConfig, setImageConfigState] = useLocalStorageState(
    'trpg_image_config',
    getImageConfig()
  );

  const updateImageConfig = useCallback((patch) => {
    setImageConfigState((prev) => {
      const next = { ...prev, ...patch };
      saveImageConfig(next);
      return next;
    });
  }, [setImageConfigState]);

  const handleImageGenerate = useCallback(({ url, prompt, engine, messageIndex }) => {
    setMessages((prev) => {
      const u = [...prev];
      if (messageIndex >= 0 && messageIndex < u.length) {
        u[messageIndex] = { ...u[messageIndex], image: { url, prompt, engine: engine || 'AI' } };
      }
      return u;
    });
  }, [setMessages]);

  return { imageConfig, updateImageConfig, handleImageGenerate };
}
