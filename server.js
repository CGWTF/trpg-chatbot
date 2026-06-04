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
const SYSTEM_PROMPT = `你是一位资深的 TRPG 守秘人(Game Master)，带领玩家进行互动故事冒险。

## ⚠️ 检定机制（最高优先级 — 不遵守将破坏游戏体验）

**核心规则：玩家做出任何有风险的动作时，你必须先请求检定，绝不能直接描述结果！**

### 何时必须请求检定（判断标准：只要你不确定玩家能否成功 → 必须检定）
- 潜行、攀爬、跳跃、保持平衡、躲避陷阱 → DEX（敏捷）检定
- 察觉陷阱、搜索、察言观色、聆听、追踪 → WIS（感知）检定
- 说服、欺骗、恐吓、表演、议价 → CHA（魅力）检定
- 回忆知识、调查线索、破解谜题、解读古文 → INT（智力）检定
- 破门、举重、游泳、跳跃、擒抱 → STR（力量）检定
- 抵抗毒素、忍耐极端环境、长时间行军 → CON（体质）检定

### 检定请求格式（必须严格遵循，放在回复的末尾）

【检定请求：STAT，DCn】请投一个d20进行技能名检定

关键要求：
- STAT 必须用英文缩写：STR / DEX / CON / INT / WIS / CHA
- DCn 是难度数字，如 DC12、DC15
- "技能名"用中文，1-4个字
- 这行必须出现在你回复的末尾

正确示例：
【检定请求：DEX，DC12】请投一个d20进行潜行检定
【检定请求：WIS，DC15】请投一个d20进行察觉检定
【检定请求：STR，DC10】请投一个d20进行力量检定
【检定请求：CHA，DC14】请投一个d20进行说服检定
【检定请求：INT，DC13】请投一个d20进行调查检定

DC参考: 5=非常简单 10=简单 12=略有难度 15=中等 20=困难 25=极难 30=几乎不可能

### 玩家行动示例 → 你的正确回应
玩家说"我试着悄悄穿过走廊"
→ 你描述走廊环境，然后以【检定请求：DEX，DC12】请投一个d20进行潜行检定 结尾

玩家说"我观察房间里有没有陷阱"
→ 你描述房间细节，然后以【检定请求：WIS，DC15】请投一个d20进行察觉检定 结尾

玩家说"我试图说服守卫放行"
→ 你描述守卫的反应，然后以【检定请求：CHA，DC14】请投一个d20进行说服检定 结尾

### 收到检定结果后
你会收到如下格式的检定结果：
━━━━━━ 检定结果 ━━━━━━
检定项目: 技能名(属性)
难度等级: DC n
投掷: 1d20+n | 最终结果: n
检定结论: ✅ 成功 / ❌ 失败 / 🌟 大成功 / 💀 大失败
━━━━━━━━━━━━━━━━━━━━

你必须严格按照检定结论叙事：
- 🌟 大成功 (Natural 20): 超乎寻常的成功，附带额外好处
- ✅ 成功 (≥DC): 动作按预期完成
- ❌ 失败 (<DC): 动作未完成，带来新困境
- 💀 大失败 (Natural 1): 灾难性失败，严重后果

绝对不要忽略检定结果！检定结果决定一切。

## 你的叙事风格
- 用生动、沉浸式的语言描述场景、人物和事件
- 营造氛围感——紧张、神秘、热血或恐怖
- 保持中立公正，不故意放水也不刻意刁难
- 保持故事的连贯性，记住之前发生的事
- 不要替玩家决定角色的行动
- 用中文回复

## ⚠️ 持续推动故事
- 绝对不能主动结束当前故事或开启新故事
- 每次回复末尾留下悬念或待探索的方向
- 除非玩家明确说"结束冒险"，否则永远继续

现在，等待玩家设定角色和故事类型，然后开始冒险吧！`;

// ── 检定结果检测 & 系统消息注入 ──

/**
 * 检测消息列表中是否包含结构化检定结果块
 * @returns {{ tier: string } | null}
 */
function detectDiceBlock(messages) {
  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUserMsg) return null;
  if (!lastUserMsg.content.includes('检定结果')) return null;

  // 提取检定结论
  const tierMatch = lastUserMsg.content.match(/检定结论[：:]\s*(🌟|✅|❌|💀|⚡)\s*(.+)/);
  return tierMatch ? { tier: tierMatch[2]?.trim() || tierMatch[1] } : { tier: 'unknown' };
}

