import { useCallback } from 'react';
import { rollDice, formatDiceResult } from '../utils/dice';
import { computeOutcome, buildStructuredRollContext } from '../utils/rollContext';

function getTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * 骰子检定→AI 上下文的完整流程
 * - handleQuickRoll: 角色面板/快捷按钮触发的检定
 * - resolveDiceRoll: handleSend 中 /r 命令触发的检定路径
 */
export default function useRollResolution({
  charStats,
  pendingRollRequest,
  setPendingRollRequest,
  apiKey,
  addMessage,
  callAI,
}) {
  // ── 快速检定（按钮触发） ──
  const handleQuickRoll = useCallback(
    (check) => {
      const mod = charStats[check.stat] || 0;
      const notation = mod === 0 ? '1d20' : `1d20${mod > 0 ? '+' : ''}${mod}`;
      const result = rollDice(notation);

      const rollReq = pendingRollRequest;
      const statMatches = rollReq && rollReq.stat === check.stat;
      const dc = statMatches ? rollReq.dc : null;
      const skill = statMatches ? rollReq.skill : check.label;

      const outcome = computeOutcome(result, dc);
      const outcomeLabel = outcome ? `\n┄┄ ${outcome.label}` : '';
      const diceText = formatDiceResult(result) + outcomeLabel;

      addMessage({ text: diceText, type: 'dice', time: getTime() });

      if (apiKey) {
        const ctx = buildStructuredRollContext({
          notation,
          diceResult: result,
          dc,
          stat: check.stat,
          skill,
          outcome,
        });
        addMessage({ text: ctx, type: 'user', time: getTime(), _isDiceContext: true });
        setPendingRollRequest(null);
        callAI(ctx);
      }
    },
    [charStats, pendingRollRequest, apiKey, addMessage, callAI, setPendingRollRequest]
  );

  // ── /r 命令触发的检定结果处理 ──
  const resolveDiceRoll = useCallback(
    ({ rawResult, notation, sourceText }) => {
      let effectiveResult = rawResult;
      let displayNotation = notation || sourceText;
      const rollReq = pendingRollRequest;
      const statMatches =
        rollReq &&
        rawResult &&
        !rawResult.error &&
        rawResult.count === 1 &&
        rawResult.sides === 20 &&
        !rawResult.modifier;
      const dc = rollReq?.dc ?? null;

      if (statMatches) {
        const statMod = charStats[rollReq.stat] || 0;
        if (statMod !== 0) {
          displayNotation = `1d20${statMod > 0 ? '+' : ''}${statMod}`;
          effectiveResult = rollDice(displayNotation);
        }
      }

      const outcome = effectiveResult ? computeOutcome(effectiveResult, dc) : null;
      const outcomeLabel = outcome ? `\n┄┄ ${outcome.label}` : '';

      addMessage({
        text: formatDiceResult(effectiveResult) + outcomeLabel,
        type: 'dice',
        time: getTime(),
      });

      if (apiKey) {
        const ctx = buildStructuredRollContext({
          notation: displayNotation,
          diceResult: effectiveResult,
          dc,
          stat: rollReq?.stat,
          skill: rollReq?.skill,
          outcome,
        });
        setTimeout(() => {
          addMessage({ text: ctx, type: 'user', time: getTime(), _isDiceContext: true });
          setPendingRollRequest(null);
          callAI(ctx);
        }, 300);
      }
    },
    [charStats, pendingRollRequest, apiKey, addMessage, callAI, setPendingRollRequest]
  );

  return { handleQuickRoll, resolveDiceRoll };
}
