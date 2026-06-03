/**
 * 跑团故事引擎 - 后端 API 代理
 * 将前端请求转发到 DeepSeek API (OpenAI 兼容接口)
 */
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3001;
const DEEPSEEK_BASE = 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

// 系统提示词 - GM 人设
const SYSTEM_PROMPT = `你是一位资深的 TRPG 守秘人(Game Master)，你的任务是通过对话带领玩家进行一场精彩的互动故事冒险。

## 你的风格
- 你是故事的叙述者、世界的描绘者、NPC的扮演者
- 用生动、沉浸式的语言描述场景、人物和事件
- 根据玩家的行动，推动剧情发展，给出合理的后果
- 在关键不确定的时刻，可以要求玩家进行属性/技能检定
- 保持故事的连贯性，记住之前发生的事情
- 营造氛围感——紧张、神秘、热血或恐怖，视场景而定

## 骰子机制
- 当玩家尝试有风险/不确定的行动时，你可以说"请投一个 d20"或"来一个感知检定"
- 玩家会用 "/r 1d20" 告诉你结果，你要根据结果描述成败
- 你也可以主动替NPC投骰并描述结果

## 互动方式
- 玩家描述角色的行动、对话或决策
- 你描述世界的反应、NPC的回应、事件的发展
- 像一个真正的跑团游戏一样，你们共同创作故事

## 注意事项
- 不要替玩家决定他们角色的行动
- 保持中立公正，不要故意放水也不要刻意刁难
- 如果玩家做了很蠢的事，让后果自然发生
- 用中文回复，保持沉浸感

## 重要：保持故事连续性
- **禁止主动结束故事或开启新篇章**，除非玩家明确要求"结束冒险"或"开新故事"
- 持续推动当前剧情发展，保持故事的连贯性
- 每次回复都必须基于之前的对话历史推进，让故事向前发展
- 不要跳过时间、不要擅自总结收尾、不要替故事画句号

现在，等待玩家设定他们的角色和想要体验的故事类型，然后开始冒险吧！`;

const SYSTEM_TOKEN_BUDGET = 2800; // system prompt 约占 ~2800 token 预算（实际约 500 字符）

/**
 * 粗略估算文本 token 数
 * 中文 ≈ 1.5 token/字符，英文 ≈ 0.25 token/字符
 */
