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

/**
 * 解析 AI 回复末尾的结构化推理提案。
 *
 * <TRPG_REASONING>
 * {"hypotheses":[{"statement":"管家可能持有备用钥匙","evidence":["钥匙孔无破坏痕迹"],"contradictions":[],"confidence":55,"status":"open"}]}
 * </TRPG_REASONING>
 */
export function parseAIForReasoningUpdates(text) {
  const match = text.match(/<TRPG_REASONING>\s*([\s\S]*?)\s*<\/TRPG_REASONING>/i);
  if (!match) return [];

  try {
    const parsed = JSON.parse(match[1]);
    if (!Array.isArray(parsed.hypotheses)) return [];
    return parsed.hypotheses
      .map(normalizeHypothesis)
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function groundHypotheses(updates = [], context = {}) {
  const knownFacts = [
    ...normalizeFactSources(context.clues, 'clue'),
    ...normalizeFactSources(context.inventory, 'item'),
    ...normalizeFactSources(context.locations, 'location'),
    ...normalizeFactSources(context.currentLocation ? [context.currentLocation] : [], 'location'),
  ];
  const narrative = String(context.generatedText || '')
    .replace(/<TRPG_REASONING>[\s\S]*?<\/TRPG_REASONING>/gi, '');

  return updates
    .map((hypothesis) => {
      const evidenceSources = hypothesis.evidence
        .map((text) => groundReasoningText(text, knownFacts, narrative))
        .filter(Boolean);
      if (evidenceSources.length < 2) return null;

      const contradictionSources = hypothesis.contradictions
        .map((text) => groundReasoningText(text, knownFacts, narrative))
        .filter(Boolean);
      const hasRecordedEvidence = evidenceSources.some((item) => item.source !== 'narrative');

      return {
        ...hypothesis,
        evidence: evidenceSources.map((item) => item.text),
        contradictions: contradictionSources.map((item) => item.text),
        evidenceSources,
        contradictionSources,
        confidence: hasRecordedEvidence
          ? hypothesis.confidence
          : Math.min(hypothesis.confidence, 45),
      };
    })
    .filter(Boolean);
}

function normalizeFactSources(values, source) {
  return [...new Set((values || []).filter((value) => typeof value === 'string'))]
    .map((value) => ({ source, value: value.trim(), comparable: comparableReasoningText(value) }))
    .filter((item) => item.comparable);
}

function groundReasoningText(text, knownFacts, narrative) {
  const comparable = comparableReasoningText(text);
  const matched = knownFacts.find((fact) => {
    if (fact.comparable === comparable) return true;
    return Math.min(fact.comparable.length, comparable.length) >= 4
      && (fact.comparable.includes(comparable) || comparable.includes(fact.comparable));
  });
  if (matched) return { text, source: matched.source, matchedValue: matched.value };
  if (text && narrative.includes(text)) return { text, source: 'narrative', matchedValue: text };
  return null;
}

function comparableReasoningText(value) {
  return String(value || '').toLocaleLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
}

function normalizeHypothesis(value) {
  if (!value || typeof value.statement !== 'string') return null;
  const statement = value.statement.trim().slice(0, 120);
  const evidence = normalizeReasoningList(value.evidence);
  if (!statement || evidence.length === 0) return null;
  return {
    id: typeof value.id === 'string' && value.id ? value.id : createReasoningId(statement),
    statement,
    evidence,
    contradictions: normalizeReasoningList(value.contradictions),
    confidence: Math.max(0, Math.min(100, Number(value.confidence) || 0)),
    status: ['open', 'confirmed', 'rejected'].includes(value.status) ? value.status : 'open',
  };
}

function normalizeReasoningList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().slice(0, 120))
    .filter(Boolean))];
}

function createReasoningId(statement) {
  let hash = 0;
  for (const char of statement) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return `hypothesis_${Math.abs(hash).toString(36)}`;
}

export function mergeHypotheses(current = [], updates = []) {
  const merged = current.map((item) => ({ ...item }));
  for (const update of updates) {
    const index = merged.findIndex((item) => item.id === update.id || item.statement === update.statement);
    if (index === -1) {
      merged.push(update);
    } else {
      merged[index] = { ...merged[index], ...update, id: merged[index].id };
    }
  }
  return merged;
}

