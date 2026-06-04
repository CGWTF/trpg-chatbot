import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import StorySidebar from './components/StorySidebar';
import CharPanel from './components/CharPanel';
import { rollDice, formatDiceResult } from './utils/dice';
import { computeOutcome, buildStructuredRollContext, parseAIForRollRequest, parseAIForStateChanges, applyStateChanges, getDefaultGameState } from './utils/rollContext';
import { saveImageConfig, getImageConfig } from './utils/storage';
import useLocalStorageState from './hooks/useLocalStorageState';
import useStoryManager from './hooks/useStoryManager';
import usePipeline from './hooks/usePipeline';
import createDicePlugin from './plugins/dicePlugin';
import createRulePlugin from './plugins/rulePlugin';
import createAIPlugin from './plugins/aiPlugin';
import createImagePlugin from './plugins/imagePlugin';
import './App.css';

function getTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

const WELCOME_MSG = {
  text: `🐉 **欢迎来到跑团助手！**

我是你的冒险向导，可以帮你:
• 🎲 **投骰子** — \`/r 2d6+1\`、\`/r 1d20\`、\`/r d100\`
• 📖 **查规则** — 直接提问如"AC怎么算"、"优势是什么"
• 📖 **互动故事** — 说"开始一段冒险"，我作为GM带你进入故事世界
• 🖼️ **场景配图** — 点 GM 回复下的"生成配图"或输入 \`/image 描述\`
• 🎭 **扮演灵感** — \`/rp\` 获取随机扮演提示
• 📜 **冒险记录** — 点左上角 📜 查看和管理所有存档
• 🛠️ **帮助** — \`/help\` 查看全部功能

**💡 故事模式提示:** 先点右上角 ⚙️ 设置 API Key，然后对我说"开始一个奇幻冒险"试试吧！`,
  type: 'bot',
  time: getTime(),
};

