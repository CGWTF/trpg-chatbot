/**
 * 跑团助手核心逻辑
 * 功能1: 本地规则知识库问答
 * 功能2: 骰子投掷
 * 功能3: 扮演提示
 * 功能4: AI 互动故事引擎 (通过后端API)
 */

import { rollDice, formatDiceResult } from './dice';

// ========== 规则知识库 ==========
const knowledgeBase = {
  // D&D / D20 系统
  '属性': 'D&D 中六大属性: 力量(STR)、敏捷(DEX)、体质(CON)、智力(INT)、感知(WIS)、魅力(CHA)。属性值通常在 1-20 之间，10 为普通人水平。',
  '属性调整值': '属性调整值 = (属性值 - 10) / 2 向下取整。例如: 属性12→+1, 属性14→+2, 属性8→-1。',
  '豁免': '豁免检定(Saving Throw): d20 + 属性调整值 + 熟练加值(如果熟练)，对抗 DC。三种主要豁免: 强韧(CON)、反射(DEX)、意志(WIS)。',
  'ac': 'AC(Armor Class/护甲等级): 表示角色被击中的难度。AC = 护甲基础值 + DEX调整值(受护甲类型限制)。无护甲时 AC = 10 + DEX调整值。',
  '先攻': '先攻(Initiative): 战斗开始时投掷 d20 + DEX调整值，按结果从高到低决定行动顺序。',
  '攻击': '攻击检定: d20 + 熟练加值 + 属性调整值(力量近战/敏捷远程) vs 目标AC。命中后投伤害骰。',
  '伤害': '伤害投掷根据武器而定。例如: 长剑 1d8+STR, 短弓 1d6+DEX。近战用力量, 远程用敏捷, 灵巧武器可选。',
  '熟练加值': '熟练加值(Proficiency Bonus): 随等级增长。1-4级 +2, 5-8级 +3, 9-12级 +4, 13-16级 +5, 17-20级 +6。',
  '优势': '优势(Advantage): 投掷两次 d20 取较高值。劣势(Disadvantage): 投掷两次 d20 取较低值。优势和劣势互相抵消。',
  '重击': '攻击检定为自然20时触发重击(Critical Hit)，伤害骰翻倍。自然1必定失手。',
  '短休': '短休(Short Rest): 至少1小时的休息，可花费生命骰回复HP，部分职业恢复资源。',
  '长休': '长休(Long Rest): 至少8小时的休息，回复全部HP和一半生命骰，恢复法术位等资源。每24小时只能一次。',
  '生命骰': '每个职业有对应的生命骰(Hit Dice): 法师 d6, 游荡者 d8, 战士 d10, 野蛮人 d12。升级时投生命骰+CON调整值获得HP。',

  // COC / 克苏鲁
  'coc': '克苏鲁的呼唤(CoC): 使用 d100 系统。技能值 ≤ 技能等级为成功。大成功: 投出 ≤ 技能等级的1/5。大失败: 投出 ≥ 96(或100)。',
  'san': 'SAN值(理智值): 初始 = POW(意志)，遭遇恐怖事物时进行 SAN 检定，失败则损失理智值。降至0则永久疯狂。',
  '克苏鲁': '克苏鲁的呼唤核心规则: d100检定, 7版规则使用常规/困难/极难等级。角色属性: STR, CON, DEX, APP, POW, SIZ, INT, EDU。',
  'coc属性': 'CoC 7版属性: 力量(STR)、体质(CON)、敏捷(DEX)、外貌(APP)、意志(POW)、体型(SIZ)、智力(INT)、教育(EDU)。范围通常 15-90。',

  // 通用
  'rp': '角色扮演(Role Play): 扮演你的角色，根据角色的性格、背景、阵营做出决策。好的RP让游戏更有沉浸感！',
  'kp': 'KP(守秘人/Keeper): CoC中的主持人，负责描述场景、扮演NPC、裁定规则。',
  'dm': 'DM(地下城主/Dungeon Master): D&D中的主持人，负责设计冒险、扮演NPC、裁决规则。',
  'gm': 'GM(Game Master): 游戏主持人，统称。负责引导游戏、描述场景、裁定规则、扮演NPC。',
  'pc': 'PC(Player Character): 玩家角色。每个玩家控制一个PC，通过PC与游戏世界互动。',
  'npc': 'NPC(Non-Player Character): 非玩家角色。由GM控制的角色，用于推动剧情。',
  '阵营': 'D&D 阵营(Alignment): 秩序/中立/混乱 × 善良/中立/邪恶 = 九宫格。例如: 守序善良(LG)、混乱中立(CN)、中立邪恶(NE)。',
  '属性检定': '属性检定(Ability Check): d20 + 属性调整值 vs DC。例如: 力量检定推门, 感知检定察觉陷阱。',
  '技能': '技能检定: d20 + 属性调整值 + 熟练加值(如果熟练该技能)。例如: 察觉(感知)、潜行(敏捷)、说服(魅力)。',
};

