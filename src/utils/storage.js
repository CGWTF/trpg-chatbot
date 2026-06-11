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
  localStorage.setItem(IMAGE_CONFIG_KEY, JSON.stringify(config));
}

// ========== 故事管理 ==========

/**
 * 获取所有存档
 */
export function getAllStories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * 保存所有存档
 */
export function saveAllStories(stories) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stories.map(serializeStory)));
}

/**
 * 获取当前故事 ID
 */
export function getCurrentStoryId() {
  return localStorage.getItem(CURRENT_KEY);
}

/**
 * 设置当前故事 ID
 */
export function setCurrentStoryId(id) {
  if (id) localStorage.setItem(CURRENT_KEY, id);
  else localStorage.removeItem(CURRENT_KEY);
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
