import { describe, it, expect } from 'vitest';
import {
  computeOutcome,
  OUTCOME_TIERS,
  buildStructuredRollContext,
  parseAIForRollRequest,
  parseAIForStateChanges,
  applyStateChanges,
  getDefaultGameState,
  getStatName,
  scanAIForItems,
  parseTRPGEvents,
  scanPriorityRecords,
  findLatestSummaryReply,
  parseAIForReasoningUpdates,
  groundHypotheses,
  mergeHypotheses,
} from '../utils/rollContext';

describe('scanAIForItems location detection', () => {
  it('recognizes an explicit current-location marker', () => {
    const result = scanAIForItems('你推开门。\n**当前位置：断弦琴酒馆地下室**');
    expect(result.currentLocation).toBe('断弦琴酒馆地下室');
    expect(result.locations).toContain('断弦琴酒馆地下室');
  });

  it('recognizes a clear movement narration', () => {
    const result = scanAIForItems('你们终于抵达了雾港码头。海风迎面吹来。');
    expect(result.currentLocation).toBe('雾港码头');
  });

  it('does not treat a mentioned location as the current location', () => {
    const result = scanAIForItems('酒保告诉你，断弦琴酒馆地下室可能藏着秘密。');
    expect(result.currentLocation).toBeNull();
  });

  it('does not use emoji alone to classify list content', () => {
    const result = scanAIForItems('🎒\n- 生锈钥匙\n🔍\n- 地下室有爪痕');
    expect(result.items).toEqual([]);
    expect(result.clues).toEqual([]);
  });

  it('classifies by heading text even when the emoji is misleading', () => {
    const result = scanAIForItems('🔍 持有物品\n- 生锈钥匙\n🎒 已知线索\n- 地下室存在异常爪痕');
    expect(result.items).toEqual(['生锈钥匙']);
    expect(result.clues).toEqual(['地下室存在异常爪痕']);
  });
});

describe('TRPG_EVENTS parsing', () => {
  it('parses unified state and knowledge events', () => {
    const result = parseTRPGEvents(`
      <TRPG_EVENTS>
      {"mode":"delta","items":[{"name":"生锈钥匙","action":"acquired"},{"name":"旧地图","action":"lost"}],"clues":[{"text":"林默持有备用钥匙","action":"discovered","source":"林默","evidence":"林默展示了钥匙"}],"locations":[{"name":"黑石庄园","action":"entered"}],"entities":[{"name":"林默","type":"person","description":"庄园管家"}],"relations":[{"source":"林默","target":"黑石庄园","type":"works_at","evidence":"林默负责庄园事务"}]}
      </TRPG_EVENTS>
    `);

    expect(result.items).toHaveLength(2);
    expect(result.clues[0].source).toBe('林默');
    expect(result.currentLocation).toBeNull();
    expect(result.entities[0].name).toBe('林默');
    expect(result.relations[0].evidence).toEqual(['林默负责庄园事务']);
  });

  it('rejects malformed event blocks', () => {
    expect(parseTRPGEvents('<TRPG_EVENTS>{bad json}</TRPG_EVENTS>')).toBeNull();
  });

  it('accepts simplified refresh fields for people and inventory', () => {
    const result = parseTRPGEvents(`
      <TRPG_EVENTS>
      {"mode":"snapshot","inventory":["生锈钥匙","庄园地图"],"people":["林默",{"name":"苏晚","description":"调查记者"}]}
      </TRPG_EVENTS>
    `);

    expect(result.items.map((item) => item.name)).toEqual(['生锈钥匙', '庄园地图']);
    expect(result.entities.map((entity) => entity.name)).toEqual(['林默', '苏晚']);
  });

  it('does not accept unnamed NPC labels from simplified people fields', () => {
    const result = parseTRPGEvents(
      '<TRPG_EVENTS>{"people":["林默","老管家","神秘女子"]}</TRPG_EVENTS>'
    );

    expect(result.entities.map((entity) => entity.name)).toEqual(['林默']);
  });

  it('combines multiple event blocks and respects the latest snapshot', () => {
    const result = parseTRPGEvents(`
      <TRPG_EVENTS>{"items":["旧钥匙"],"people":["旧人物"]}</TRPG_EVENTS>
      <TRPG_EVENTS>{"mode":"snapshot","inventory":["庄园地图"],"people":["林默"]}</TRPG_EVENTS>
      <TRPG_EVENTS>{"items":["密信"],"people":["苏晚"]}</TRPG_EVENTS>
    `);

    expect(result.items.map((item) => item.name)).toEqual(['庄园地图', '密信']);
    expect(result.entities.map((entity) => entity.name)).toEqual(['林默', '苏晚']);
  });

  it('parses all six investigation workspace categories', () => {
    const result = parseTRPGEvents(`
      <TRPG_EVENTS>
      {"mode":"snapshot","quests":[{"text":"调查失踪案","action":"active"}],"items":[{"name":"生锈钥匙","action":"acquired"}],"entities":[{"name":"林默","type":"person"}],"locations":[{"name":"黑石庄园","action":"discovered"}],"threats":[{"text":"地下室存在未知生物","action":"active"}],"clues":[{"text":"失踪者最后出现在地下室入口","action":"discovered"}]}
      </TRPG_EVENTS>
    `);

    expect(result.quests[0].text).toBe('调查失踪案');
    expect(result.items[0].name).toBe('生锈钥匙');
    expect(result.entities[0].name).toBe('林默');
    expect(result.locations[0].name).toBe('黑石庄园');
    expect(result.threats[0].text).toBe('地下室存在未知生物');
    expect(result.clues[0].text).toBe('失踪者最后出现在地下室入口');
  });
});

