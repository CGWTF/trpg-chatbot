import { enhancePrompt, fetchGeneratedImage } from '../utils/imageGen';
import { getImageConfig } from '../utils/storage';

/**
 * 图片生成插件
 * beforeSend: 拦截 /image 指令 → 短路
 * onImageGenerated: 图片生成后回调
 */
export default function createImagePlugin({ onResult } = {}) {
  return {
    name: 'image',

    /** 拦截 /image /img 指令 → 短路 */
    beforeSend(input) {
      const text = input.trim();
      if (text.startsWith('/image ') || text.startsWith('/img ')) {
        const prompt = text.replace(/^\/(image|img)\s*/, '').trim();
        if (!prompt) {
          return { result: { text: '请提供图片描述，如: `/image 一座黑暗的古堡坐落在悬崖边`', type: 'system', source: 'image' } };
        }
        return { result: { text: prompt, type: 'image-request', source: 'image' } };
      }
      return input;
    },

    /** 图片生成完成后回调 */
    onImageGenerated(info) {
      onResult?.(info);
    },

    /** 执行图片生成 */
    async generateImage(prompt) {
      const enhanced = enhancePrompt(prompt);
      const { blobUrl } = await fetchGeneratedImage(enhanced);

      const config = getImageConfig();
      const engineName = config.provider === 'openai' ? `OpenAI (${config.model || 'gpt-image'})`
        : config.provider === 'custom' ? (config.model || 'Custom API')
        : 'Pollinations.ai (Flux)';

      return {
        text: `🖼️ **场景配图**\n\n${prompt}`,
        type: 'bot',
        image: { url: blobUrl, prompt: enhanced, engine: engineName },
      };
    },
  };
}
