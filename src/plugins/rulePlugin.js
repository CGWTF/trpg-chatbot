/**
 * 规则问答插件
 * 生命周期: onRuleQuery, beforeProcess (拦截 /help, /rp)
 */

const knowledgeBase = {
  '属性': 'D&D 中六大属性: 力量(STR)、敏捷(DEX)、体质(CON)、智力(INT)、感知(WIS)、魅力(CHA)。属性值通常在 1-20 之间，10 为普通人水平。',
  '属性调整值': '属性调整值 = (属性值 - 10) / 2 向下取整。例如: 属性12→+1, 属性14→+2, 属性8→-1。',
  '豁免': '豁免检定(Saving Throw): d20 + 属性调整值 + 熟练加值(如果熟练)，对抗 DC。三种主要豁免: 强韧(CON)、反射(DEX)、意志(WIS)。',
  'ac': 'AC(Armor Class/护甲等级): 表示角色被击中的难度。AC = 护甲基础值 + DEX调整值(受护甲类型限制)。无护甲时 AC = 10 + DEX调整值。',
  '先攻': '先攻(Initiative): 战斗开始时投掷 d20 + DEX调整值，按结果从高到低决定行动顺序。',
  '攻击': '攻击检定: d20 + 熟练加值 + 属性调整值(力量近战/敏捷远程) vs 目标AC。命中后投伤害骰。',
  '伤害': '伤害投掷根据武器而定。长剑 1d8+STR, 短弓 1d6+DEX。近战用力量，远程用敏捷，灵巧武器可选。',
  '熟练加值': '熟练加值(Proficiency Bonus): 随等级增长。1-4级 +2, 5-8级 +3, 9-12级 +4, 13-16级 +5, 17-20级 +6。',
  '优势': '优势(Advantage): 投掷两次 d20 取较高值。劣势(Disadvantage): 投掷两次 d20 取较低值。',
  '重击': '攻击检定为自然20时触发重击(Critical Hit)，伤害骰翻倍。自然1必定失手。',
  '短休': '短休(Short Rest): 至少1小时休息，可花费生命骰回复HP。',
  '长休': '长休(Long Rest): 至少8小时休息，回复全部HP和一半生命骰。每24小时只能一次。',
  '生命骰': '生命骰(Hit Dice): 法师 d6, 游荡者 d8, 战士 d10, 野蛮人 d12。',
  'coc': '克苏鲁的呼唤(CoC): 使用 d100 系统。技能值 ≤ 技能等级为成功。大成功: ≤ 技能等级的1/5。大失败: ≥ 96。',
  'san': 'SAN值(理智值): 初始 = POW，遭遇恐怖事物时进行 SAN 检定，失败损失理智值。降至0则永久疯狂。',
  'kp': 'KP(守秘人/Keeper): CoC中的主持人。',
  'dm': 'DM(地下城主/Dungeon Master): D&D中的主持人。',
  'gm': 'GM(Game Master): 游戏主持人。',
  'pc': 'PC(Player Character): 玩家角色。',
  'npc': 'NPC(Non-Player Character): 非玩家角色。',
  '阵营': 'D&D 阵营(Alignment): 秩序/中立/混乱 × 善良/中立/邪恶 = 九宫格。',
  '属性检定': '属性检定(Ability Check): d20 + 属性调整值 vs DC。',
  '技能': '技能检定: d20 + 属性调整值 + 熟练加值(如果熟练)。',
};

const keywordMap = {
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
  'kp': ['kp', '守秘人', 'keeper'],
  'dm': ['dm', '地下城', 'dungeon master'],
  'gm': ['gm', '主持人', 'game master'],
  'pc': ['pc', '玩家角色'],
  'npc': ['npc', '非玩家'],
  '阵营': ['阵营', 'alignment', '守序', '混乱', '中立善良'],
  '属性检定': ['属性检定', 'ability check', '检定'],
  '技能': ['技能', 'skill', '察觉', '潜行', '说服'],
};

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

function isRuleQuestion(input) {
  const lower = input.toLowerCase().trim();
  if (lower.length < 10) {
    const patterns = [
      /^(什么是|什么叫|啥是|啥叫|怎么算|如何计算)/,
      /(是什么|是什么意思|怎么用|怎么投|怎么判定)/,
      /^(ac|san|kp|dm|gm|pc|npc|str|dex|con|int|wis|cha)$/i,
      /^(属性|豁免|先攻|重击|短休|长休|阵营)$/,
      /怎么(算|投|判定|用)/,
    ];
    if (patterns.some(p => p.test(lower))) return true;
  }
  return /(规则|数据|属性值|面板|人物卡|角色卡|车卡|做卡)/.test(lower);
}

export default function createRulePlugin() {
  return {
    name: 'rule',

    beforeProcess(input) {
      const text = input.trim();

      if (text === '/help') {
        return {
          text: `📜 **可用指令:**
🎲 \`/r 2d6\` \`/r 1d20+5\` — 投骰
📖 直接问规则问题 — "AC怎么算"
🖼️ \`/image 描述\` — 生成图片
🎭 \`/rp\` — 随机扮演灵感
📋 \`/help\` \`/clear\``,
          type: 'system',
          source: 'rule',
        };
      }

      if (text === '/rp') {
        return {
          text: rpPrompts[Math.floor(Math.random() * rpPrompts.length)],
          type: 'bot',
          source: 'rule',
        };
      }

      return text;
    },

    onRuleQuery(input) {
      const lower = input.toLowerCase().trim();

      if (!isRuleQuestion(input)) return input;

      for (const [key, keywords] of Object.entries(keywordMap)) {
        if (keywords.some(kw => lower.includes(kw))) {
          return { text: knowledgeBase[key], type: 'bot', source: 'rule' };
        }
      }
      return input;
    },
  };
}