describe('priority record scanning', () => {
  it('recovers people and held items from an existing markdown summary', () => {
    const result = scanPriorityRecords(`
      ### 当前持有物品
      - 生锈钥匙
      - 庄园地图：标出了地下室

      ### 主要人物
      - 林默：黑石庄园管家
      - 老管家：无名 NPC
      - 苏晚（调查记者）
    `);

    expect(result.items).toEqual(['生锈钥匙', '庄园地图']);
    expect(result.entities.map((entity) => entity.name)).toEqual(['林默', '苏晚']);
  });

  it('recognizes common summary headings for equipment and named NPCs', () => {
    const result = scanPriorityRecords(`
      ## 🎒 当前持有的物品清单
      1. 银色怀表：能够打开暗门

      ## 👤 关键 NPC 信息
      - 林默：庄园管家
      - 士兵：无名 NPC
    `);

    expect(result.items).toEqual(['银色怀表']);
    expect(result.entities.map((entity) => entity.name)).toEqual(['林默']);
  });

  it('maps the six fixed summary headings to separate categories', () => {
    const result = scanPriorityRecords(`
      主线任务：
      - 调查失踪案
      已获得道具：
      - 生锈钥匙
      关键人物：
      - 林默：庄园管家
      已知地点：
      - 黑石庄园
      潜在威胁：
      - 地下室存在未知生物
      重要情报：
      - 失踪者最后出现在地下室入口
    `);

    expect(result.quests).toEqual(['调查失踪案']);
    expect(result.items).toEqual(['生锈钥匙']);
    expect(result.entities.map((entity) => entity.name)).toEqual(['林默']);
    expect(result.locations).toEqual(['黑石庄园']);
    expect(result.threats).toEqual(['地下室存在未知生物']);
    expect(result.clues).toEqual(['失踪者最后出现在地下室入口']);
  });

  it('selects only the reply to the latest summary request', () => {
    const result = findLatestSummaryReply([
      { type: 'user', text: '整理一下信息' },
      { type: 'bot', text: '旧整理结果' },
      { type: 'user', text: '继续前进' },
      { type: 'bot', text: '遇到士兵' },
      { type: 'user', text: '请汇总当前信息' },
      { type: 'bot', text: '最新整理结果' },
      { type: 'user', text: '谢谢' },
    ]);

    expect(result).toBe('最新整理结果');
  });
});

