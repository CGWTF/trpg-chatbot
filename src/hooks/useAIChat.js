import { useState, useCallback, useRef, useMemo } from 'react';
import useLocalStorageState from './useLocalStorageState';
import {
  parseAIForRollRequest,
  parseAIForStateChanges,
  applyStateChanges,
  getDefaultGameState,
} from '../utils/rollContext';
import createAIPlugin from '../plugins/aiPlugin';

function getTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

/**
 * AI 对话核心：流式状态、callAI、插件生命周期、检定请求/状态变更解析
 */
export default function useAIChat({ apiKey, addMessage, messages }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [pendingRollRequest, setPendingRollRequest] = useState(null);
  const [gameState, setGameState] = useLocalStorageState(
    'trpg_game_state',
    getDefaultGameState()
  );
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
          abortRef.current = null;
          if (!aborted && fullText) {
            const rollReq = parseAIForRollRequest(fullText);
            console.log('[useAIChat] onStreamEnd, parseAIForRollRequest:', rollReq);
            if (rollReq) {
              setPendingRollRequest(rollReq);
            } else if (fullText.length > 20) {
              console.warn(
                '[检定解析] AI 回复中未检测到检定请求，回复预览:',
                fullText.slice(0, 120)
              );
            }
            const stateChanges = parseAIForStateChanges(fullText);
            if (stateChanges) {
              setGameState((prev) => applyStateChanges(prev, stateChanges));
            }
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
    [] // state setters 稳定，无需重建
  );

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

      const controller = new AbortController();
      abortRef.current = controller;

      const latestMessages = customMessages || messages;
      const result = await aiPlugin.sendToAI(userText, controller, {
        messages: latestMessages,
        apiKey,
      });

      setIsStreaming(false);
      setStreamingText('');
      abortRef.current = null;

      if (result) {
        addMessage({ text: result, type: 'bot', time: getTime() });
      }
      setIsProcessing(false);
    },
    [apiKey, messages, addMessage, aiPlugin]
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
    gameState,
  };
}