// ── TRPG_STATE 结构化状态块解析 ──

/**
 * 解析 AI 回复中的 <TRPG_STATE> JSON 块
 * 格式: <TRPG_STATE>{"inventory":[...],"clues":[...],"locations":[...],"currentLocation":"..."}</TRPG_STATE>
 */
export function parseTRPGState(text) {
  const match = text.match(/<TRPG_STATE>\s*([\s\S]*?)\s*<\/TRPG_STATE>/i);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    return {
      inventory: Array.isArray(data.inventory) ? data.inventory.map(s => String(s).trim().slice(0, 40)).filter(Boolean) : [],
      clues: Array.isArray(data.clues) ? data.clues.map(s => String(s).trim().slice(0, 50)).filter(Boolean) : [],
      locations: Array.isArray(data.locations) ? data.locations.map(s => String(s).trim().slice(0, 40)).filter(Boolean) : [],
      currentLocation: typeof data.currentLocation === 'string' ? data.currentLocation.trim().slice(0, 40) : null,
    };
  } catch {
    return null;
  }
}

/**
 * Parse the unified event block emitted by the GM.
 * Legacy TRPG_STATE / TRPG_KNOWLEDGE blocks remain supported elsewhere.
 */
export function parseTRPGEvents(text) {
  const matches = [...String(text || '').matchAll(/<TRPG_EVENTS>\s*([\s\S]*?)\s*<\/TRPG_EVENTS>/gi)];
  if (!matches.length) return null;
  let combined = null;
  for (const match of matches) {
    const parsed = parseTRPGEventData(match[1]);
    if (!parsed) continue;
    combined = mergeTRPGEvents(combined, parsed);
  }
  return combined;
}

function parseTRPGEventData(raw) {
  try {
    const data = JSON.parse(raw);
    const items = normalizeEventObjects(
      data.items ?? data.inventory ?? data.heldItems ?? data['持有物品'],
      'name',
      40,
      ['acquired', 'lost']
    );
    const clues = normalizeEventObjects(
      data.clues ?? data.intelligence ?? data['重要情报'] ?? data['线索'],
      'text',
      80,
      ['discovered', 'retracted']
    );
    const locations = normalizeEventObjects(
      data.locations ?? data['场所'],
      'name',
      40,
      ['discovered', 'entered']
    );
    const people = data.people ?? data.characters ?? data['人物'];
    const quests = normalizeEventObjects(
      data.quests ?? data.mainQuests ?? data['主线任务'],
      'text',
      100,
      ['active', 'completed']
    );
    const threats = normalizeEventObjects(
      data.threats ?? data['潜在威胁'],
      'text',
      100,
      ['active', 'resolved']
    );
    return {
      mode: data.mode === 'snapshot' ? 'snapshot' : 'delta',
      items,
      clues,
      locations,
      quests,
      threats,
      currentLocation: typeof data.currentLocation === 'string'
        ? data.currentLocation.trim().slice(0, 40)
        : null,
      entities: normalizeEventEntities(data.entities, people),
      relations: normalizeEventRelations(data.relations),
    };
  } catch {
    return null;
  }
}

function mergeTRPGEvents(current, incoming) {
  if (!current || incoming.mode === 'snapshot') return incoming;
  return {
    mode: current.mode,
    items: mergeEventList(current.items, incoming.items, 'name'),
    clues: mergeEventList(current.clues, incoming.clues, 'text'),
    locations: mergeEventList(current.locations, incoming.locations, 'name'),
    quests: mergeEventList(current.quests, incoming.quests, 'text'),
    threats: mergeEventList(current.threats, incoming.threats, 'text'),
    currentLocation: incoming.currentLocation || current.currentLocation,
    entities: mergeEventList(current.entities, incoming.entities, 'name', 'type'),
    relations: mergeEventList(current.relations, incoming.relations, 'source', 'target', 'type'),
  };
}