describe('reasoning updates', () => {
  it('parses hypotheses with evidence from a structured block', () => {
    const result = parseAIForReasoningUpdates(`
      <TRPG_REASONING>
      {"hypotheses":[{"statement":"管家可能进入过书房","evidence":["备用钥匙在管家手中","门锁没有破坏痕迹"],"contradictions":["管家声称整晚在厨房"],"confidence":65,"status":"open"}]}
      </TRPG_REASONING>
    `);

    expect(result).toHaveLength(1);
    expect(result[0].statement).toBe('管家可能进入过书房');
    expect(result[0].confidence).toBe(65);
    expect(result[0].evidence).toHaveLength(2);
  });

  it('rejects hypotheses without supporting evidence', () => {
    const result = parseAIForReasoningUpdates(
      '<TRPG_REASONING>{"hypotheses":[{"statement":"管家是凶手","evidence":[],"confidence":100}]}</TRPG_REASONING>'
    );
    expect(result).toEqual([]);
  });

  it('updates an existing hypothesis instead of duplicating it', () => {
    const current = [{ id: 'h1', statement: '管家可能说谎', evidence: ['旧线索'], contradictions: [], confidence: 30, status: 'open' }];
    const updates = [{ id: 'h2', statement: '管家可能说谎', evidence: ['新线索'], contradictions: [], confidence: 60, status: 'open' }];
    const result = mergeHypotheses(current, updates);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('h1');
    expect(result[0].confidence).toBe(60);
  });

  it('binds evidence to recorded clues, items, and locations', () => {
    const result = groundHypotheses([{
      id: 'h1',
      statement: '管家进入过书房',
      evidence: ['书房门锁没有破坏痕迹', '备用钥匙在管家手中'],
      contradictions: [],
      confidence: 70,
      status: 'open',
    }], {
      clues: ['书房门锁没有破坏痕迹'],
      inventory: ['备用钥匙在管家手中'],
      locations: ['书房'],
      generatedText: '',
    });

    expect(result).toHaveLength(1);
    expect(result[0].evidenceSources.map((item) => item.source)).toEqual(['clue', 'item']);
  });

  it('rejects unsupported evidence before saving a hypothesis', () => {
    const result = groundHypotheses([{
      id: 'h1',
      statement: '管家进入过书房',
      evidence: ['没有出现过的证据', '另一个凭空证据'],
      contradictions: [],
      confidence: 90,
      status: 'open',
    }], {
      clues: ['真实线索'],
      generatedText: '这一轮没有提供相关事实。',
    });

    expect(result).toEqual([]);
  });

  it('allows explicit current-narrative evidence but caps its confidence', () => {
    const result = groundHypotheses([{
      id: 'h1',
      statement: '访客可能熟悉庄园',
      evidence: ['访客避开了松动地板', '访客直接走向暗门'],
      contradictions: [],
      confidence: 80,
      status: 'open',
    }], {
      generatedText: '访客避开了松动地板，随后访客直接走向暗门。',
    });

    expect(result[0].confidence).toBe(45);
    expect(result[0].evidenceSources.every((item) => item.source === 'narrative')).toBe(true);
  });
});

// ── computeOutcome ──

