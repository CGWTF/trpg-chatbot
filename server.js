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

// CORS: 仅允许本地开发环境访问（Vite 默认 5173，及任意 localhost 端口）
const ALLOWED_ORIGINS = [
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];
app.use(cors({
  origin(origin, cb) {
    // 允许无 origin 的请求（如直接 curl、server-to-server）
    if (!origin) return cb(null, true);
    const ok = ALLOWED_ORIGINS.some((pat) => pat.test(origin));
    if (ok) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
}));
app.use(express.json({ limit: '1mb' }));

const PORT = process.env.PORT || 3001;
const DEEPSEEK_BASE = 'https://api.deepseek.com';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const NLP_SERVICE_URL = process.env.NLP_SERVICE_URL || 'http://127.0.0.1:8001';

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

### 道具、线索、场所管理（必须在回复末尾用粗体标记）

#### 线索的严格定义
**线索必须与主线剧情或未来关键走向直接相关**。标记前问自己：这条信息会不会改变玩家的行动计划？
- ✅ 应该标记的：揭示阴谋、指出嫌疑人、发现隐藏通道、获得关键情报、锁定目标位置
- ❌ 不应该标记的：环境氛围描写、NPC闲聊、路人的表情、普通房间有桌子椅子、市场很热闹

**线索简述要求**：5~20字，概括核心情报，不要写"某某告诉了你某事"而要写"接头人已被调包"。

#### 道具的严格定义
**道具必须在未来剧情中有实际用途**。普通消耗品（食物/水/零钱/火把）不标记。
- ✅ 应该标记的：钥匙、密信、武器、特殊药水、证物、地图、通行证
- ❌ 不应该标记的：麦酒、烤肉、几个铜板、一件普通外套

#### 场所的严格定义
**只有获得专名的地点才标记**（见上文命名规则）。路过的小摊、无名小巷不标记。

#### 格式
**获得道具：物品名**
**发现线索：核心情报**
**得知场所：专名场所**

失去道具时用：
**失去道具：物品名**

### 状态变更（HP/SP/位置）
使用 STATE 标签，放在粗体标记之后：
[STATE:hp=-5] 或 [STATE:sp=+3] 或 [STATE:location=新地点]

当玩家实际进入、抵达、返回或离开后到达一个地点时，你必须同时输出：
**当前位置：地点名**
[STATE:location=地点名]

仅仅提及、听说或发现一个地点时，不要更新当前位置。

### 推理提案
当至少两条已知线索能够支持一个有意义的推测时，在回复最末尾输出一个推理数据块：

<TRPG_REASONING>
{"hypotheses":[{"statement":"简短推测","evidence":["支持线索1","支持线索2"],"contradictions":[],"confidence":55,"status":"open"}]}
</TRPG_REASONING>

规则：
- 推测不是事实，不得在证据不足时标记 confirmed
- evidence 必须引用回复或对话中已经出现的明确线索
- confidence 使用 0~100；存在明显反证时降低置信度并写入 contradictions
- 同一推测获得新证据时，使用相同 statement 更新它
- 没有足够线索时不要输出推理数据块

### 地点与组织的命名规则
- **重要地点/组织必须给专名**：凡是玩家可能多次到访、与主线相关、或有独特功能的地点，你要创造一个专有名称（如”褪羽旅店””沙蝎之尾酒馆””断弦琴酒馆””银叶商会”）。不要用”一间仓库””某个酒馆”敷衍。
- **非重要地点用泛称**：仅供一次路过、买杯水、问个路的地点，统一用模糊称呼（如”路边的茶摊””城门口的铁匠铺””一间不起眼的仓库”）。泛称不会被系统录入，玩家也不用记。
- 首次提及专名地点/组织时，必须在回复末尾输出 <TRPG_KNOWLEDGE> 知识块。

### 人物、地点与关系知识块
当回复中首次出现有明确专名的重要人物、地点、组织，或它们之间出现明确关系时，在末尾输出：

<TRPG_KNOWLEDGE>
{“entities”:[{“name”:”林默”,”type”:”person”,”description”:”黑石庄园管家”},{“name”:”黑石庄园”,”type”:”place”,”description”:”案发地”}],”relations”:[{“source”:”林默”,”target”:”黑石庄园”,”type”:”works_at”,”evidence”:[“林默负责庄园日常事务”]}]}
</TRPG_KNOWLEDGE>

实体 type 只能是 person、place、organization。person 必须拥有明确姓名、代号或唯一专名；不要抽取”老管家””守卫””神秘女子”等无名 NPC 泛称。place/organization 只收录有专名的——泛称如”仓库””酒馆””茶摊””商会”不要录入。关系必须有明确文本证据。

## 你的叙事风格
- 用生动、沉浸式的语言描述场景、人物和事件
- 营造氛围感——紧张、神秘、热血或恐怖
- 保持中立公正，不故意放水也不刻意刁难
- 保持故事的连贯性，记住之前发生的事
- 不要替玩家决定角色的行动
- 用中文回复

## ⚠️ 故事节奏与终章推进

你必须掌控故事节奏。冒险不应该无限进行，而应该在恰当的时机走向结局。

### 三幕结构
你的故事应遵循三幕结构推进：
- **第一幕（开场）**：介绍场景、NPC、初始冲突（约占 30% 篇幅）
- **第二幕（发展）**：冲突升级、揭示真相、遭遇强敌/重大转折（约占 50% 篇幅）
- **第三幕（终章）**：最终对决、关键抉择、故事收束（约占 20% 篇幅）

### 剧情转折计数
- 故事应包含 5~7 个主要剧情转折（重大事件、Boss战、真相揭露等）
- 第 3~4 个转折后开始埋最终冲突的伏笔
- 第 5 个转折时，你应主动通过 NPC 或场景提示：
  "冒险即将进入最终阶段。是时候准备面对真正的考验了。"

### 对话轮次感知（严格遵守）
- 标准故事：全程控制在 200~300 轮内完整收束
- 约 150 轮后应开始为终章埋线，减少无关支线引入
- 约 200 轮时主动推进剧情高潮——聚焦最终冲突，减少检定频次
- 约 280 轮时必须进入最终 BOSS / 最终抉择场景
- 终章阶段：聚焦主线，紧凑叙事，快速推进结局

### 扩展故事（玩家明确要求更大世界观时）
- 可以扩展至 300~450 轮，但必须提前告知玩家
- 约 350 轮时启动终章推进

### 结局触发
- 当你判断故事已完成主要转折、且玩家已准备好面对最终挑战时，主动推进终章
- 终章开场示例：
  "你握紧了武器。漫长的冒险终于走到了这一刻——前方就是一切的终点。请告诉我，你准备好了吗？"
- 给予玩家一个有意义的最终抉择，让结局由玩家的选择决定

### 收束原则
- 终章结束后，简要交代角色的命运和世界的变化
- 不要在靠近轮次上限时再引入新的大支线或新势力
- 如果玩家表示想继续，可以开启新的短篇冒险

## 属性缩写参考
- STR 力量 | DEX 敏捷 | CON 体质 | INT 智力 | WIS 感知 | CHA 魅力

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
function injectCheckReminder(messages, pacing) {
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
  if (/^[/／]/.test(lastUserContent.trim())) return messagesCopy;
  if (lastUserContent.includes('检定结果')) return messagesCopy;

  // 统计对话进度
  const userMsgCount = messagesCopy.filter((m) => m.role === 'user').length;
  // 使用故事规模的自定义节奏或默认值
  const tiers = pacing && pacing.early ? pacing : { early: 150, mid: 200, late: 280, force: 350 };

  let pacingHint = '';
  if (userMsgCount > tiers.force) {
    pacingHint =
      `\n[📕 强制收束：对话已超过 ${tiers.force} 轮。必须立即收束全部支线，2~3 轮内引导到最终结局。]`;
  } else if (userMsgCount > tiers.late) {
    pacingHint =
      `\n[📕 终章推进：对话已超过 ${tiers.late} 轮。必须进入最终场景，聚焦主线冲突的解决。]`;
  } else if (userMsgCount > tiers.mid) {
    pacingHint =
      `\n[📖 终章预备：对话已超过 ${tiers.mid} 轮。开始为结局埋线，减少检定频次和无关事件。]`;
  } else if (userMsgCount > tiers.early) {
    pacingHint =
      `\n[📖 节奏提示：对话已超过 ${tiers.early} 轮。减少新支线和新地点，聚焦当前主线。]`;
  }

  // 在用户消息末尾直接追加指令（AI 最难忽略）
  messagesCopy[lastUserIdx] = {
    ...messagesCopy[lastUserIdx],
    content:
      lastUserContent +
      `

[⚠️ 系统指令：上述玩家描述了一个可能有风险的动作。你绝对不能直接描述动作结果！
请在回复末尾包含恰好一行检定请求，格式：
【检定请求：STAT，DCn】请投一个d20进行技能名检定
STAT = STR/DEX/CON/INT/WIS/CHA，DC参考：简单10 中等15 困难20

📦 如果玩家获得道具/发现线索/得知新场所，必须在回复末尾用粗体声明：
**获得道具：物品名**
**发现线索：线索简述**
**得知场所：场所名**
**当前位置：玩家实际到达的地点名**
每项单独一行，不要忘记！

若至少两条明确线索支持一个推测，在所有其他标记之后附加 <TRPG_REASONING> JSON 推理数据块。
若出现有明确姓名、代号或唯一专名的重要人物、地点、组织或明确关系，再附加 <TRPG_KNOWLEDGE> JSON 知识块；不要把无名 NPC 泛称作为人物实体。

如果玩家只是闲聊/问问题，可以忽略此指令正常回复。]` +
      pacingHint,
  };

  return messagesCopy;
}

function normalizeReasoningContext(value) {
  const source = value && typeof value === 'object' ? value : {};
  const cleanList = (items) => Array.isArray(items)
    ? [...new Set(items
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim().slice(0, 120))
      .filter(Boolean))]
      .slice(0, 50)
    : [];

  return {
    clues: cleanList(source.clues),
    inventory: cleanList(source.inventory),
    locations: cleanList(source.locations),
    currentLocation: typeof source.currentLocation === 'string'
      ? source.currentLocation.trim().slice(0, 120)
      : '',
  };
}