function mergeEventList(current = [], incoming = [], ...keys) {
  const output = [...current];
  for (const value of incoming) {
    const index = output.findIndex((entry) => keys.every((key) => entry[key] === value[key]));
    if (index >= 0) output[index] = value;
    else output.push(value);
  }
  return output;
}

export function scanPriorityRecords(text) {
  const items = [];
  const entities = [];
  const quests = [];
  const locations = [];
  const threats = [];
  const clues = [];
  let section = null;
  for (const rawLine of String(text || '').split(/\n/)) {
    const line = rawLine.trim()
      .replace(/^#{1,6}\s*/, '')
      .replace(/\*\*/g, '');
    if (!line) continue;
    const compactLine = line.replace(/^[^\p{L}\p{N}]+/u, '').replace(/\s+/g, '');
    if (/^(?:当前|现有|目前|已获得)?(?:持有的?)?(?:物品|道具|装备|背包|随身物品|随身道具)(?:清单|列表|信息)?[：:]?$/.test(compactLine)) {
      section = 'item';
      continue;
    }
    if (/^(?:已知|重要|主要|相关|具名|关键|当前)?(?:人物|角色|NPC)(?:信息|清单|列表|关系)?[：:]?$/i.test(compactLine)) {
      section = 'person';
      continue;
    }
    if (/^(?:当前)?主线任务(?:清单|列表|信息)?[：:]?$/.test(compactLine)) {
      section = 'quest'; continue;
    }
    if (/^(?:已知|重要)?(?:地点|场所)(?:清单|列表|信息)?[：:]?$/.test(compactLine)) {
      section = 'location'; continue;
    }
    if (/^(?:当前|已知)?潜在威胁(?:清单|列表|信息)?[：:]?$/.test(compactLine)) {
      section = 'threat'; continue;
    }
    if (/^(?:当前|已知)?重要情报(?:清单|列表|信息)?[：:]?$/.test(compactLine)) {
      section = 'clue'; continue;
    }
    const match = line.match(/^(?:[-*•]|\d+[.、])\s*(.+)$/);
    if (!match) {
      if (/^[^\s]{1,12}[：:]/.test(line) && section === 'person') {
        const name = line.split(/[：:]/, 1)[0].trim();
        const entity = { name, type: 'person', description: line.slice(name.length + 1).trim() };
        if (isUsefulEventEntity(entity)) entities.push(entity);
      }
      continue;
    }
    const value = match[1].trim();
    if (section === 'item') items.push(value.split(/[：:]/, 1)[0].trim());
    if (section === 'quest') quests.push(value);
    if (section === 'location') locations.push(value.split(/[：:]/, 1)[0].trim());
    if (section === 'threat') threats.push(value);
    if (section === 'clue') clues.push(value);
    if (section === 'person') {
      const name = value.split(/[：:（(]/, 1)[0].trim();
      const entity = { name, type: 'person', description: value.slice(name.length).replace(/^[：:（(]|[）)]$/g, '').trim() };
      if (isUsefulEventEntity(entity)) entities.push(entity);
    }
  }
  return {
    items: [...new Set(items.filter(Boolean))],
    entities: entities.filter((entity, index, all) => all.findIndex((value) => value.name === entity.name) === index),
    quests: [...new Set(quests.filter(Boolean))],
    locations: [...new Set(locations.filter(Boolean))],
    threats: [...new Set(threats.filter(Boolean))],
    clues: [...new Set(clues.filter(Boolean))],
  };
}

export function findLatestSummaryReply(messages = []) {
  const summaryPattern = /整理|梳理|汇总|归纳|刷新|同步|总结.*信息|整理.*信息/;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.type !== 'user' || !summaryPattern.test(String(message.text || ''))) continue;
    const replies = [];
    for (let replyIndex = index + 1; replyIndex < messages.length; replyIndex += 1) {
      const reply = messages[replyIndex];
      if (reply?.type === 'user') break;
      if (reply?.type === 'bot' && reply.text) replies.push(reply.text);
    }
    if (replies.length) return replies.join('\n\n');
  }
  return '';
}