describe('computeOutcome', () => {
  describe('d20 system', () => {
    it('natural 20 → CRITICAL_SUCCESS regardless of DC', () => {
      const result = { rolls: [20], modTotal: 25, sides: 20, count: 1, modifier: '+5' };
      expect(computeOutcome(result, 30)).toBe(OUTCOME_TIERS.CRITICAL_SUCCESS);
    });

    it('natural 1 → CRITICAL_FAILURE regardless of DC', () => {
      const result = { rolls: [1], modTotal: 6, sides: 20, count: 1, modifier: '+5' };
      expect(computeOutcome(result, 5)).toBe(OUTCOME_TIERS.CRITICAL_FAILURE);
    });

    it('modTotal >= DC → SUCCESS', () => {
      const result = { rolls: [17], modTotal: 20, sides: 20, count: 1, modifier: '+3' };
      expect(computeOutcome(result, 15)).toBe(OUTCOME_TIERS.SUCCESS);
    });

    it('modTotal < DC → FAILURE', () => {
      const result = { rolls: [5], modTotal: 8, sides: 20, count: 1, modifier: '+3' };
      expect(computeOutcome(result, 15)).toBe(OUTCOME_TIERS.FAILURE);
    });

    it('natural 20 with no DC → CRITICAL_SUCCESS', () => {
      const result = { rolls: [20], modTotal: 20, sides: 20, count: 1 };
      expect(computeOutcome(result, null)).toBe(OUTCOME_TIERS.CRITICAL_SUCCESS);
    });

    it('natural 1 with no DC → CRITICAL_FAILURE', () => {
      const result = { rolls: [1], modTotal: 1, sides: 20, count: 1 };
      expect(computeOutcome(result, null)).toBe(OUTCOME_TIERS.CRITICAL_FAILURE);
    });

    it('no DC, modTotal ≥ 20 → SUCCESS', () => {
      const result = { rolls: [17], modTotal: 20, sides: 20, count: 1, modifier: '+3' };
      expect(computeOutcome(result, null)).toBe(OUTCOME_TIERS.SUCCESS);
    });

    it('no DC, modTotal 10-19 → MARGINAL', () => {
      const result = { rolls: [12], modTotal: 12, sides: 20, count: 1 };
      expect(computeOutcome(result, null)).toBe(OUTCOME_TIERS.MARGINAL);
    });

    it('no DC, modTotal < 10 → FAILURE', () => {
      const result = { rolls: [3], modTotal: 3, sides: 20, count: 1 };
      expect(computeOutcome(result, null)).toBe(OUTCOME_TIERS.FAILURE);
    });

    it('DC equals modTotal → SUCCESS (meets it beats it)', () => {
      const result = { rolls: [10], modTotal: 15, sides: 20, count: 1, modifier: '+5' };
      expect(computeOutcome(result, 15)).toBe(OUTCOME_TIERS.SUCCESS);
    });
  });

  describe('d100 system', () => {
    it('natural 100 → CRITICAL_SUCCESS', () => {
      const result = { rolls: [100], modTotal: 100, sides: 100, count: 1 };
      expect(computeOutcome(result)).toBe(OUTCOME_TIERS.CRITICAL_SUCCESS);
    });

    it('natural 1 → CRITICAL_FAILURE', () => {
      const result = { rolls: [1], modTotal: 1, sides: 100, count: 1 };
      expect(computeOutcome(result)).toBe(OUTCOME_TIERS.CRITICAL_FAILURE);
    });
  });

  describe('non-d20 proportional', () => {
    it('2d6 max roll (12) → CRITICAL_SUCCESS', () => {
      const result = { rolls: [6, 6], modTotal: 12, total: 12, sides: 6, count: 2 };
      const outcome = computeOutcome(result, null);
      expect(outcome).toBe(OUTCOME_TIERS.CRITICAL_SUCCESS);
    });

    it('2d6 high roll (7) → SUCCESS', () => {
      const result = { rolls: [3, 4], modTotal: 7, total: 7, sides: 6, count: 2 };
      const outcome = computeOutcome(result, null);
      expect(outcome).toBe(OUTCOME_TIERS.SUCCESS);
    });

    it('2d6 low roll (4) → FAILURE', () => {
      const result = { rolls: [2, 2], modTotal: 4, total: 4, sides: 6, count: 2 };
      const outcome = computeOutcome(result, null);
      expect(outcome).toBe(OUTCOME_TIERS.FAILURE);
    });

    it('2d6 min roll (2) → CRITICAL_FAILURE', () => {
      const result = { rolls: [1, 1], modTotal: 2, total: 2, sides: 6, count: 2 };
      const outcome = computeOutcome(result, null);
      expect(outcome).toBe(OUTCOME_TIERS.CRITICAL_FAILURE);
    });
  });

  describe('edge cases', () => {
    it('null input → null', () => {
      expect(computeOutcome(null)).toBeNull();
    });

    it('error object → null', () => {
      expect(computeOutcome({ error: 'bad' })).toBeNull();
    });
  });
});

// ── buildStructuredRollContext ──

