import { useCallback } from 'react';

/**
 * 消息处理管道 — 生命周期钩子架构
 *
 * 核心接口 (所有插件统一):
 *   beforeSend(input)              → 发送前，返回 { result } 可短路
 *   afterSend(input, result)       → 发送后，纯副作用
 *   beforeAI(messages)             → AI 请求前，可修改 messages
 *   afterAI(response)              → AI 回复后，可修改 response
 *
 * 分类匹配 (按优先级):
 *   onDiceRoll(input)              → 匹配骰子，返回 result 或 input
 *   onRuleQuery(input)             → 匹配规则，返回 result 或 input
 *   fallback(input)                → 默认处理器 (AI)
 *
 * 其他生命周期:
 *   onImageGenerated(info)         → 图片生成后
 *   onStorySaved(info)             → 存档变更后
 *
 * 约定:
 *   - 返回 { result: {...} } → 短路，直接使用 result
 *   - 返回 string → 替换 input 传递给下一个插件
 *   - 返回 input/undefined → 不处理，继续传递
 *   - 返回 false → 阻止后续所有插件
 */

export default function usePipeline(plugins = []) {
  /** 按顺序运行所有插件的某个钩子，支持管道传递和短路 */
  const run = useCallback((hook, ...args) => {
    for (const plugin of plugins) {
      if (!plugin[hook]) continue;
      const out = plugin[hook](...args);
      if (out === false) return false;
      if (out === undefined || out === true) continue;
      // 短路: 插件返回了完整结果
      if (out && typeof out === 'object' && 'result' in out) return out.result;
      // 管道: 修改第一个参数传给下一个插件
      args[0] = out;
    }
    return args[0];
  }, [plugins]);

  /**
   * 处理一条用户消息
   * @returns {{ text, type, source } | null}
   */
  const process = useCallback((input) => {
    // ── 1. beforeSend: 所有插件有机会拦截 ──
    const afterHook = run('beforeSend', input);
    if (afterHook === false) return null;
    // 如果 beforeSend 返回了非字符串，说明被短路了 (返回了 { result } 被 run 解包)
    if (typeof afterHook !== 'string') return afterHook;
    input = afterHook;

    // ── 2. 按优先级尝试匹配 ──
    // 2a. 骰子
    const diceOut = run('onDiceRoll', input);
    if (diceOut !== input && diceOut !== undefined) return diceOut;

    // 2b. 规则
    const ruleOut = run('onRuleQuery', input);
    if (ruleOut !== input && ruleOut !== undefined) return ruleOut;

    // 2c. 默认 → AI
    const fallbackOut = run('fallback', input);
    if (fallbackOut !== input && fallbackOut !== undefined) return fallbackOut;

    return null;
  }, [run]);

  return { process, run };
}