function normalizeEventObjects(values, key, limit, allowedActions) {
  if (!Array.isArray(values)) return [];
  const output = [];
  const seen = new Set();
  for (const value of values) {
    if (!value) continue;
    const objectValue = typeof value === 'string' ? { [key]: value } : value;
    if (typeof objectValue !== 'object') continue;
    const aliases = key === 'name' ? ['name', 'item', 'location'] : ['text', 'clue', 'name'];
    const rawText = aliases.map((alias) => objectValue[alias]).find((entry) => typeof entry === 'string');
    const text = rawText ? rawText.trim().slice(0, limit) : '';
    const action = allowedActions.includes(objectValue.action) ? objectValue.action : allowedActions[0];
    const identity = `${action}:${text}`;
    if (!text || seen.has(identity)) continue;
    seen.add(identity);
    output.push({
      ...objectValue,
      [key]: text,
      action,
      source: typeof objectValue.source === 'string' ? objectValue.source.trim().slice(0, 40) : '',
      evidence: typeof objectValue.evidence === 'string' ? objectValue.evidence.trim().slice(0, 160) : '',
    });
  }
  return output;
}

function normalizeEventEntities(values, people) {
  const combined = [
    ...(Array.isArray(values) ? values : []),
    ...(Array.isArray(people)
      ? people.map((value) => typeof value === 'string' ? { name: value, type: 'person' } : { ...value, type: 'person' })
      : []),
  ];
  return combined
    .map((value) => typeof value === 'string' ? { name: value, type: 'person' } : value)
    .filter((value) => value && typeof value.name === 'string'
      && ['person', 'place', 'organization'].includes(value.type))
    .map((value) => ({
      name: value.name.trim().slice(0, 40),
      type: value.type,
      description: typeof value.description === 'string' ? value.description.trim().slice(0, 160) : '',
    }))
    .filter((value) => isUsefulEventEntity(value))
    .filter((value, index, all) => value.name
      && all.findIndex((entry) => entry.name === value.name && entry.type === value.type) === index);
}

function isUsefulEventEntity(entity) {
  if (!entity.name) return false;
  if (entity.type !== 'person') return true;
  const genericRole = /^(?:(?:一名|一个|这名|那名|这位|那位|年轻|年迈|神秘|陌生|受伤|沉默|老)?(?:管家|守卫|卫兵|士兵|旅客|旅人|路人|村民|居民|店主|老板|酒保|侍者|仆人|女仆|侍卫|车夫|船夫|医生|教授|神父|侦探|警察|队长|商人|女子|男子|老人|少女|少年|孩子|黑衣人|陌生人|蒙面人))$/;
  return !genericRole.test(entity.name);
}

function normalizeEventRelations(values) {
  if (!Array.isArray(values)) return [];
  return values
    .filter((value) => value && typeof value.source === 'string' && typeof value.target === 'string')
    .map((value) => ({
      source: value.source.trim().slice(0, 40),
      target: value.target.trim().slice(0, 40),
      type: typeof value.type === 'string' ? value.type.trim().slice(0, 40) : 'related_to',
      evidence: typeof value.evidence === 'string' ? [value.evidence.trim().slice(0, 160)] : [],
    }))
    .filter((value) => value.source && value.target && value.source !== value.target);
}

// ── 启发式回复扫描 ──

/**
 * 从 AI 回复中提取道具、线索和场所
 *
 * 三层策略（优先级从高到低）：
 * 1. 粗体标记：**获得道具：X** / **发现线索：X** / **得知场所：X**
 * 2. 明确文字分区：道具 / 线索 / 场所 等标题下的列表
 * 3. 自然语言：获得X / 发现X（最弱，仅兜底）
 */
