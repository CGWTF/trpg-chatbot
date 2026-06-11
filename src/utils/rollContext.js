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
 * 从 AI 回复中提取道具、线索和场所
 *
 * 三层策略（优先级从高到低）：
 * 1. 粗体标记：**获得道具：X** / **发现线索：X** / **得知场所：X**
 * 2. emoji 分区：🎒道具 / 📜线索 / 🏛️场所 等标题下的列表
 * 3. 自然语言：获得X / 发现X（最弱，仅兜底）
 */
export function scanAIForItems(text) {
  const items = [];
  const clues = [];
  const locations = [];

  // ── 策略1：粗体标记精准匹配 ──
  const boldItem = /\*\*获得道具[：:]\s*(.+?)\*\*/g;
  const boldClue = /\*\*发现线索[：:]\s*(.+?)\*\*/g;
  const boldLocation = /\*\*得知场所[：:]\s*(.+?)\*\*/g;

  for (const m of text.matchAll(boldItem)) {
    const name = m[1].trim();
    if (name.length >= 1 && name.length <= 20) items.push(name);
  }
  for (const m of text.matchAll(boldClue)) {
    const name = m[1].trim();
    if (name.length >= 2 && name.length <= 30) clues.push(name);
  }
  for (const m of text.matchAll(boldLocation)) {
    const name = m[1].trim();
    if (name.length >= 2 && name.length <= 30) locations.push(name);
  }

  // ── 策略2：emoji 分区列表（粗体没匹配到时启用） ──
  if (items.length === 0 && clues.length === 0 && locations.length === 0) {
    const sections = parseEmojiSections(text);
    items.push(...sections.items);
    clues.push(...sections.clues);
    locations.push(...sections.locations);
  }

  // ── 策略3：自然语言兜底 ──
  if (items.length === 0 && clues.length === 0 && locations.length === 0) {
    const noise = /^(什么|那里|这里|那边|这边|这个|那个|一个|几个|一些|一下|东西|情况|事情|没有|也没)$/;
    for (const m of text.matchAll(/(?:获得了?|得到了?|捡起了?|拾起了?|拿到了?|入手了?)[「『]?([^，。！？\n]{2,10})[」』]?/g)) {
      const c = m[1].trim();
      if (c.length >= 2 && c.length <= 15 && !noise.test(c)) items.push(c);
    }
    for (const m of text.matchAll(/(?:发现了?|注意到|察觉到)[「『]?([^，。！？\n]{3,20})[」』]?/g)) {
      const c = m[1].trim();
      if (c.length >= 3 && c.length <= 25 && !noise.test(c)) clues.push(c);
    }
  }

  return {
    items: [...new Set(items)],
    clues: [...new Set(clues)],
    locations: [...new Set(locations)],
  };
}

/**
 * 解析 emoji 分区格式的 AI 回复
 * 处理 🎒随身道具 / 📜线索 / 🏛️场所 等标题后的编号列表
 */
function parseEmojiSections(text) {
  const items = [];
  const clues = [];
  const locations = [];

  const sectionTargets = [
    { keys: ['🎒', '道具', '物品', '背包', '随身道具', '随身物品'], target: items },
    { keys: ['📜', '🔍', '线索', '已获取的线索', '已知信息', '信息与线索'], target: clues },
    { keys: ['🏛️', '📍', '场所', '已知场所', '地点', '探索'], target: locations },
  ];

  // 找到所有标题及其位置和目标，按出现顺序排序
  const markers = [];
  for (const def of sectionTargets) {
    for (const k of def.keys) {
      const re = new RegExp(`^${escapeRegex(k)}[^\\n]*?[：:]`, 'gm');
      for (const m of text.matchAll(re)) {
        markers.push({ start: m.index + m[0].length, target: def.target });
      }
    }
  }
  markers.sort((a, b) => a.start - b.start);
  if (!markers.length) return { items, clues, locations };

  // 收集所有标题行文本，用于过滤
  const headerLines = new Set();
  for (const m of markers) {
    // 从标题开始位置向前找换行，提取标题行文本
    const lineStart = text.lastIndexOf('\n', m.start - 1) + 1;
    const lineEnd = text.indexOf('\n', m.start);
    const headerText = text.slice(lineStart, lineEnd >= 0 ? lineEnd : text.length).trim();
    if (headerText) headerLines.add(headerText);
  }

  const noise = /^(什么|那里|这里|那边|这边|这个|那个|一个|几个|一些|一下|东西|情况|事情|没有|也没|与线索|与信息|与场所)$/;

  for (let i = 0; i < markers.length; i++) {
    const m = markers[i];
    const sliceStart = m.start;
    const sliceEnd = i + 1 < markers.length ? markers[i + 1].start : text.length;
    const body = text.slice(sliceStart, sliceEnd);

    for (const line of body.split(/\n/)) {
      const trimmedLine = line.trim();
      if (!trimmedLine || headerLines.has(trimmedLine)) continue;
      let cleaned = trimmedLine
        .replace(/^[\s\d]*[\.\、\)\-\s•\*]*\s*/, '')
        .replace(/[（(][^)）]*[）)]/g, '')
        .replace(/[—\-—].*$/, '')
        .trim();
      if (cleaned.length >= 2 && cleaned.length <= 40 && !noise.test(cleaned)) {
        if (!m.target.includes(cleaned)) m.target.push(cleaned);
      }
    }
  }

  return { items, clues, locations };
}

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// ── 状态变更应用 ──

const DEFAULT_GAME_STATE = {
  hp: 20,
  maxHp: 20,
  sp: 10,
  maxSp: 10,
  inventory: [],   // 道具背包
  clues: [],       // 线索日志
  locations: [],   // 已知场所
  location: '',    // 当前位置
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
    locations: [...(prev.locations || [])],
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

  // 场所添加
  if (changes.add_location) {
    next.locations.push(changes.add_location);
  }

  // 位置
  if (changes.location) {
    next.location = changes.location;
  }

  return next;
}
