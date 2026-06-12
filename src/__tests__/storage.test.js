import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStory,
  exportStoryBackup,
  getAllStories,
  getCurrentStoryId,
  parseStoryBackup,
  saveAllStories,
} from '../utils/storage';

function createLocalStorage() {
  const data = new Map();
  return {
    getItem: vi.fn((key) => data.get(key) ?? null),
    setItem: vi.fn((key, value) => data.set(key, String(value))),
    removeItem: vi.fn((key) => data.delete(key)),
    clear: vi.fn(() => data.clear()),
  };
}

describe('story storage boundary', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createLocalStorage());
  });

  it('creates a story model without writing storage', () => {
    const story = createStory({ text: 'welcome', type: 'bot' }, {
      character: { name: 'Aria' },
      gameState: { hp: 10 },
    });

    expect(story.character.name).toBe('Aria');
    expect(story.gameState.hp).toBe(10);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('removes temporary blob URLs before persistence', () => {
    saveAllStories([{
      id: 'story-1',
      messages: [{
        text: 'scene',
        type: 'bot',
        image: { url: 'blob:temporary', prompt: 'castle' },
      }],
    }]);

    expect(getAllStories()[0].messages[0].image).toBeNull();
  });

  it('does not crash when localStorage quota is exceeded', () => {
    localStorage.setItem.mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    });

    expect(saveAllStories([])).toBe(false);
  });

  it('treats non-array persisted JSON as an empty story list', () => {
    localStorage.setItem('trpg_stories', JSON.stringify({ invalid: true }));
    expect(getAllStories()).toEqual([]);
  });

  it('exports and parses a versioned backup', () => {
    const raw = exportStoryBackup([{ id: 'story-1', messages: [] }]);
    expect(parseStoryBackup(raw)).toEqual([{ id: 'story-1', messages: [] }]);
  });

  it('rejects an incomplete backup before it can replace stories', () => {
    expect(() => parseStoryBackup('{"stories":[{"id":"story-1"}]}'))
      .toThrow('结构不完整');
  });

  it('rejects duplicate story ids', () => {
    const raw = JSON.stringify({ stories: [
      { id: 'story-1', messages: [] },
      { id: 'story-1', messages: [] },
    ] });
    expect(() => parseStoryBackup(raw)).toThrow('重复');
  });

  it('handles denied current-story storage reads', () => {
    localStorage.getItem.mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(getCurrentStoryId()).toBeNull();
  });
});