export function scanAIForItems(text) {
  const items = [];
  const clues = [];
  const locations = [];
  let currentLocation = null;

  // ── 策略1：粗体标记精准匹配 ──
  const boldItem = /\*\*获得道具[：:]\s*(.+?)\*\*/g;
  const boldClue = /\*\*发现线索[：:]\s*(.+?)\*\*/g;
  const boldLocation = /\*\*得知场所[：:]\s*(.+?)\*\*/g;
  const boldCurrentLocation = /\*\*当前位置[：:]\s*(.+?)\*\*/g;

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
  for (const m of text.matchAll(boldCurrentLocation)) {
    const name = m[1].trim();
    if (name.length >= 2 && name.length <= 30) currentLocation = name;
  }

  // ── 策略2：明确文字分区列表（粗体没匹配到时启用） ──
  if (items.length === 0 && clues.length === 0 && locations.length === 0) {
    const sections = parseTextSections(text);
    items.push(...sections.items);
    clues.push(...sections.clues);
    locations.push(...sections.locations);
  }

  // ── 策略3：自然语言兜底（仅道具，线索不用自然语言——太容易误报） ──
  if (items.length === 0) {
    const noise = /^(什么|那里|这里|那边|这边|这个|那个|一个|几个|一些|一下|东西|情况|事情|没有|也没)$/;
    for (const m of text.matchAll(/(?:获得了?|得到了?|捡起了?|拾起了?|拿到了?|入手了?)[「『]?([^，。！？\n]{2,10})[」』]?/g)) {
      const c = m[1].trim();
      if (c.length >= 2 && c.length <= 15 && !noise.test(c)) items.push(c);
    }
  }

  // 明确移动叙述兜底。仅匹配带动作主体和目标地点的句式，避免把提及地点误判为当前位置。
  if (!currentLocation) {
    const movementPatterns = [
      /(?:你|你们|众人|队伍|一行人|玩家们)(?:已经|终于|随后|接着|缓缓|小心地|悄悄地)?(?:进入|抵达|来到|到达|返回|回到|走进|踏入|赶到|前往)[了向]?([^，。！？\n]{2,24})/,
      /(?:当前位于|目前位于|现在位于|此刻身处)[：:\s]*([^，。！？\n]{2,24})/,
    ];
    for (const pattern of movementPatterns) {
      const match = text.match(pattern);
      if (match) {
        currentLocation = match[1]
          .replace(/(?:之中|里面|内部|附近|门口|入口)$/, '')
          .trim();
        break;
      }
    }
  }

  if (currentLocation && !locations.includes(currentLocation)) {
    locations.push(currentLocation);
  }

  return {
    items: [...new Set(items)],
    clues: [...new Set(clues)],
    locations: [...new Set(locations)],
    currentLocation,
  };
}

/**
 * 解析明确文字分区格式的 AI 回复。
 * Emoji 只作为可忽略装饰，不参与类别判断。
 */
function parseTextSections(text) {
  const items = [];
  const clues = [];
  const locations = [];

  const noise = /^(什么|那里|这里|那边|这边|这个|那个|一个|几个|一些|一下|东西|情况|事情|没有|也没)$/;

  // 逐行扫描：检测标题行，切换当前目标
  let currentTarget = null;
  for (const rawLine of text.split(/\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    // 检测是否是标题行
    const stripped = line
      .replace(/\*\*/g, '')
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .replace(/[：:].*$/, '')
      .replace(/\s+/g, '');
    if (/^(?:随身道具|随身物品|持有道具|持有物品|道具|物品|背包)(?:清单|列表|信息)?$/.test(stripped)) {
      currentTarget = items; continue;
    }
    if (/^(?:已获取的线索|已知线索|已知信息|信息与线索|线索|信息)(?:清单|列表|日志)?$/.test(stripped)) {
      currentTarget = clues; continue;
    }
    if (/^(?:已知场所|场所|地点|探索地点)(?:清单|列表|信息)?$/.test(stripped)) {
      currentTarget = locations; continue;
    }

    if (!currentTarget) continue;

    // 跳过标题行和空白
    const bareLine = line.replace(/\*\*/g, '');
    const isListItem = /^(?:[-*•]|\d+[.、)])\s*/.test(bareLine);
    if (!isListItem && /[：:]$/.test(bareLine)) {
      currentTarget = null;
      continue;
    }

    // 智能提取
    let cleaned = line
      .replace(/\*\*/g, '')
      .replace(/^[\s\d]*[.、)\-\s•*]*\s*/, '')
      .replace(/[（(][^)）]*[）)]/g, '')
      .trim();

    if (!cleaned || cleaned.length < 2) continue;

    // 线索：优先取 — 或 ：后的描述侧，过滤叙事噪音
    if (currentTarget === clues) {
      const dashIdx = cleaned.search(/[—\-：:]/);
      if (dashIdx > 0) {
        const right = cleaned.slice(dashIdx + 1).trim();
        // 描述侧太短 = 噪音；太长也不行
        if (right.length >= 6 && right.length <= 35) {
          cleaned = right;
        } else {
          continue; // 不符合线索质量标准
        }
      } else {
        // 无分隔符的线索行：至少 6 字才收录，避免"商贩朝这边看"等叙事碎片
        if (cleaned.length < 6 || cleaned.length > 35) continue;
      }
      // 过滤明显的叙事/氛围描述
      if (/(?:朝这边|朝那边|走过来|看过来|瞥了|望了|环顾|四处|旁边有)/.test(cleaned)) continue;
    }

    if (cleaned.length >= 2 && cleaned.length <= 35 && !noise.test(cleaned)) {
      if (!currentTarget.includes(cleaned)) currentTarget.push(cleaned);
    }
  }

  return { items, clues, locations };
}