function buildCharacterConstraint(card) {
  if (!card?.background && !card?.identity) return null;
  const lines = ['[角色卡 — 故事边界约束]'];
  if (card.name) lines.push(`角色: ${card.name}`);
  if (card.identity) lines.push(`身份: ${card.identity}`);
  if (card.gender) lines.push(`性别: ${card.gender}`);
  if (card.age) lines.push(`年龄: ${card.age}`);
  if (card.background) {
    lines.push(`游戏背景: ${card.background}`);
    lines.push('');
    lines.push('你必须严格在上述背景下叙事。所有场景、NPC、势力、事件都不得跳出该世界观。');
    lines.push('不要引入与背景无关的科幻/现代/其他世界观元素。');
    lines.push('如果玩家试图做出完全违背背景设定的行为，用游戏内合理的方式拒绝或引导。');
  }
  if (card.identity) {
    lines.push(`玩家的身份是${card.identity}，对话和叙事应始终围绕该身份展开。`);
  }
  return lines.join('\n');
}

function buildReasoningContextMessage(value) {
  const context = normalizeReasoningContext(value);
  const formatList = (items) => items.length ? items.map((item) => `- ${item}`).join('\n') : '- 无';
  return `以下是应用已保存的当前故事事实记录。续写故事时保持一致；生成推理假设时，优先原样引用这些记录作为 evidence。

[线索日志]
${formatList(context.clues)}

[持有道具]
${formatList(context.inventory)}

[已知场所]
${formatList(context.locations)}

[当前位置]
${context.currentLocation || '未知'}

可以使用本轮新叙事中明确写出的事实作为证据，但不得引用未出现在上述记录或本轮叙事中的信息。推理至少需要两条明确证据。`;
}