describe('buildStructuredRollContext', () => {
  const baseDiceResult = { rolls: [17], modTotal: 20, total: 17, sides: 20, count: 1, modifier: '+3' };

  it('produces correct format with all fields', () => {
    const ctx = buildStructuredRollContext({
      notation: '1d20+3',
      diceResult: baseDiceResult,
      dc: 15,
      stat: 'WIS',
      skill: '察觉',
      outcome: OUTCOME_TIERS.SUCCESS,
    });
    expect(ctx).toContain('检定结果');
    expect(ctx).toContain('察觉(感知)');
    expect(ctx).toContain('DC 15');
    expect(ctx).toContain('1d20+3');
    expect(ctx).toContain('✅ 成功');
    expect(ctx).toContain('请根据此检定结果决定故事走向');
  });

  it('works without DC', () => {
    const ctx = buildStructuredRollContext({
      notation: '2d6+1',
      diceResult: { rolls: [3, 4], modTotal: 8, total: 7, sides: 6, count: 2, modifier: '+1' },
      outcome: OUTCOME_TIERS.SUCCESS,
    });
    expect(ctx).toContain('检定结果');
    expect(ctx).toContain('各骰: [3, 4]');
    expect(ctx).toContain('✅ 成功');
    // Should NOT contain DC line
    expect(ctx).not.toContain('难度等级');
  });

  it('works without stat/skill', () => {
    const ctx = buildStructuredRollContext({
      notation: '1d20',
      diceResult: { rolls: [15], modTotal: 15, total: 15, sides: 20, count: 1 },
      outcome: OUTCOME_TIERS.MARGINAL,
    });
    expect(ctx).toContain('⚡ 勉强成功');
    // Should NOT contain 检定项目 line
    expect(ctx).not.toContain('检定项目');
  });

  it('works with minimal fields', () => {
    const ctx = buildStructuredRollContext({
      notation: '1d20',
      diceResult: { rolls: [10], modTotal: 10, total: 10, sides: 20, count: 1 },
      outcome: null,
    });
    expect(ctx).toContain('检定结果');
    expect(ctx).toContain('1d20');
  });
});

// ── parseAIForRollRequest ──

describe('parseAIForRollRequest', () => {
  it('parses standard format', () => {
    const text = '前方黑暗中有窸窣声。【检定请求：WIS，DC12】请投一个d20进行察觉检定';
    const result = parseAIForRollRequest(text);
    expect(result).toEqual({ stat: 'WIS', dc: 12, skill: '察觉' });
  });

  it('parses without closing bracket', () => {
    const text = '【检定请求：DEX，DC15】地面塌陷，请投一个d20进行敏捷豁免检定';
    const result = parseAIForRollRequest(text);
    expect(result).toEqual({ stat: 'DEX', dc: 15, skill: '敏捷豁免' });
  });

  it('parses without spaces', () => {
    const text = '【检定请求:STR,DC10】请投一个d20进行力量检定';
    const result = parseAIForRollRequest(text);
    expect(result).toEqual({ stat: 'STR', dc: 10, skill: '力量' });
  });

  it('parses with Chinese comma', () => {
    const text = '【检定请求：CHA，DC20】请投一个d20进行说服检定';
    const result = parseAIForRollRequest(text);
    expect(result).toEqual({ stat: 'CHA', dc: 20, skill: '说服' });
  });

  it('returns null for no match', () => {
    expect(parseAIForRollRequest('普通文本没有检定请求')).toBeNull();
  });

  it('returns null for malformed request', () => {
    expect(parseAIForRollRequest('【检定请求：XXX，DC12】')).toBeNull();
  });

  it('handles stat in lowercase (case-insensitive)', () => {
    const text = '【检定请求：str，DC8】请投一个d20进行攀爬检定';
    const result = parseAIForRollRequest(text);
    expect(result).toEqual({ stat: 'STR', dc: 8, skill: '攀爬' });
  });
});

// ── parseAIForStateChanges ──

describe('parseAIForStateChanges', () => {
  it('parses hp change', () => {
    expect(parseAIForStateChanges('[STATE:hp=-5]')).toEqual({ hp: '-5' });
  });

  it('parses multiple changes', () => {
    const text = '[STATE:hp=-3,sp=-1,add_inventory=治疗药水,location=酒馆]';
    const result = parseAIForStateChanges(text);
    expect(result).toEqual({
      hp: '-3',
      sp: '-1',
      add_inventory: '治疗药水',
      location: '酒馆',
    });
  });

  it('parses add_inventory with spaces in value', () => {
    expect(parseAIForStateChanges('[STATE:add_inventory=大 治疗药水]')).toEqual({
      add_inventory: '大 治疗药水',
    });
  });

  it('merges multiple STATE tags on separate lines', () => {
    const text = '[STATE:add_inventory=钥匙]\n[STATE:add_clue=墙上有爪痕]\n[STATE:hp=-3]';
    const result = parseAIForStateChanges(text);
    expect(result).toEqual({
      add_inventory: '钥匙',
      add_clue: '墙上有爪痕',
      hp: '-3',
    });
  });

  it('returns null for no STATE tag', () => {
    expect(parseAIForStateChanges('普通文本')).toBeNull();
  });

  it('returns null for empty STATE tag', () => {
    expect(parseAIForStateChanges('[STATE:]')).toBeNull();
  });
});

