import { rollDice, formatDiceResult } from '../utils/dice';

/**
 * 骰子插件
 * beforeSend: 拦截 /r 指令 → 短路返回结果
 * onDiceRoll: 自然语言投骰检测
 */
export default function createDicePlugin() {
  return {
    name: 'dice',

    beforeSend(input) {
      const text = input.trim();
      if (text.startsWith('/r ') || text.startsWith('/roll ')) {
        const notation = text.replace(/^\/(r|roll)\s*/, '').trim();
        if (!notation) return input;
        const result = rollDice(notation);
        return { result: { text: formatDiceResult(result), type: 'dice', notation, source: 'dice' } };
      }
      return input;
    },

    onDiceRoll(input) {
      const match = input.match(/(?:投|roll?|丢)\s*(\d*d\d+[+-]?\d*)/i);
      if (match && /[投roll丢骰]/i.test(input)) {
        const result = rollDice(match[1]);
        return { text: formatDiceResult(result), type: 'dice', notation: match[1], source: 'dice' };
      }
      return input;
    },
  };
}
