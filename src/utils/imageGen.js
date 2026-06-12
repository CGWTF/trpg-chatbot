/**
 * 图片生成工具
 * 支持多种后端，通过后端代理统一调用
 */

import { getImageConfig } from './storage';

const PROXY_URL = 'http://localhost:3001/api/image';

/**
 * 生成图片（通过后端代理）
 * 返回图片 blob URL 或直接 URL
 */
export async function fetchGeneratedImage(prompt) {
  const config = getImageConfig();

  const response = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      provider: config.provider || 'pollinations',
      apiKey: config.apiKey || undefined,
      baseUrl: config.baseUrl || undefined,
      model: config.model || undefined,
      size: config.size || undefined,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: '未知错误' }));
    throw new Error(err.error || `图片生成失败 (${response.status})`);
  }

  const blob = await response.blob();
  const engineName = config.provider === 'openai' ? `OpenAI (${config.model || 'gpt-image'})`
    : config.provider === 'custom' ? (config.model || 'Custom API')
    : 'Pollinations.ai (Flux)';
  return { blobUrl: URL.createObjectURL(blob), engine: engineName };
}

/**
 * 生成图片 URL（同步版本，用于快速返回代理地址）
 * 配合 <img> 标签直接使用后端代理 URL
 */
export function generateImageUrl(prompt) {
  const params = new URLSearchParams();
  // 通过 query params 传递简单配置（GET fallback for pollinations only）
  params.set('prompt', prompt);
  return `${PROXY_URL}?${params}`;
}

/**
 * 从描述中提取核心场景
 */
export function extractScenePrompt(text) {
  const cleaned = text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/`/g, '')
    .replace(/🎲|🎭|⚔️|🛡️|🗺️|📖|🏰|🌲|🌊|🔥|💀|✨|👤|🐉|🖼️/g, '')
    .trim();

  const sentences = cleaned.split(/[。！？\n]/).filter(s => s.trim().length > 10);
  const prompt = sentences.slice(0, 3).join('，').trim();
  if (prompt.length < 10) return cleaned.substring(0, 200);
  return prompt.substring(0, 300);
}

/**
 * 优化 prompt
 */
export function enhancePrompt(chineseText) {
  const stylePrefix = 'fantasy art, cinematic lighting, detailed, dark atmosphere';
  const cleaned = chineseText.replace(/\*\*|`/g, '').substring(0, 400);
  return `${stylePrefix}, ${cleaned}`;
}