// ── applyStateChanges ──

describe('applyStateChanges', () => {
  it('applies HP delta', () => {
    const prev = getDefaultGameState();
    const next = applyStateChanges(prev, { hp: '-5' });
    expect(next.hp).toBe(15);
    expect(next.maxHp).toBe(20);
  });

  it('clamps HP to 0', () => {
    const prev = { ...getDefaultGameState(), hp: 3 };
    const next = applyStateChanges(prev, { hp: '-10' });
    expect(next.hp).toBe(0);
  });

  it('clamps HP to maxHp', () => {
    const prev = getDefaultGameState();
    const next = applyStateChanges(prev, { hp: '+100' });
    expect(next.hp).toBe(20);
  });

  it('applies SP delta', () => {
    const prev = getDefaultGameState();
    const next = applyStateChanges(prev, { sp: '-3' });
    expect(next.sp).toBe(7);
  });

  it('adds inventory item', () => {
    const prev = getDefaultGameState();
    const next = applyStateChanges(prev, { add_inventory: '长剑' });
    expect(next.inventory).toContain('长剑');
  });

  it('removes inventory item', () => {
    const prev = { ...getDefaultGameState(), inventory: ['长剑', '盾牌'] };
    const next = applyStateChanges(prev, { remove_inventory: '长剑' });
    expect(next.inventory).toEqual(['盾牌']);
  });

  it('removes inventory item not found (no-op)', () => {
    const prev = { ...getDefaultGameState(), inventory: ['长剑'] };
    const next = applyStateChanges(prev, { remove_inventory: '药水' });
    expect(next.inventory).toEqual(['长剑']);
  });

  it('updates location', () => {
    const prev = getDefaultGameState();
    const next = applyStateChanges(prev, { location: '黑暗森林' });
    expect(next.location).toBe('黑暗森林');
  });

  it('applies multiple changes at once', () => {
    const prev = getDefaultGameState();
    const next = applyStateChanges(prev, {
      hp: '-5',
      sp: '-2',
      add_inventory: '魔法戒指',
      location: '废弃神殿',
    });
    expect(next.hp).toBe(15);
    expect(next.sp).toBe(8);
    expect(next.inventory).toContain('魔法戒指');
    expect(next.location).toBe('废弃神殿');
  });

  it('updates maxHp and adjusts current', () => {
    const prev = getDefaultGameState();
    // maxHp processed first, then hp as absolute value clamped to new maxHp
    const next = applyStateChanges(prev, { maxHp: '30', hp: '30' });
    expect(next.maxHp).toBe(30);
    expect(next.hp).toBe(30);
  });

  it('returns prev unchanged if no changes', () => {
    const prev = getDefaultGameState();
    expect(applyStateChanges(prev, null)).toBe(prev);
    expect(applyStateChanges(prev, {})).not.toBe(prev); // new object
  });
});

// ── getStatName ──

describe('getStatName', () => {
  it('returns Chinese name for known stats', () => {
    expect(getStatName('STR')).toBe('力量');
    expect(getStatName('DEX')).toBe('敏捷');
    expect(getStatName('CON')).toBe('体质');
    expect(getStatName('INT')).toBe('智力');
    expect(getStatName('WIS')).toBe('感知');
    expect(getStatName('CHA')).toBe('魅力');
  });

  it('returns input for unknown stats', () => {
    expect(getStatName('LCK')).toBe('LCK');
  });

  it('returns empty string for falsy input', () => {
    expect(getStatName('')).toBe('');
    expect(getStatName(null)).toBe('');
  });
});
