import { rollDice, formatDiceResult } from '../utils/dice';

/**
 * 骰子插件
 * 生命周期: beforeProcess, onDiceRoll
 */
export default function createDicePlugin({ onResult }) {
  return {
    name: 'dice',

    // 在消息处理前检测 /r 指令
    beforeProcess(input) {
      const text = input.trim();

      // /r 或 /roll 指令
      if (text.startsWith('/r ') || text.startsWith('/roll ')) {
        const notation = text.replace(/^\/(r|roll)\s*/, '').trim();
        if (notation) {
          const result = rollDice(notation);
          const formatted = formatDiceResult(result);
          onResult?.({ text: formatted, type: 'dice', notation });
          return { text: formatted, type: 'dice', notation, source: 'dice' };
        }
      }
      return text;
    },

    // 自然语言投骰检测
    onDiceRoll(input) {
      const match = input.match(/(?:投|roll?|丢)\s*(\d*d\d+[+-]?\d*)/i);
      if (match && /[投roll丢骰]/i.test(input)) {
        const result = rollDice(match[1]);
        const formatted = formatDiceResult(result);
        onResult?.({ text: formatted, type: 'dice', notation: match[1] });
        return { text: formatted, type: 'dice', notation: match[1], source: 'dice' };
      }
      return input;
    },
  };
}
