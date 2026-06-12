import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createStory, getAllStories, saveAllStories } from '../utils/storage';

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
});
