/**
 * 骰子投掷工具
 * 支持格式: 2d6, 1d20, 3d8+2, 4d6-1, d100, d%
 */

export function rollDice(notation) {
  // 清理输入
  const cleaned = notation.trim().toLowerCase().replace(/\s+/g, '');

  // d% 或 d100
  if (cleaned === 'd%' || cleaned === 'd100') {
    return rollSingleDice(100);
  }

  // 匹配格式: [X]d[Y][+/-Z]
  const match = cleaned.match(/^(\d+)?d(\d+)(?:([+-])(\d+))?$/);
  if (!match) return null;

  const count = parseInt(match[1] || '1');
  const sides = parseInt(match[2]);
  const modifierOp = match[3] || null;
  const modifier = match[4] ? parseInt(match[4]) : 0;

  if (count < 1 || count > 100) return { error: '骰子数量需在 1-100 之间' };
  if (sides < 2 || sides > 1000) return { error: '骰子面数需在 2-1000 之间' };

  const rolls = [];
  let total = 0;

  for (let i = 0; i < count; i++) {
    const r = Math.floor(Math.random() * sides) + 1;
    rolls.push(r);
    total += r;
  }

  // 修正值
  const modTotal = modifierOp === '+' ? total + modifier
    : modifierOp === '-' ? total - modifier
    : total;

  return {
    notation: cleaned,
    rolls,
    total,
    modTotal,
    modifier: modifierOp ? `${modifierOp}${modifier}` : null,
    sides,
    count,
  };
}

function rollSingleDice(sides) {
  const r = Math.floor(Math.random() * sides) + 1;
  return {
    notation: `d${sides}`,
    rolls: [r],
    total: r,
    modTotal: r,
    modifier: null,
    sides,
    count: 1,
  };
}

/**
 * 格式化投骰结果
 */
export function formatDiceResult(result) {
  if (!result) return '格式错误，请使用如: /r 2d6+1';
  if (result.error) return `❌ ${result.error}`;

  const { notation, rolls, total, modTotal, modifier, count } = result;

  let text = `🎲 **${notation}**\n`;
  if (count > 1) {
    text += `投掷: [${rolls.join(', ')}] = ${total}\n`;
  }
  if (modifier) {
    text += `修正后: ${total} ${modifier} = **${modTotal}**`;
  } else {
    text += `结果: **${modTotal}**`;
  }

  if (modTotal === result.sides && result.sides >= 20) {
    text += ' ✨ 大成功！';
  } else if (modTotal === 1 && result.sides >= 20) {
    text += ' 💀 大失败！';
  }

  return text;
}
