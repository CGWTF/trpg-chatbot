import { rollDice, formatDiceResult } from '../utils/dice';

/**
 * 骰子插件
 * beforeSend: 拦截 /r 指令
 * onDiceRoll: 自然语言投骰检测
 * afterSend: 骰子结果回调
 */
export default function createDicePlugin({ onResult } = {}) {
  return {
    name: 'dice',

    /** 拦截 /r 和 /roll 指令 → 短路 */
    beforeSend(input) {
      const text = input.trim();
      if (text.startsWith('/r ') || text.startsWith('/roll ')) {
        const notation = text.replace(/^\/(r|roll)\s*/, '').trim();
        if (!notation) return input;

        const result = rollDice(notation);
        const formatted = formatDiceResult(result);
        const msg = { text: formatted, type: 'dice', notation, source: 'dice' };
        onResult?.(msg);
        return { result: msg };  // 短路
      }
      return input;
    },

    /** 自然语言 "投2d6" */
    onDiceRoll(input) {
      const match = input.match(/(?:投|roll?|丢)\s*(\d*d\d+[+-]?\d*)/i);
      if (match && /[投roll丢骰]/i.test(input)) {
        const result = rollDice(match[1]);
        const formatted = formatDiceResult(result);
        const msg = { text: formatted, type: 'dice', notation: match[1], source: 'dice' };
        onResult?.(msg);
        return msg;
      }
      return input;
    },
  };
}
