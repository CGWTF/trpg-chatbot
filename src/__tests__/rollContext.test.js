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
} from '../utils/rollContext';

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
