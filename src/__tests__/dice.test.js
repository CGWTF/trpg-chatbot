import { describe, it, expect } from 'vitest';
import { rollDice, formatDiceResult } from '../utils/dice';

describe('rollDice', () => {
  it('单个骰子 d20 范围正确', () => {
    const r = rollDice('d20');
    expect(r.rolls.length).toBe(1);
    expect(r.rolls[0]).toBeGreaterThanOrEqual(1);
    expect(r.rolls[0]).toBeLessThanOrEqual(20);
  });

  it('多个骰子 2d6', () => {
    const r = rollDice('2d6');
    expect(r.rolls.length).toBe(2);
    expect(r.count).toBe(2);
    expect(r.sides).toBe(6);
  });

  it('带正修正值 1d20+5', () => {
    const r = rollDice('1d20+5');
    expect(r.modTotal).toBe(r.total + 5);
    expect(r.modifier).toBe('+5');
  });

  it('带负修正值 2d6-1', () => {
    const r = rollDice('2d6-1');
    expect(r.modTotal).toBe(r.total - 1);
  });

  it('d100', () => {
    const r = rollDice('d100');
    expect(r.sides).toBe(100);
    expect(r.rolls[0]).toBeGreaterThanOrEqual(1);
    expect(r.rolls[0]).toBeLessThanOrEqual(100);
  });

  it('非法格式返回 null', () => {
    expect(rollDice('hello')).toBeNull();
    expect(rollDice('abc')).toBeNull();
  });

  it('骰子数量超限', () => {
    const r = rollDice('101d6');
    expect(r.error).toBeDefined();
  });
});

describe('formatDiceResult', () => {
  it('格式化结果包含 result', () => {
    const r = rollDice('1d20');
    const text = formatDiceResult(r);
    expect(text).toContain('d20');
    expect(text).toContain('结果');
  });

  it('无效输入返回错误提示', () => {
    expect(formatDiceResult(null)).toContain('格式错误');
  });

  it('大成功标记', () => {
    const r = { notation: 'd20', rolls: [20], total: 20, modTotal: 20, sides: 20, count: 1, modifier: null };
    expect(formatDiceResult(r)).toContain('大成功');
  });

  it('大失败标记', () => {
    const r = { notation: 'd20', rolls: [1], total: 1, modTotal: 1, sides: 20, count: 1, modifier: null };
    expect(formatDiceResult(r)).toContain('大失败');
  });
});
