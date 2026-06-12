import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { parseAIForRollRequest } from '../utils/rollContext';
import createAIPlugin from '../plugins/aiPlugin';

function getTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * AI 对话核心：流式状态、callAI、插件生命周期、检定请求解析
 *
 * onAIStateUpdate: AI 回复中包含 [STATE:...] 标签时回调，由 useGameState 处理
 */
export default function useAIChat({
  apiKey,
  addMessage,
  messages,
  onAIStateUpdate,
  storyId,
  reasoningContext,
}) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [pendingRollState, setPendingRollState] = useState(null);
  const abortRef = useRef(null);

  // 仅创建一次 — 所有回调使用 state setter（稳定引用）
  const aiPlugin = useMemo(
    () =>
      createAIPlugin({
        onStreamStart: () => {
          setIsStreaming(true);
          setStreamingText('');
        },
        onStreamChunk: (text) => setStreamingText(text),
        onStreamEnd: (aborted, fullText) => {
          setIsStreaming(false);
          setStreamingText('');
          if (!aborted && fullText) {
            const rollReq = parseAIForRollRequest(fullText);
            if (rollReq) {
              setPendingRollState({ storyId, request: rollReq });
            } else if (fullText.length > 20) {
              console.warn(
                '[检定解析] AI 回复中未检测到检定请求，回复预览:',
                fullText.slice(0, 120)
              );
            }
            // 委托外部处理道具/线索/状态变更
            onAIStateUpdate?.(fullText);
          }
          setIsProcessing(false);
        },
        onError: (msg) => {
          addMessage({ text: msg, type: 'system', time: getTime() });
          setIsStreaming(false);
          setStreamingText('');
          setIsProcessing(false);
        },
      }),
    [addMessage, onAIStateUpdate, storyId]
  );

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, [storyId]);

  const pendingRollRequest = pendingRollState?.storyId === storyId
    ? pendingRollState.request
    : null;
  const setPendingRollRequest = useCallback((request) => {
    setPendingRollState(request ? { storyId, request } : null);
  }, [storyId]);

  const callAI = useCallback(
    async (userText, customMessages) => {
      if (!apiKey) {
        addMessage({
          text: '⚠️ **需要设置 API Key 才能使用故事模式！**\n\n请点击右上角的 ⚙️ 设置按钮，输入你的 DeepSeek API Key。',
          type: 'system',
          time: getTime(),
        });
        setIsProcessing(false);
        return;
      }

      setIsProcessing(true);
      const controller = new AbortController();
      abortRef.current = controller;

      const latestMessages = customMessages || messages;
      try {
        const result = await aiPlugin.sendToAI(userText, controller, {
          messages: latestMessages,
          apiKey,
          reasoningContext,
        });
        if (result && !controller.signal.aborted) {
          addMessage({ text: result, type: 'bot', time: getTime() });
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setIsStreaming(false);
        setStreamingText('');
        setIsProcessing(false);
      }
    },
    [apiKey, messages, addMessage, aiPlugin, reasoningContext]
  );

  return {
    callAI,
    aiPlugin,
    isProcessing,
    setIsProcessing,
    isStreaming,
    streamingText,
    abortRef,
    pendingRollRequest,
    setPendingRollRequest,
  };
}
