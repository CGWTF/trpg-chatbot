/**
 * 骰子检定上下文工具
 *
 * - 结果分级判定 (computeOutcome)
 * - 结构化上下文构建 (buildStructuredRollContext)
 * - AI 回复解析 (parseAIForRollRequest, parseAIForStateChanges)
 * - 状态变更应用 (applyStateChanges)
 */

// ── 结果分级常量 ──

export const OUTCOME_TIERS = {
  CRITICAL_SUCCESS: { key: 'critical_success', label: '🌟 大成功', emoji: '🌟' },
  SUCCESS: { key: 'success', label: '✅ 成功', emoji: '✅' },
  MARGINAL: { key: 'marginal', label: '⚡ 勉强成功', emoji: '⚡' },
  FAILURE: { key: 'failure', label: '❌ 失败', emoji: '❌' },
  CRITICAL_FAILURE: { key: 'critical_failure', label: '💀 大失败', emoji: '💀' },
};

// ── 属性名映射 ──

const STAT_NAMES = {
  STR: '力量', DEX: '敏捷', CON: '体质', INT: '智力', WIS: '感知', CHA: '魅力',
};

export function getStatName(stat) {
  return STAT_NAMES[stat] || stat || '';
}

// ── 结果分级 ──

/**
 * 计算 d20 检定的结果分级
 * @param {object} diceResult — rollDice() 的返回值 { rolls, modTotal, sides, count }
 * @param {number|null} dc — 难度等级，null 时使用启发式判定
 * @returns {{ key, label, emoji }}
 */
export function computeOutcome(diceResult, dc = null) {
  if (!diceResult || diceResult.error) return null;

  const { rolls, modTotal, sides, count } = diceResult;
  const naturalRoll = rolls?.[0];

  // d20 system: natural 20/1 are absolute
  if (sides === 20 && count === 1 && naturalRoll !== undefined) {
    if (naturalRoll === 20) return OUTCOME_TIERS.CRITICAL_SUCCESS;
    if (naturalRoll === 1) return OUTCOME_TIERS.CRITICAL_FAILURE;
  }

  // d100 system: natural 100/1
  if (sides === 100 && count === 1 && naturalRoll !== undefined) {
    if (naturalRoll === 100) return OUTCOME_TIERS.CRITICAL_SUCCESS;
    if (naturalRoll === 1) return OUTCOME_TIERS.CRITICAL_FAILURE;
  }

  if (dc !== null && dc !== undefined) {
    // DC-based: modTotal >= dc → success
    return modTotal >= dc ? OUTCOME_TIERS.SUCCESS : OUTCOME_TIERS.FAILURE;
  }

  // No DC: heuristic for d20
  if (sides === 20 && count === 1) {
    if (modTotal >= 20) return OUTCOME_TIERS.SUCCESS;
    if (modTotal >= 10) return OUTCOME_TIERS.MARGINAL;
    return OUTCOME_TIERS.FAILURE;
  }

  // Non-d20 rolls: proportional outcome
  const mod = diceResult.modifier ? parseInt(diceResult.modifier) : 0;
  const maxPossible = count * sides + mod;
  const minPossible = count * 1 + mod;
  const range = maxPossible - minPossible || 1;
  const ratio = (modTotal - minPossible) / range;

  if (ratio >= 0.9) return OUTCOME_TIERS.CRITICAL_SUCCESS;
  if (ratio >= 0.5) return OUTCOME_TIERS.SUCCESS;
  if (ratio >= 0.2) return OUTCOME_TIERS.FAILURE;
  return OUTCOME_TIERS.CRITICAL_FAILURE;
}

// ── 结构化上下文构建 ──

/**
 * 构建发送给 AI 的结构化检定上下文
 *
 * AI 会看到如下格式：
 *   ━━━━━━ 检定结果 ━━━━━━
 *   检定项目: 察觉(感知)
 *   难度等级: DC 12
 *   投掷: 1d20+3
 *   最终结果: 20
 *   检定结论: ✅ 成功
 *   ━━━━━━━━━━━━━━━━━━━━
 *   请根据此检定结果决定故事走向。
 */