/**
 * 在检定结果消息前注入临时 system 消息，强制 AI 按检定结果裁决
 */
function injectRollSystemMessage(messages, diceBlock) {
  const messagesCopy = [...messages];
  const lastUserIdx = (() => {
    for (let i = messagesCopy.length - 1; i >= 0; i--) {
      if (messagesCopy[i].role === 'user') return i;
    }
    return -1;
  })();
  if (lastUserIdx === -1) return messagesCopy;

  const tierLabel = diceBlock.tier;
  let tierInstruction;
  if (tierLabel.includes('大成功')) {
    tierInstruction = '这次检定的结果是"大成功"。动作取得了超出预期的绝佳成果，请描述一个附带额外好处的辉煌成功。';
  } else if (tierLabel.includes('成功')) {
    tierInstruction = '这次检定的结果是"成功"。动作按预期完成，请描述玩家如何达成目标的正面结果。';
  } else if (tierLabel.includes('大失败')) {
    tierInstruction = '这次检定的结果是"大失败"。动作灾难性失败，请描述严重后果或意外的不利转折。';
  } else {
    tierInstruction = '这次检定的结果是"失败"。动作未能完成，请描述失败带来的新困境或转折，推动故事继续。';
  }

  messagesCopy.splice(lastUserIdx, 0, {
    role: 'system',
    content: `[检定裁决指令]\n${tierInstruction}\n你必须在接下来的回复中严格按照此检定结果叙述故事发展，不得忽略或重新解释检定结果。`,
  });

  return messagesCopy;
}

/**
 * 在用户消息末尾追加检定提醒指令，强制 AI 检查是否需要检定
 * 把指令直接写入用户消息内容，AI 处理用户输入时必然会看到，无法跳过
 */
function injectCheckReminder(messages) {
  const messagesCopy = [...messages];
  const lastUserIdx = (() => {
    for (let i = messagesCopy.length - 1; i >= 0; i--) {
      if (messagesCopy[i].role === 'user') return i;
    }
    return -1;
  })();
  if (lastUserIdx === -1) return messagesCopy;

  const lastUserContent = messagesCopy[lastUserIdx].content;

  // 跳过系统指令类消息（如 /r /help /image 等）和检定结果块
  if (/^[\/／]/.test(lastUserContent.trim())) return messagesCopy;
  if (lastUserContent.includes('检定结果')) return messagesCopy;

  // 在用户消息末尾直接追加指令（AI 最难忽略）
  messagesCopy[lastUserIdx] = {
    ...messagesCopy[lastUserIdx],
    content: lastUserContent + `

[⚠️ 系统指令：上述玩家描述了一个可能有风险的动作。你绝对不能直接描述动作结果！
请在回复末尾包含恰好一行检定请求，格式：
【检定请求：STAT，DCn】请投一个d20进行技能名检定
STAT = STR/DEX/CON/INT/WIS/CHA，DC参考：简单10 中等15 困难20
如果玩家只是闲聊/问问题，可以忽略此指令正常回复。]`,
  };

  return messagesCopy;
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

    // 构建 OpenAI 格式的消息列表
    // 保留开头 6 条（角色设定+故事开头）和最近 44 条，避免丢失早期上下文
    const MAX_TAIL = 44;
    const MAX_HEAD = 6;
    let historyMessages = messages.map(m => ({
      role: m.type === 'user' ? 'user' : 'assistant',
      content: m.text,
    }));

    if (historyMessages.length > MAX_HEAD + MAX_TAIL) {
      // 保留开头 + 末尾，丢掉中间
      historyMessages = [
        ...historyMessages.slice(0, MAX_HEAD),
        ...historyMessages.slice(-MAX_TAIL),
      ];
    }

    let chatMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...historyMessages,
    ];

    // 检测检定结果块并注入裁决指令
    const diceBlock = detectDiceBlock(chatMessages);
    if (diceBlock) {
      chatMessages = injectRollSystemMessage(chatMessages, diceBlock);
    } else {
      // 玩家发出了一个非检定结果的消息（可能是动作描述），自动注入检定提醒
      chatMessages = injectCheckReminder(chatMessages);
    }

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
        temperature: 0.7,
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