const greetings = [
  '欢迎来到冒险者公会！🎲 我是你的跑团助手，可以帮你:\n• 🎲 投骰子: `/r 2d6+1`\n• 📖 查规则: 直接问我"AC是什么"或"先攻怎么算"\n• 📖 故事模式: 和我说"开始一段冒险"进入互动故事\n• 🎭 角色扮演提示: 问我"RP建议"',
  '勇者，你来了！⚔️ 有什么我能帮你的？\n试试对我说: "投一个先攻" 或 "开始一个新的冒险故事"',
  '冒险开始了！🗺️ 我是你的跑团助手，可以解答规则、帮忙投骰、提供扮演灵感，还能当你的GM带你跑一段故事！',
];

const rpPrompts = [
  '🎭 **扮演挑战:** 用角色母语之外的语言说一句话，让队友猜你的意思。',
  '🎭 **扮演挑战:** 描述你的角色此刻的内心独白——他们真正在想什么？',
  '🎭 **扮演挑战:** 你的角色最害怕什么？现在这个恐惧出现了吗？',
  '🎭 **扮演挑战:** 和另一个PC聊聊你们共同的过去——编一段回忆！',
  '🎭 **扮演挑战:** 你角色的口头禅是什么？在下次对话中自然地用出来。',
  '🎭 **扮演挑战:** 描述你的角色如何度过一个普通的休息日。',
  '🎭 **扮演挑战:** 你的角色对队伍中的谁最有好感？为什么？表现出来！',
  '🎭 **扮演挑战:** 在下一个场景中，描述角色的肢体语言而非直接说话。',
  '🎭 **扮演挑战:** 你的角色有什么小习惯或怪癖？在下次描述中加入。',
  '🎭 **扮演挑战:** 回忆角色的童年——选一件事，它如何塑造了现在的你？',
];

// ========== 指令处理 ==========
function handleCommand(input, characterName) {
  const parts = input.split(/\s+/);
  const cmd = parts[0].toLowerCase();

  // 投骰指令: /r 或 /roll
  if (cmd === '/r' || cmd === '/roll') {
    const notation = parts.slice(1).join('');
    if (!notation) {
      return { text: '请指定骰子格式，如: `/r 2d6+1` 或 `/r 1d20`', type: 'system' };
    }
    return handleDiceRoll(notation);
  }

  // 帮助
  if (cmd === '/help') {
    return {
      text: `📜 **可用指令:**

🎲 **投骰指令:**
\`/r 2d6\` - 投2个6面骰
\`/r 1d20+5\` - 投d20加5修正
\`/r 3d8-1\` - 投3个d8减1
\`/r d100\` - 投百分骰

📖 **规则问答:** 直接提问即可，如"AC怎么算"、"什么是优势"、"SAN值是什么"

📖 **互动故事:** 和我说"开始冒险"、"我走进一座古堡"——我会作为GM带你进入故事世界

🎭 **扮演提示:** 输入 \`/rp\` 获取随机扮演灵感

📋 **其他指令:**
\`/help\` - 显示帮助
\`/clear\` - 清空对话`,
      type: 'system',
    };
  }

  // 扮演提示
  if (cmd === '/rp') {
    return {
      text: rpPrompts[Math.floor(Math.random() * rpPrompts.length)],
      type: 'bot',
    };
  }

  return { text: `未知指令: ${cmd}。输入 \`/help\` 查看可用指令。`, type: 'system' };
}

function handleDiceRoll(notation) {
  const result = rollDice(notation);
  return { text: formatDiceResult(result), type: 'dice' };
}