// ── 状态变更应用 ──

const DEFAULT_GAME_STATE = {
  hp: 20,
  maxHp: 20,
  sp: 10,
  maxSp: 10,
  inventory: [],   // 道具背包
  quests: [],      // 主线任务
  threats: [],     // 潜在威胁
  clues: [],       // 线索日志
  locations: [],   // 已知场所
  location: '',    // 当前位置
  hypotheses: [],  // 带证据的推理假设
  knowledgeGraph: {
    entities: [],
    relations: [],
    analysis: {
      nodeCount: 0,
      relationCount: 0,
      componentCount: 0,
      centralEntities: [],
      isolatedEntityIds: [],
    },
    extractor: '',
    embeddingRecommended: false,
  },
  evidenceBoard: {
    nodes: [],
    edges: [],
  },
};

export function getDefaultGameState() {
  return JSON.parse(JSON.stringify(DEFAULT_GAME_STATE));
}

export function normalizeGameState(value) {
  const defaults = getDefaultGameState();
  const state = value && typeof value === 'object' ? value : {};
  const graph = state.knowledgeGraph && typeof state.knowledgeGraph === 'object'
    ? state.knowledgeGraph
    : {};
  const analysis = graph.analysis && typeof graph.analysis === 'object' ? graph.analysis : {};
  const board = state.evidenceBoard && typeof state.evidenceBoard === 'object'
    ? state.evidenceBoard
    : {};
  const array = (candidate) => Array.isArray(candidate) ? candidate : [];

  return {
    ...defaults,
    ...state,
    inventory: array(state.inventory),
    quests: array(state.quests),
    threats: array(state.threats),
    clues: array(state.clues),
    locations: array(state.locations),
    hypotheses: array(state.hypotheses),
    knowledgeGraph: {
      ...defaults.knowledgeGraph,
      ...graph,
      entities: array(graph.entities),
      relations: array(graph.relations),
      analysis: { ...defaults.knowledgeGraph.analysis, ...analysis },
    },
    evidenceBoard: {
      ...defaults.evidenceBoard,
      ...board,
      nodes: array(board.nodes),
      edges: array(board.edges),
    },
  };
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

  // 物品添加（上限 12）
  if (changes.add_inventory) {
    if (!next.inventory.includes(changes.add_inventory)) {
      next.inventory.push(changes.add_inventory);
    }
    if (next.inventory.length > 12) next.inventory = next.inventory.slice(-12);
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

  // 场所添加（上限 8）
  if (changes.add_location) {
    if (!next.locations.includes(changes.add_location)) {
      next.locations.push(changes.add_location);
    }
    if (next.locations.length > 8) next.locations = next.locations.slice(-8);
  }

  // 位置
  if (changes.location) {
    next.location = changes.location;
  }

  return next;
}
