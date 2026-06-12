import { useState, useCallback } from 'react';

/**
 * 自动同步到 localStorage 的 useState
 * @param {string} key - localStorage key
 * @param {*} defaultValue - 默认值 (可传函数)
 */
export default function useLocalStorageState(key, defaultValue) {
  const [value, setValue] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored);
    } catch { /* localStorage may be unavailable */ }
    return typeof defaultValue === 'function' ? defaultValue() : defaultValue;
  });

  const setAndPersist = useCallback((newValue) => {
    setValue(prev => {
      const next = typeof newValue === 'function' ? newValue(prev) : newValue;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch { /* localStorage may be unavailable */ }
      return next;
    });
  }, [key]);

  return [value, setAndPersist];
}
