import { useCallback } from 'react';

/**
 * 消息处理管道 — 生命周期钩子架构
 *
 * 生命周期:
 *   beforeProcess(input)          → 消息处理前，可返回修改后的 input
 *   onBeforeSend(input)           → 用户点发送时触发
 *   onAfterSend(input, result)    → 消息处理完成后
 *   onDiceRoll(notation, result)  → 骰子投掷
 *   onRuleQuery(key, text)        → 规则匹配
 *   onBeforeAI(messages)          → AI 请求前，可修改 messages
 *   onAfterAI(text)               → AI 回复后，可修改 text
 *   onImageGenerated(result)      → 图片生成后
 *   onStorySaved(story)           → 存档变更后
 *   fallback(input)               → 无匹配时的默认处理
 *
 * 每个钩子返回 false 可阻止后续插件执行。
 * 插件按顺序执行，前一个的输出是后一个的输入。
 */

export default function usePipeline(plugins = []) {
  const run = useCallback((hook, ...args) => {
    for (const plugin of plugins) {
      if (!plugin[hook]) continue;
      const result = plugin[hook](...args);
      if (result === false) return false;       // 阻止传播
      if (result !== undefined && result !== true) {
        args[0] = result;                        // 管道传递
      }
    }
    return args[0];
  }, [plugins]);

  /**
   * 处理一条用户消息，返回 { type, text, useAI }
   */
  const process = useCallback((input) => {
    // 1. beforeProcess — 插件可以拦截和转换输入
    input = run('beforeProcess', input);
    if (input === false) return null;

    // 2. 尝试骰子
    const diceResult = run('onDiceRoll', input);
    if (diceResult && diceResult !== input) {
      return diceResult;
    }

    // 3. 尝试规则
    const ruleResult = run('onRuleQuery', input);
    if (ruleResult && ruleResult !== input) {
      return ruleResult;
    }

    // 4. fallback → AI
    const fallback = run('fallback', input);
    if (fallback && fallback !== input) {
      return fallback;
    }

    return null;
  }, [run]);

  return { process, run };
}