// ========== 知识库搜索 ==========
function searchKnowledge(input) {
  const lower = input.toLowerCase();

  const cnMap = {
    '属性': ['属性值', '力量', '敏捷', '体质', '智力', '感知', '魅力', 'str', 'dex', 'con', 'int', 'wis', 'cha', '六维'],
    '属性调整值': ['调整值', '属性加值', '属性调整'],
    '豁免': ['豁免', 'saving throw', '强韧', '反射', '意志'],
    'ac': ['ac', '护甲', 'armor class', '防御', '护甲等级'],
    '先攻': ['先攻', 'initiative', '行动顺序'],
    '攻击': ['攻击', 'attack', '命中', '攻击检定'],
    '伤害': ['伤害', 'damage', '伤害骰'],
    '熟练加值': ['熟练加值', 'proficiency', '熟练'],
    '优势': ['优势', 'advantage', '劣势', 'disadvantage'],
    '重击': ['重击', '暴击', 'critical', '自然20', '自然1'],
    '短休': ['短休', 'short rest', '小休'],
    '长休': ['长休', 'long rest', '大休', '长休息'],
    '生命骰': ['生命骰', 'hit dice', 'hd', '生命值'],
    'coc': ['coc', '克苏鲁', 'call of cthulhu'],
    'san': ['san', '理智', 'san值', '理智值'],
    '克苏鲁': ['克苏鲁', 'coc7', '七版'],
    'coc属性': ['coc属性', 'coc 属性', '克苏鲁属性'],
    'kp': ['kp', '守秘人', 'keeper'],
    'dm': ['dm', '地下城', 'dungeon master'],
    'gm': ['gm', '主持人', 'game master'],
    'pc': ['pc', '玩家角色', 'player character'],
    'npc': ['npc', '非玩家'],
    '阵营': ['阵营', 'alignment', '守序', '混乱', '中立善良'],
    '属性检定': ['属性检定', 'ability check', '检定'],
    '技能': ['技能', 'skill', '察觉', '潜行', '说服'],
  };

  for (const [key, keywords] of Object.entries(cnMap)) {
    if (keywords.some(kw => lower.includes(kw))) {
      return knowledgeBase[key];
    }
  }

  return null;
}

// ========== 判断是否为规则问题 ==========
function isRuleQuestion(input) {
  const lower = input.toLowerCase().trim();

  // 非常短的问题大概率是规则
  if (lower.length < 10) {
    const rulePatterns = [
      /^(什么是|什么叫|啥是|啥叫|怎么算|如何计算)/,
      /(是什么|是什么意思|怎么用|怎么投|怎么判定)/,
      /^(ac|san|kp|dm|gm|pc|npc|str|dex|con|int|wis|cha)$/i,
      /^(属性|豁免|先攻|重击|短休|长休|阵营)$/,
      /^(生命骰|熟练|优势|劣势)/,
      /怎么(算|投|判定|用)/,
      /规则/,
    ];
    return rulePatterns.some(p => p.test(lower));
  }

  // 包含"规则"或明确问规则
  if (/(规则|数据|属性值|面板|人物卡|角色卡|车卡|做卡)/.test(lower)) {
    return true;
  }

  return false;
}

// ========== 主处理入口 ==========
export function processMessage(userInput, characterName = '冒险者', useAI = false) {
  const input = userInput.trim();
  if (!input) return null;

  // 1. 指令优先
  if (input.startsWith('/')) {
    return { result: handleCommand(input, characterName), useAI: false };
  }

  // 2. 自然语言投骰
  const diceMatch = input.match(/(?:投|roll?|丢)\s*(\d*d\d+[+-]?\d*)/i);
  if (diceMatch && (input.includes('投') || input.includes('roll') || input.includes('骰') || input.includes('r '))) {
    return { result: handleDiceRoll(diceMatch[1]), useAI: false };
  }

  // 3. 打招呼
  if (/^(你好|嗨|hello|hi|hey|哈喽|在吗)[\s!！。.]*$/i.test(input)) {
    return { result: { text: greetings[Math.floor(Math.random() * greetings.length)], type: 'bot' }, useAI: false };
  }

  // 4. 感谢
  if (/^(谢谢|感谢|thanks|thank)/i.test(input)) {
    return { result: { text: `不客气，${characterName}！祝你的冒险顺利展开！⚔️🛡️`, type: 'bot' }, useAI: false };
  }

  // 5. 规则问题走本地知识库
  if (isRuleQuestion(input)) {
    const kbResult = searchKnowledge(input);
    if (kbResult) {
      return { result: { text: kbResult, type: 'bot' }, useAI: false };
    }
  }

  // 6. 其余全部走 AI 故事引擎
  return { result: null, useAI: true };
}