export function buildStructuredRollContext({
  notation,
  diceResult,
  dc,
  stat,
  skill,
  outcome,
}) {
  const lines = [];
  lines.push('━━━━━━ 检定结果 ━━━━━━');

  // 检定项目
  if (skill || stat) {
    const statName = getStatName(stat);
    const parts = [];
    if (skill) parts.push(skill);
    if (statName) parts.push(`(${statName})`);
    lines.push(`检定项目: ${parts.join('')}`);
  }

  // 难度等级
  if (dc !== null && dc !== undefined) {
    lines.push(`难度等级: DC ${dc}`);
  }

  // 投掷详情
  if (diceResult) {
    const grp = [notation || diceResult.notation];
    if (diceResult.rolls?.length > 1) {
      grp.push(`各骰: [${diceResult.rolls.join(', ')}]`);
    }
    if (diceResult.modifier) {
      grp.push(`修正: ${diceResult.modifier}`);
    }
    grp.push(`最终结果: ${diceResult.modTotal}`);
    lines.push(grp.join(' | '));
  }

  // 检定结论
  if (outcome) {
    lines.push(`检定结论: ${outcome.label}`);
  }

  lines.push('━━━━━━━━━━━━━━━━━━━━');
  lines.push('请根据此检定结果决定故事走向。');

  return lines.join('\n');
}

// ── AI 回复解析 ──

/**
 * 从 AI 回复中解析检定请求
 *
 * 格式: 【检定请求：STAT，DCn】请投一个d20进行{技能}检定
 * 示例: 【检定请求：WIS，DC12】前方黑暗中有窸窣声，请投一个d20进行察觉检定
 *
 * 支持中英文标点、有无空格、有无结束符】等变体
 *
 * @returns {{ stat, dc, skill } | null}
 */
export function parseAIForRollRequest(text) {
  // 主正则：要求有 】结束符（最严格的格式）
  const primary = /【检定请求[：:]\s*(STR|DEX|CON|INT|WIS|CHA)\s*[,，]\s*DC\s*(\d+)\s*】([\s\S]*?)检定/i;
  // 备选正则：】可省略（AI 可能忘记闭合）
  const fallback = /【检定请求[：:]\s*(STR|DEX|CON|INT|WIS|CHA)\s*[,，]\s*DC\s*(\d+)\s*([\s\S]*?)检定/i;

  let match = text.match(primary);
  if (!match) match = text.match(fallback);
  if (!match) return null;

  // 从捕获文本中提取技能名
  // 找到最后一个 "进行"/"判定"/"掷出"/"投掷" 之后的部分
  let suffix = match[3];
  const markers = /(?:进行|判定|掷出|投掷)\s*/g;
  let lastIdx = -1;
  let m;
  while ((m = markers.exec(suffix)) !== null) {
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx >= 0) {
    suffix = suffix.slice(lastIdx);
  }

  // 去除末尾非中文标点（如 。！？）全角括号等），避免干扰 CJK 匹配
  suffix = suffix.replace(/[。！？、，；：）)」』\s]+$/g, '');

  const skillMatch = suffix.match(/([一-鿿]{1,6})$/);
  const skill = skillMatch ? skillMatch[1] : suffix.trim();

  return {
    stat: match[1].toUpperCase(),
    dc: parseInt(match[2], 10),
    skill,
  };
}

/**
 * 从 AI 回复中解析状态变更标签
 *
 * 格式: [STATE:key=val,key=val,...]
 * 支持的 key: hp, sp, add_inventory, remove_inventory, location
 *
 * 数值前带 +/- 表示增量 (hp=-5)，否则表示绝对值 (location=酒馆)
 *
 * @returns {object | null} 解析后的变更对象
 */
export function parseAIForStateChanges(text) {
  const pattern = /\[STATE:([^\]]+)\]/g;
  const changes = {};

  // 匹配所有 STATE 标签（支持单行逗号分隔 + 多行多个标签）
  for (const match of text.matchAll(pattern)) {
    const pairs = match[1].split(',');
    for (const pair of pairs) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) continue;
      const key = pair.slice(0, eqIdx).trim();
      const value = pair.slice(eqIdx + 1).trim();
      if (key && value) {
        changes[key] = value;
      }
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}

// ── 启发式回复扫描 ──

/**
 * 从 AI 回复中自动提取道具和线索（当 AI 忘记用 STATE 标签时）
 * 保守策略：只匹配明确的获得/发现句式，避免误报
 */