function estimateTokens(text) {
  if (!text) return 0;
  let cjk = 0, other = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0);
    // CJK + 日文 + 韩文 Unicode 范围
    if ((code >= 0x4E00 && code <= 0x9FFF) ||
        (code >= 0x3040 && code <= 0x309F) || // 日文平假名
        (code >= 0x30A0 && code <= 0x30FF) || // 日文片假名
        (code >= 0xAC00 && code <= 0xD7AF)) { // 韩文
      cjk++;
    } else {
      other++;
    }
  }
  return Math.ceil(cjk * 1.5 + other * 0.25);
}

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, apiKey } = req.body;

    const dsApiKey = apiKey || process.env.DEEPSEEK_API_KEY;

    if (!dsApiKey) {
      return res.status(400).json({
        error: '请设置 DeepSeek API Key！在右上角设置按钮中输入你的 DeepSeek API Key，或在 .env 文件中设置 DEEPSEEK_API_KEY。',
      });
    }

    // Token 感知截断：从后往前取消息，确保不超 28K（留 4K 给回复）
    const MAX_TOKENS = 28000;
    const chatMessages = [{ role: 'system', content: SYSTEM_PROMPT }];
    let used = estimateTokens(SYSTEM_PROMPT);
    const contextMessages = [];

    for (let i = messages.length - 1; i >= 0; i--) {
      const tokens = estimateTokens(messages[i].text);
      if (used + tokens > MAX_TOKENS && contextMessages.length >= 2) break;
      used += tokens;
      contextMessages.unshift({
        role: messages[i].type === 'user' ? 'user' : 'assistant',
        content: messages[i].text,
      });
    }

    chatMessages.push(...contextMessages);

    // 调用 DeepSeek API (流式)
    const response = await fetch(`${DEEPSEEK_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dsApiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: chatMessages,
        max_tokens: 4096,
        temperature: 0.8,
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      if (response.status === 401) {
        return res.status(401).json({ error: 'DeepSeek API Key 无效，请检查后重试。' });
      }
      if (response.status === 429) {
        return res.status(429).json({ error: 'API 请求太频繁，请稍后再试。' });
      }
      return res.status(response.status).json({
        error: err.error?.message || `API 请求失败 (${response.status})`,
      });
    }

    // 流式转发 SSE
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Transfer-Encoding', 'chunked');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const data = trimmed.slice(6);
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            res.write(content);
          }
        } catch {
          // 跳过解析失败的帧
        }
      }
    }

    res.end();

  } catch (err) {
    console.error('API Error:', err.message);
    res.status(500).json({ error: `AI 召唤失败: ${err.message}` });
  }
});

// ========== 图片生成代理 ==========
// 支持多种后端: Pollinations (免费) / OpenAI / 自定义兼容 API
const IMAGE_CACHE = new Map();
const CACHE_TTL = 10 * 60 * 1000;

app.post('/api/image', async (req, res) => {
  try {
    const { prompt, provider, apiKey, baseUrl, model, size } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: '请提供 prompt 参数' });
    }

    // 缓存检查
    const cacheKey = `${provider || 'pollinations'}:${prompt.substring(0, 200)}`;
    const cached = IMAGE_CACHE.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      res.setHeader('Content-Type', cached.contentType);
      res.setHeader('X-Cache', 'HIT');
      return res.send(cached.data);
    }

    console.log(`🖼️ [${provider || 'pollinations'}] ${prompt.substring(0, 80)}...`);

    let imgRes;
    const prov = provider || 'pollinations';

    // 限制 prompt 长度 (DALL-E 限制 4000 字符，保守取 1000)
    const safePrompt = (prov === 'openai' || prov === 'custom')
      ? prompt.substring(0, 1000)
      : prompt;

    if (prov === 'pollinations') {
      // Pollinations.ai — 免费，有时会限流
      const seed = Math.floor(Math.random() * 100000);
      imgRes = await fetch(
        `https://image.pollinations.ai/prompt/${encodeURIComponent(safePrompt)}?seed=${seed}`,
        { headers: { 'User-Agent': 'TRPG-Storyteller/1.0' } }
      );
    } else if (prov === 'openai') {
      // OpenAI DALL-E
      imgRes = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-image-1',
          prompt: safePrompt,
          n: 1,
          size: size || '1024x1024',
        }),
      });
    } else if (prov === 'custom') {
      // 自定义 OpenAI 兼容 API
      const endpoint = `${baseUrl || 'https://api.openai.com'}/v1/images/generations`;
      const customBody = {
        model: model || 'flux',
        prompt: safePrompt,
        n: 1,
      };
      if (size) customBody.size = size;
      imgRes = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(customBody),
      });
    } else {
      return res.status(400).json({ error: `未知的图片引擎: ${prov}` });
    }

    if (!imgRes.ok) {
      let errMsg = `图片生成失败 (${imgRes.status})`;
      try {
        const errBody = await imgRes.text();
        const errJson = JSON.parse(errBody);
        if (errJson.error?.message) errMsg = errJson.error.message;
        else if (errJson.error) errMsg = typeof errJson.error === 'string' ? errJson.error : JSON.stringify(errJson.error);
        console.error(`图片生成失败 (${imgRes.status}): ${errMsg}`);
      } catch {
        console.error(`图片生成失败 (${imgRes.status})`);
      }

      if (imgRes.status === 402) {
        return res.status(503).json({ error: 'Pollinations 免费额度用尽，请在设置中切换其他图片 API。' });
      }
      if (imgRes.status === 401 || imgRes.status === 403) {
        return res.status(401).json({ error: `图片 API Key 无效或没有权限: ${errMsg}` });
      }
      return res.status(imgRes.status).json({ error: errMsg });
    }

    // 根据后端类型解析响应
    let imageUrl;
    if (prov === 'pollinations') {
      // Pollinations 直接返回图片二进制
      const contentType = imgRes.headers.get('content-type') || 'image/jpeg';
      const data = Buffer.from(await imgRes.arrayBuffer());
      IMAGE_CACHE.set(cacheKey, { data, contentType, time: Date.now() });
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=600');
      res.setHeader('X-Cache', 'MISS');
      return res.send(data);
    } else {
      // OpenAI 兼容格式
      const json = await imgRes.json();
      const imgData = json.data?.[0];

      // 格式1: { url: "..." } — DALL-E 旧格式
      // 格式2: { b64_json: "..." } — GPT Image 新格式
      if (imgData?.b64_json) {
        const contentType = 'image/png';
        const data = Buffer.from(imgData.b64_json, 'base64');
        IMAGE_CACHE.set(cacheKey, { data, contentType, time: Date.now() });
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=600');
        res.setHeader('X-Cache', 'MISS');
        return res.send(data);
      }

      if (imgData?.url) {
        const download = await fetch(imgData.url);
        const contentType = download.headers.get('content-type') || 'image/png';
        const data = Buffer.from(await download.arrayBuffer());
        IMAGE_CACHE.set(cacheKey, { data, contentType, time: Date.now() });
        res.setHeader('Content-Type', contentType);
        res.setHeader('Cache-Control', 'public, max-age=600');
        res.setHeader('X-Cache', 'MISS');
        return res.send(data);
      }

      return res.status(500).json({ error: 'API 返回格式异常，未找到图片数据 (url/b64_json)。' });
    }

  } catch (err) {
    console.error('图片代理错误:', err.message);
    res.status(500).json({ error: `图片代理失败: ${err.message}` });
  }
});

app.listen(PORT, () => {
  console.log(`🐉 跑团故事引擎已启动: http://localhost:${PORT}`);
  console.log(`   DeepSeek API: ${DEEPSEEK_BASE}/chat/completions`);
  console.log(`   模型: ${MODEL}`);
  console.log(`   图片代理: http://localhost:${PORT}/api/image?prompt=...`);
});