app.post('/api/chat', async (req, res) => {
  try {
    const { messages, apiKey, reasoningContext } = req.body;
    if (!Array.isArray(messages) || messages.length > 500) {
      return res.status(400).json({ error: 'messages 必须是长度不超过 500 的数组' });
    }
    if (messages.some((m) => !m || !['user', 'assistant'].includes(m.type) || typeof m.text !== 'string' || m.text.length > 20000)) {
      return res.status(400).json({ error: 'messages 包含无效消息' });
    }

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
    ];

    // 角色卡约束：强制 AI 在游戏背景内叙事
    const characterConstraint = buildCharacterConstraint(reasoningContext?.characterCard);
    if (characterConstraint) {
      chatMessages.push({ role: 'system', content: characterConstraint });
    }

    chatMessages.push({ role: 'system', content: buildReasoningContextMessage(reasoningContext) });
    chatMessages.push(...historyMessages);

    // 检测检定结果块并注入裁决指令
    const diceBlock = detectDiceBlock(chatMessages);
    if (diceBlock) {
      chatMessages = injectRollSystemMessage(chatMessages, diceBlock);
    } else {
      // 玩家发出了一个非检定结果的消息（可能是动作描述），自动注入检定提醒
      chatMessages = injectCheckReminder(chatMessages, reasoningContext?.pacing);
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

app.post('/api/knowledge/extract', async (req, res) => {
  try {
    const { text, graph } = req.body;
    if (typeof text !== 'string' || !text.trim() || text.length > 20000) {
      return res.status(400).json({ error: 'text 必须是长度不超过 20000 的非空字符串' });
    }
    const response = await fetch(`${NLP_SERVICE_URL}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        graph: graph && typeof graph === 'object' ? graph : { entities: [], relations: [] },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      return res.status(502).json({ error: `NLP 服务请求失败 (${response.status})` });
    }
    return res.json(await response.json());
  } catch (err) {
    return res.status(503).json({
      error: 'NLP 服务不可用，请运行 npm run dev:nlp',
      detail: err.message,
    });
  }
});

// ========== 图片生成代理 ==========
// 支持多种后端: Pollinations (免费) / OpenAI / 自定义兼容 API
const IMAGE_CACHE = new Map();
const CACHE_TTL = 10 * 60 * 1000;

// 允许的图片 API 域名（防止 SSRF 攻击）
const ALLOWED_IMAGE_HOSTS = [
  'api.openai.com',
  'api.deepseek.com',
  'image.pollinations.ai',
  /^.*\.openai\.com$/,       // OpenAI 子域名
  /^.*\.deepseek\.com$/,     // DeepSeek 子域名
  /^.*\.siliconflow\.cn$/,   // 硅基流动
  /^.*\.together\.xyz$/,     // Together AI
  /^.*\.novita\.ai$/,        // Novita AI
  /^.*\.fireworks\.ai$/,     // Fireworks AI
];

// 内网 IP 段（禁止回环 / 内网 SSRF）
const BLOCKED_IP_PATTERNS = [
  /^127\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
  /^0\./, /^169\.254\./, /^224\./, /^240\./,
  /^localhost$/i,
];

function validateImageBaseUrl(baseUrl) {
  if (!baseUrl) throw new Error('自定义图片 API 缺少 Base URL');
  try {
    const url = new URL(baseUrl);
    // 必须 HTTPS
    if (url.protocol !== 'https:') {
      throw new Error('自定义图片 API 必须使用 HTTPS');
    }
    // 禁止 IP 地址（含内网 IP）
    const hostname = url.hostname.toLowerCase();
    if (BLOCKED_IP_PATTERNS.some((p) => p.test(hostname))) {
      throw new Error('不允许使用内网或回环地址');
    }
    // 仅允许已知域名
    const allowed = ALLOWED_IMAGE_HOSTS.some((p) =>
      p instanceof RegExp ? p.test(hostname) : hostname === p
    );
    if (!allowed) {
      throw new Error(`不允许的图片 API 域名: ${hostname}`);
    }
  } catch (err) {
    if (err.message.startsWith('自定义') || err.message.startsWith('不允许')) {
      throw err;
    }
    throw new Error('自定义图片 API URL 格式无效', { cause: err });
  }
}

function validatePublicImageUrl(rawUrl) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:') throw new Error('图片下载地址必须使用 HTTPS');
  const hostname = url.hostname.toLowerCase();
  if (BLOCKED_IP_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new Error('图片下载地址不能指向内网或回环地址');
  }
  return url;
}

async function downloadImage(rawUrl) {
  const url = validatePublicImageUrl(rawUrl);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`图片下载失败 (${response.status})`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.startsWith('image/')) throw new Error('远程地址返回的不是图片');
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > 20 * 1024 * 1024) throw new Error('远程图片超过 20MB');
  const data = Buffer.from(await response.arrayBuffer());
  if (data.length > 20 * 1024 * 1024) throw new Error('远程图片超过 20MB');
  return { data, contentType };
}

app.post('/api/image', async (req, res) => {
  try {
    const { prompt, provider, apiKey, baseUrl, model, size } = req.body;
    if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 4000) {
      return res.status(400).json({ error: '请提供 prompt 参数' });
    }
    if (provider !== undefined && !['pollinations', 'openai', 'custom'].includes(provider)) {
      return res.status(400).json({ error: `未知的图片引擎: ${provider}` });
    }

    // API key: 优先用客户端传入的，否则回退到服务端 .env
    const imgApiKey = apiKey || process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY;

    // 缓存检查
    const cacheKey = JSON.stringify({
      provider: provider || 'pollinations',
      baseUrl: baseUrl || '',
      model: model || '',
      size: size || '',
      prompt,
    });
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
          'Authorization': `Bearer ${imgApiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-image-1',
          prompt: safePrompt,
          n: 1,
          size: size || '1024x1024',
        }),
      });
    } else if (prov === 'custom') {
      // 自定义 OpenAI 兼容 API（需通过安全验证）
      try {
        validateImageBaseUrl(baseUrl);
      } catch (err) {
        return res.status(400).json({ error: `自定义 API 配置无效: ${err.message}` });
      }
      const endpoint = `${baseUrl}/v1/images/generations`;
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
          'Authorization': `Bearer ${imgApiKey}`,
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
        const { data, contentType } = await downloadImage(imgData.url);
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