export function scanAIForItems(text) {
  const items = [];
  const clues = [];

  // 道具匹配模式
  const itemPatterns = [
    /(?:获得|得到|捡起|拾起|拿到|入手|收集)[了到]?\s*[「『"']?([^，。！？\n]{2,12})[」』"']?/g,
    /(?:掉落|爆出|赠送|交给|递给)[了]?\s*[「『"']?([^，。！？\n]{2,12})[」』"']?/g,
    /[「『]([^」』]{2,10})[」』]\s*(?:入手|获得|得到)/g,
    // 数量+物品：一把X、一枚X、一张X、一块X
    /(?:一把|一枚|一张|一块|一件|一本|一颗|一瓶)[「『]?([^，。！？\n]{2,10})[」』]?/g,
  ];

  // 线索匹配模式
  const cluePatterns = [
    /(?:发现|察觉|注意到|意识到)[了]?\s*[「『"']?([^，。！？\n]{3,20})[」』"']?/g,
    /(?:线索|痕迹|记号|符号|暗号|标记)[：:是]+\s*[「『]?([^，。！？\n]{3,20})[」』]?/g,
    /记载[了着]?\s*[：:]?\s*[「『]?([^，。！？\n]{3,20})[」』]?/g,
  ];

  // 过滤词：明显不是有效道具/线索的通用词
  const noiseWords = /^(什么|那里|这里|那边|这边|这个|那个|一个|几个|一些|一下|东西|情况|事情|没有|也没|什么也没|没什么)$/;

  for (const pattern of itemPatterns) {
    for (const m of text.matchAll(pattern)) {
      const candidate = m[1].trim();
      if (candidate.length >= 2 && candidate.length <= 15 && !noiseWords.test(candidate)) {
        items.push(candidate);
      }
    }
  }

  for (const pattern of cluePatterns) {
    for (const m of text.matchAll(pattern)) {
      const candidate = m[1].trim();
      if (candidate.length >= 3 && candidate.length <= 25 && !noiseWords.test(candidate)) {
        clues.push(candidate);
      }
    }
  }

  return {
    items: [...new Set(items)],
    clues: [...new Set(clues)],
  };
}

// ── 状态变更应用 ──

const DEFAULT_GAME_STATE = {
  hp: 20,
  maxHp: 20,
  sp: 10,
  maxSp: 10,
  inventory: [],   // 道具背包
  clues: [],       // 线索日志
  location: '',
};

export function getDefaultGameState() {
  return JSON.parse(JSON.stringify(DEFAULT_GAME_STATE));
}

/**
 * 应用 AI 返回的状态变更到当前状态
 * @param {object} prev — 当前状态
 * @param {object} changes — parseAIForStateChanges 的返回值
 * @returns {object} 新状态
 */
export function applyStateChanges(prev, changes) {
  if (!changes || !prev) return prev;

  const next = {
    ...prev,
    inventory: [...(prev.inventory || [])],
    clues: [...(prev.clues || [])],
  };

  // ⚠️ 先处理 max 值变更，再处理 hp/sp，确保 clamp 使用最新的上限
  if (changes.maxHp !== undefined) {
    const val = parseInt(changes.maxHp, 10);
    if (!isNaN(val)) {
      next.maxHp = Math.max(1, val);
      next.hp = Math.min(next.hp, next.maxHp);
    }
  }
  if (changes.maxSp !== undefined) {
    const val = parseInt(changes.maxSp, 10);
    if (!isNaN(val)) {
      next.maxSp = Math.max(1, val);
      next.sp = Math.min(next.sp, next.maxSp);
    }
  }

  // HP
  if (changes.hp !== undefined) {
    const parsed = changes.hp;
    // 带符号 = 增量 (如 "+5", "-3", "5" 也视为正增量)
    if (typeof parsed === 'string' && (parsed.startsWith('+') || parsed.startsWith('-'))) {
      const delta = parseInt(parsed, 10);
      if (!isNaN(delta)) {
        next.hp = Math.max(0, Math.min(next.maxHp, next.hp + delta));
      }
    } else {
      // 绝对值
      const absVal = parseInt(parsed, 10);
      if (!isNaN(absVal)) {
        next.hp = Math.max(0, Math.min(next.maxHp, absVal));
      }
    }
  }

  // SP
  if (changes.sp !== undefined) {
    const parsed = changes.sp;
    if (typeof parsed === 'string' && (parsed.startsWith('+') || parsed.startsWith('-'))) {
      const delta = parseInt(parsed, 10);
      if (!isNaN(delta)) {
        next.sp = Math.max(0, Math.min(next.maxSp, next.sp + delta));
      }
    } else {
      const absVal = parseInt(parsed, 10);
      if (!isNaN(absVal)) {
        next.sp = Math.max(0, Math.min(next.maxSp, absVal));
      }
    }
  }

  // 物品添加
  if (changes.add_inventory) {
    next.inventory.push(changes.add_inventory);
  }

  // 物品移除
  if (changes.remove_inventory) {
    const idx = next.inventory.indexOf(changes.remove_inventory);
    if (idx >= 0) next.inventory.splice(idx, 1);
  }

  // 线索添加
  if (changes.add_clue) {
    next.clues.push(changes.add_clue);
  }

  // 位置
  if (changes.location) {
    next.location = changes.location;
  }

  return next;
}
