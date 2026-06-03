import { enhancePrompt, fetchGeneratedImage } from '../utils/imageGen';
import { getImageConfig } from '../utils/storage';

/**
 * 图片生成插件
 * 生命周期: beforeProcess (拦截 /image), onImageGenerated
 */
export default function createImagePlugin({ onResult }) {
  return {
    name: 'image',

    beforeProcess(input) {
      const text = input.trim();
      if (text.startsWith('/image ') || text.startsWith('/img ')) {
        const prompt = text.replace(/^\/(image|img)\s*/, '').trim();
        if (!prompt) {
          return { text: '请提供图片描述，如: `/image 一座黑暗的古堡坐落在悬崖边`', type: 'system', source: 'image' };
        }
        return { text: prompt, type: 'image-request', source: 'image' };
      }
      return text;
    },

    async generateImage(prompt) {
      const enhanced = enhancePrompt(prompt);
      const { blobUrl, engine } = await fetchGeneratedImage(enhanced);

      const config = getImageConfig();
      const engineName = config.provider === 'openai' ? `OpenAI (${config.model || 'gpt-image'})`
        : config.provider === 'custom' ? (config.model || 'Custom API')
        : 'Pollinations.ai (Flux)';

      const result = {
        text: `🖼️ **场景配图**\n\n${prompt}`,
        type: 'bot',
        image: { url: blobUrl, prompt: enhanced, engine: engineName },
      };

      onResult?.(result);
      return result;
    },
  };
}
