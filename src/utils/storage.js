/**
 * 故事存档管理 & 图片 API 配置
 * 所有数据保存在 localStorage 中
 */

const STORAGE_KEY = 'trpg_stories';
const CURRENT_KEY = 'trpg_current_story';
const IMAGE_CONFIG_KEY = 'trpg_image_config';

// ========== 图片 API 配置 ==========

const DEFAULT_IMAGE_CONFIG = {
  provider: 'pollinations', // pollinations | openai | custom
  apiKey: '',
  baseUrl: '',
  model: '',
  size: '1024x1024',
};

export function getImageConfig() {
  try {
    const raw = localStorage.getItem(IMAGE_CONFIG_KEY);
    return raw ? { ...DEFAULT_IMAGE_CONFIG, ...JSON.parse(raw) } : DEFAULT_IMAGE_CONFIG;
  } catch {
    return DEFAULT_IMAGE_CONFIG;
  }
}

export function saveImageConfig(config) {
  try {
    localStorage.setItem(IMAGE_CONFIG_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

// ========== 故事管理 ==========

/**
 * 获取所有存档
 */
export function getAllStories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * 保存所有存档
 */
export function saveAllStories(stories) {
  try {
    const values = Array.isArray(stories) ? stories : [];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values.map(serializeStory)));
    return true;
  } catch {
    return false;
  }
}

export function exportStoryBackup(stories) {
  const values = Array.isArray(stories) ? stories : [];
  return JSON.stringify({
    format: 'trpg-chatbot-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    stories: values.map(serializeStory),
  }, null, 2);
}

export function parseStoryBackup(raw) {
  let parsed;
  try {
    parsed = JSON.parse(String(raw || ''));
  } catch {
    throw new Error('备份文件不是有效的 JSON');
  }

  const stories = Array.isArray(parsed) ? parsed : parsed?.stories;
  if (!Array.isArray(stories) || !stories.length) {
    throw new Error('备份文件中没有冒险记录');
  }
  if (stories.some((story) => !story || typeof story !== 'object'
    || typeof story.id !== 'string' || !story.id.trim()
    || !Array.isArray(story.messages))) {
    throw new Error('备份文件中的冒险记录结构不完整');
  }
  if (new Set(stories.map((story) => story.id)).size !== stories.length) {
    throw new Error('备份文件包含重复的冒险记录 ID');
  }
  return stories;
}

/**
 * 获取当前故事 ID
 */
export function getCurrentStoryId() {
  try {
    return localStorage.getItem(CURRENT_KEY);
  } catch {
    return null;
  }
}

/**
 * 设置当前故事 ID
 */
export function setCurrentStoryId(id) {
  try {
    if (id) localStorage.setItem(CURRENT_KEY, id);
    else localStorage.removeItem(CURRENT_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * 获取当前故事
 */
export function getCurrentStory() {
  const id = getCurrentStoryId();
  if (!id) return null;
  const stories = getAllStories();
  return stories.find(s => s.id === id) || null;
}

/**
 * 生成故事标题 (取第一条用户消息的前20字)
 */
export function generateTitle(messages) {
  const firstUser = messages.find(m => m.type === 'user');
  if (firstUser) {
    const text = firstUser.text.replace(/\/\w+\s*/g, '').trim();
    return text.substring(0, 20) || '未命名冒险';
  }
  return '新冒险';
}

/**
 * 生成唯一 ID
 */
function generateId() {
  return 'story_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8);
}

/**
 * 创建新故事
 */
export function createStory(welcomeMsg, defaults = {}) {
  const id = generateId();
  return {
    id,
    title: '新冒险',
    messages: [welcomeMsg],
    character: defaults.character,
    gameState: defaults.gameState,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 清理无效的 blob URL (刷新页面后失效)
 */
function cleanMessages(messages = []) {
  return messages.map(m => {
    if (m.image?.url?.startsWith('blob:')) {
      return { ...m, image: null };
    }
    return m;
  });
}

function serializeStory(story) {
  return {
    ...story,
    messages: cleanMessages(story.messages),
  };
}

/**
 * 保存当前故事
 */
export function saveStory(id, messages) {
  const stories = getAllStories();
  const index = stories.findIndex(s => s.id === id);
  if (index === -1) return;

  stories[index].messages = cleanMessages(messages);
  stories[index].title = generateTitle(messages);
  stories[index].updatedAt = new Date().toISOString();

  // 移到最前面
  const [story] = stories.splice(index, 1);
  stories.unshift(story);

  saveAllStories(stories);
}

/**
 * 重命名故事
 */
export function renameStory(id, title) {
  const stories = getAllStories();
  const story = stories.find((s) => s.id === id);
  if (!story) return;
  story.title = String(title).trim().slice(0, 30) || '未命名冒险';
  story.updatedAt = new Date().toISOString();
  saveAllStories(stories);
}

/**
 * 删除故事
 */
