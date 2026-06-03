import { useCallback } from 'react';

/**
 * 消息处理管道
 *
 * 统一接口 (所有插件可实现):
 *   beforeSend(input)           → 发送前拦截，返回 { result } 短路
 *   onDiceRoll(input)           → 骰子匹配，返回 result 或 input
 *   onRuleQuery(input)          → 规则匹配，返回 result 或 input
 *   fallback(input)             → 兜底处理 (AI)
 *   afterSend(input, result)    → 发送后回调 (副作用)
 *   beforeAI(messages)          → AI 请求前，可修改 messages
 *   afterAI(response)           → AI 回复后，可修改 response
 *   onImageGenerated(info)      → 图片生成后
 *   onStorySaved(info)          → 存档变更后
 *
 * 约定:
 *   { result: {...} } → 短路，后续插件不再执行
 *   input             → 不处理，交给下一个插件
 *   false             → 阻止所有后续插件
 */

export default function usePipeline(plugins = []) {
  /** 按顺序运行所有插件的某个钩子 */
  const run = useCallback((hook, ...args) => {
    for (const plugin of plugins) {
      if (!plugin[hook]) continue;
      const out = plugin[hook](...args);
      if (out === false) return false;
      if (out === undefined || out === true) continue;
      // 短路返回
      if (out && typeof out === 'object' && 'result' in out) return out.result;
      // 管道传递
      args[0] = out;
    }
    return args[0];
  }, [plugins]);

  /**
   * 处理一条用户消息
   *   beforeSend → onDiceRoll → onRuleQuery → fallback
   */
  const process = useCallback((input) => {
    // 1. beforeSend: 所有插件有机会拦截
    const afterHook = run('beforeSend', input);
    if (afterHook === false) return null;
    if (typeof afterHook !== 'string') return afterHook;
    input = afterHook;

    // 2. 分类匹配
    const diceOut = run('onDiceRoll', input);
    if (diceOut !== input && diceOut !== undefined) return diceOut;

    const ruleOut = run('onRuleQuery', input);
    if (ruleOut !== input && ruleOut !== undefined) return ruleOut;

    const fallbackOut = run('fallback', input);
    if (fallbackOut !== input && fallbackOut !== undefined) return fallbackOut;

    return null;
  }, [run]);

  return { process, run };
}