export default function App() {
  // ── 状态 ──
  const { stories, currentId, messages, setMessages, addMessage, newStory, switchStory, removeStory } = useStoryManager(WELCOME_MSG);
  const [apiKey, setApiKey] = useLocalStorageState('trpg_deepseek_key', '');
  const [imageConfig, setImageConfigState] = useLocalStorageState('trpg_image_config', getImageConfig());
  const [charStats, setCharStats] = useLocalStorageState('trpg_char_stats', { STR:0,DEX:0,CON:0,INT:0,WIS:0,CHA:0 });
  const [pointLimit, setPointLimit] = useLocalStorageState('trpg_point_limit', 20);

  // 一次性迁移：D&D 属性值格式 (≥7) → 加值点数 (值-10)
  useEffect(() => {
    try {
      const raw = localStorage.getItem('trpg_char_stats');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const vals = Object.values(parsed);
      if (vals.length === 6 && vals.every(v => typeof v === 'number' && v >= 7)) {
        const migrated = {};
        for (const [k, v] of Object.entries(parsed)) {
          migrated[k] = Math.max(0, (parseInt(v) || 10) - 10);
        }
        setCharStats(migrated);
      }
    } catch {}
    try {
      const raw = localStorage.getItem('trpg_point_limit');
      if (raw && parseInt(raw) >= 60) {
        setPointLimit(20);
      }
    } catch {}
  }, []); // 仅首次挂载执行

  const [characterName, setCharacterName] = useLocalStorageState('trpg_character_name', '冒险者');
  const [pendingRollRequest, setPendingRollRequest] = useState(null); // AI 要求的检定: {stat, dc, skill}
  const [gameState, setGameState] = useLocalStorageState('trpg_game_state', getDefaultGameState());
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showCharPanel, setShowCharPanel] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(null);

  // ── 静态插件 (不依赖 messages, 只创建一次) ──
  const staticPlugins = useMemo(() => [
    createDicePlugin(),
    createRulePlugin(),
    createImagePlugin(),
  ], []);

  // ── 动态插件 (不再依赖 messages 闭包，sendToAI 直接传参) ──
  const aiPlugin = useMemo(() => createAIPlugin({
    onStreamStart: () => { setIsStreaming(true); setStreamingText(''); },
    onStreamChunk: (text) => setStreamingText(text),
    onStreamEnd: (aborted, fullText) => {
      setIsStreaming(false);
      setStreamingText('');
      abortRef.current = null;
      if (!aborted) {
        // 解析 AI 回复中的检定请求
        if (fullText) {
          const rollReq = parseAIForRollRequest(fullText);
          if (rollReq) {
            setPendingRollRequest(rollReq);
          } else if (fullText.length > 20) {
            // 调试：AI 回复了但没有检定请求——可能格式不对或 AI 没遵循提示词
            console.warn('[检定解析] AI 回复中未检测到检定请求，回复预览:', fullText.slice(0, 120));
          }
          // 解析状态变更（存在时自动应用）
          const stateChanges = parseAIForStateChanges(fullText);
          if (stateChanges) setGameState(prev => applyStateChanges(prev, stateChanges));
        }
        setIsProcessing(false);
      }
    },
    onError: (msg) => {
      addMessage({ text: msg, type: 'system', time: getTime() });
      setIsStreaming(false);
      setStreamingText('');
      setIsProcessing(false);
    },
  }), []);

  const plugins = useMemo(() => [...staticPlugins, aiPlugin], [staticPlugins, aiPlugin]);
  const pipeline = usePipeline(plugins);

  // ── 图片配置 ──
  const updateImageConfig = (patch) => {
    const next = { ...imageConfig, ...patch };
    setImageConfigState(next);
    saveImageConfig(next);
  };

  // ── 图片生成 (按钮触发) ──
  const handleImageGenerate = useCallback(({ url, prompt, engine, messageIndex }) => {
    setMessages(prev => {
      const u = [...prev];
      if (messageIndex >= 0 && messageIndex < u.length) {
        u[messageIndex] = { ...u[messageIndex], image: { url, prompt, engine: engine || 'AI' } };
      }
      return u;
    });
  }, [setMessages]);

  // ── AI 调用 (v3: 支持传入最新 messages，避开闭包过期) ──
  const callAI = useCallback(async (userText, customMessages) => {
    if (!apiKey) {
      addMessage({
        text: '⚠️ **需要设置 API Key 才能使用故事模式！**\n\n请点击右上角的 ⚙️ 设置按钮，输入你的 DeepSeek API Key。',
        type: 'system',
        time: getTime(),
      });
      setIsProcessing(false);
      return;
    }

    const aiPlugin = plugins.find(p => p.name === 'ai');
    if (!aiPlugin) return;

    const controller = new AbortController();
    abortRef.current = controller;

    pipeline.run('onBeforeAI', userText);
    // 优先使用调用方传入的最新消息列表，否则用闭包中的 messages
    const latestMessages = customMessages || messages;
    const result = await aiPlugin.sendToAI(userText, controller, {
      messages: latestMessages,
      apiKey,
    });

    setIsStreaming(false);
    setStreamingText('');
    abortRef.current = null;

    if (result) {
      pipeline.run('onAfterAI', result);
      addMessage({ text: result, type: 'bot', time: getTime() });
    }
    setIsProcessing(false);
  }, [plugins, messages, apiKey, addMessage, pipeline]);

  // ── 快速检定 ──
  const handleQuickRoll = useCallback((check) => {
    const mod = charStats[check.stat] || 0;
    const notation = mod === 0 ? '1d20' : `1d20${mod > 0 ? '+' : ''}${mod}`;
    const result = rollDice(notation);

    // 检查是否有待处理的 AI 检定请求，且属性匹配
    const rollReq = pendingRollRequest;
    const statMatches = rollReq && rollReq.stat === check.stat;
    const dc = statMatches ? rollReq.dc : null;
    const skill = statMatches ? rollReq.skill : check.label;

    // 计算结果分级
    const outcome = computeOutcome(result, dc);
    const outcomeLabel = outcome ? `\n┄┄ ${outcome.label}` : '';
    const diceText = formatDiceResult(result) + outcomeLabel;

    addMessage({ text: diceText, type: 'dice', time: getTime() });

    if (apiKey) {
      // 构建结构化检定上下文
      const ctx = buildStructuredRollContext({
        notation,
        diceResult: result,
        dc,
        stat: check.stat,
        skill,
        outcome,
      });
      addMessage({ text: ctx, type: 'user', time: getTime(), _isDiceContext: true });
      setPendingRollRequest(null); // 消耗检定请求
      setIsProcessing(true);
      // 传入包含刚添加消息的最新列表，避免闭包过期
      callAI(ctx, [...messages, { text: diceText, type: 'dice', time: getTime() }, { text: ctx, type: 'user', time: getTime(), _isDiceContext: true }]);
    }
    pipeline.run('afterSend', diceText, { type: 'dice' });
  }, [charStats, pendingRollRequest, apiKey, addMessage, callAI, pipeline, messages]);

  // ── 发送消息 ──
  const handleSend = useCallback(async (text) => {
    if (text === '/clear') { newStory(); return; }
    if (abortRef.current) abortRef.current.abort();

    // 走 pipeline 处理 (内部已调用 beforeSend)
    const result = pipeline.process(text);
    if (!result) { setIsProcessing(false); return; }

    // 用户消息
    addMessage({ text, type: 'user', time: getTime() });

    // 根据 source 分发
    if (result.source === 'dice') {
      // 计算结果分级
      let rawResult = result._rawResult;
      let displayNotation = result.notation || text;
      const rollReq = pendingRollRequest;
      const statMatches = rollReq && rawResult && !rawResult.error
        && rawResult.count === 1 && rawResult.sides === 20 && !rawResult.modifier;
      const dc = rollReq?.dc ?? null;

      // 如果有待处理的检定请求且是纯 d20（无修正值），应用角色属性加值
      if (statMatches) {
        const statMod = charStats[rollReq.stat] || 0;
        if (statMod !== 0) {
          displayNotation = `1d20${statMod > 0 ? '+' : ''}${statMod}`;
          rawResult = rollDice(displayNotation);
        }
      }

      const outcome = rawResult ? computeOutcome(rawResult, dc) : null;
      const outcomeLabel = outcome ? `\n┄┄ ${outcome.label}` : '';

      addMessage({ ...result, text: formatDiceResult(rawResult) + outcomeLabel, time: getTime() });

      if (apiKey) {
        // 构建结构化检定上下文
        const ctx = buildStructuredRollContext({
          notation: displayNotation,
          diceResult: rawResult,
          dc,
          stat: rollReq?.stat,
          skill: rollReq?.skill,
          outcome,
        });
        setTimeout(() => {
          addMessage({ text: ctx, type: 'user', time: getTime(), _isDiceContext: true });
          setPendingRollRequest(null); // 消耗检定请求
          setIsProcessing(true);
          // 传入包含刚添加消息的最新列表，避免闭包过期
          callAI(ctx, [...messages, { text: formatDiceResult(rawResult) + outcomeLabel, type: 'dice', time: getTime() }, { text: ctx, type: 'user', time: getTime(), _isDiceContext: true }]);
        }, 300);
      } else {
        setIsProcessing(false);
      }
    } else if (result.source === 'rule') {
      addMessage({ ...result, time: getTime() });
      setIsProcessing(false);
    } else if (result.source === 'image') {
      setIsProcessing(true);
      const imgPlugin = plugins.find(p => p.name === 'image');
      if (imgPlugin) {
        try {
          const imgResult = await imgPlugin.generateImage(result.text);
          addMessage({ ...imgResult, time: getTime() });
        } catch (err) {
          addMessage({ text: `❌ 图片生成失败: ${err.message}`, type: 'system', time: getTime() });
        }
      }
      setIsProcessing(false);
    } else if (result.source === 'ai') {
      setIsProcessing(true);
      callAI(text);
    } else {
      addMessage({ ...result, time: getTime() });
      setIsProcessing(false);
    }

    pipeline.run('afterSend', text, result);
  }, [addMessage, apiKey, callAI, newStory, pipeline, plugins, pendingRollRequest, charStats, messages]);

  // ── 存档变更回调 ──
  const onNewWithHook = () => {
    newStory();
    pipeline.run('onStorySaved', { id: null, action: 'new' });
  };

  // ── render ──
  return (
    <div className="app">
      <StorySidebar stories={stories} currentId={currentId} onSwitch={switchStory} onDelete={removeStory} onNew={onNewWithHook} isOpen={showSidebar} onClose={() => setShowSidebar(false)} />

      <header className="app-header">
        <div className="header-left">
          <button className="sidebar-toggle-btn" onClick={() => setShowSidebar(!showSidebar)} title="冒险记录">📜</button>
          <span className="header-icon">🐉</span>
          <h1>跑团助手</h1>
          <span className="header-subtitle">TRPG Storyteller</span>
        </div>
        <div className="header-right">
          <label className="character-name-label">
            🧑 角色名:
            <input type="text" className="character-name-input" value={characterName} onChange={(e) => setCharacterName(e.target.value)} maxLength={20} placeholder="冒险者" />
          </label>
          <button className="settings-btn" onClick={() => setShowSettings(!showSettings)} title="API 设置">⚙️</button>
          <button className="clear-btn" onClick={onNewWithHook} title="开始新冒险">✨ 新冒险</button>
        </div>
      </header>

      <CharPanel stats={charStats} onChange={setCharStats} pointLimit={pointLimit} onPointLimitChange={setPointLimit} isOpen={showCharPanel} onToggle={() => setShowCharPanel(!showCharPanel)} gameState={gameState} />

      {showSettings && (
        <div className="settings-panel">
          <div className="settings-content">
            <h3>💬 对话 API (DeepSeek)</h3>
            <div className="settings-input-row">
              <input type="password" className="api-key-input" placeholder="sk-... DeepSeek API Key" value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
              <button className="settings-save-btn" onClick={() => setShowSettings(false)}>💾 保存</button>
            </div>
            <p className="settings-hint">获取: <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer">platform.deepseek.com</a>{apiKey && ' ✅'}</p>

            <hr className="settings-divider" />

            <h3>🖼️ 图片生成 API</h3>
            <div className="settings-field">
              <label>引擎:</label>
              <select className="settings-select" value={imageConfig.provider} onChange={(e) => updateImageConfig({ provider: e.target.value })}>
                <option value="pollinations">Pollinations.ai (免费，不稳定)</option>
                <option value="openai">OpenAI DALL-E</option>
                <option value="custom">自定义 (OpenAI 兼容)</option>
              </select>
            </div>
            {(imageConfig.provider === 'openai' || imageConfig.provider === 'custom') && (
              <>
                <div className="settings-input-row" style={{ marginTop: 8 }}>
                  <input type="password" className="api-key-input" placeholder="图片 API Key" value={imageConfig.apiKey} onChange={(e) => updateImageConfig({ apiKey: e.target.value })} />
                </div>
                <div className="settings-input-row" style={{ marginTop: 6, gap: 6 }}>
                  {imageConfig.provider === 'custom' && (
                    <input type="text" className="api-key-input" placeholder="Base URL" value={imageConfig.baseUrl} onChange={(e) => updateImageConfig({ baseUrl: e.target.value })} style={{ flex: 2 }} />
                  )}
                  <input type="text" className="api-key-input" placeholder="模型" value={imageConfig.model} onChange={(e) => updateImageConfig({ model: e.target.value })} style={{ flex: 1 }} />
                  {(() => {
                    const SIZE_OPTIONS = ['1024x1024', '1792x1024', '1024x1792', '512x512', '256x256'];
                    const isCustom = !SIZE_OPTIONS.includes(imageConfig.size);
                    return (<>
                      <select className="settings-select" value={isCustom ? 'custom' : imageConfig.size} onChange={(e) => {
                        if (e.target.value === 'custom') { updateImageConfig({ size: '' }); }
                        else { updateImageConfig({ size: e.target.value }); }
                      }} style={{ flex: 1, maxWidth: 150 }}>
                        <option value="1024x1024">1024×1024 (正方形)</option>
                        <option value="1792x1024">1792×1024 (横版)</option>
                        <option value="1024x1792">1024×1792 (竖版)</option>
                        <option value="512x512">512×512 (小图)</option>
                        <option value="256x256">256×256 (缩略图)</option>
                        <option value="custom">🔧 自定义...</option>
                      </select>
                      {isCustom && (
                        <input type="text" className="api-key-input" placeholder="如: 1280x720" value={imageConfig.size} onChange={(e) => updateImageConfig({ size: e.target.value })} style={{ flex: 1, maxWidth: 140 }} />
                      )}
                    </>);
                  })()}
                </div>
              </>
            )}
            <p className="settings-hint">
              {imageConfig.provider === 'pollinations' && '免费引擎，无需 Key，但可能限流。'}
              {imageConfig.provider === 'openai' && <>获取: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com</a></>}
              {imageConfig.provider === 'custom' && '任意兼容 OpenAI /v1/images/generations 的 API'}
            </p>
          </div>
        </div>
      )}

      <main className="app-main">
        <ChatWindow messages={messages} streamingText={streamingText} isStreaming={isStreaming} onImageGenerate={handleImageGenerate} />
      </main>

      <footer className="app-footer">
        <ChatInput onSend={handleSend} disabled={isProcessing} pendingRollRequest={pendingRollRequest} charStats={charStats} onQuickRoll={handleQuickRoll} />
      </footer>
    </div>
  );
}
