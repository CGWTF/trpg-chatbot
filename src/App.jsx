import { useState, useCallback, useRef, useMemo } from 'react';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import StorySidebar from './components/StorySidebar';
import CharPanel from './components/CharPanel';
import { rollDice, formatDiceResult } from './utils/dice';
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

  const [characterName, setCharacterName] = useState('冒险者');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showCharPanel, setShowCharPanel] = useState(false);
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(null);

  // ── 插件 ──
  const plugins = useMemo(() => [
    createDicePlugin({ onResult: (r) => { /* 骰子结果回调 - 可扩展 */ } }),
    createRulePlugin(),
    createAIPlugin({
      apiKey,
      getMessages: () => messages,
      onStreamStart: () => { setIsStreaming(true); setStreamingText(''); },
      onStreamChunk: (text) => setStreamingText(text),
      onStreamEnd: (aborted) => {
        setIsStreaming(false);
        setStreamingText('');
        abortRef.current = null;
        if (!aborted) setIsProcessing(false);
      },
      onError: (msg) => {
        addMessage({ text: msg, type: 'system', time: getTime() });
        setIsStreaming(false);
        setStreamingText('');
        setIsProcessing(false);
      },
    }),
    createImagePlugin({
      onResult: (r) => { /* 图片生成回调 - 可扩展 */ },
    }),
  ], [apiKey, messages, addMessage]);

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
    pipeline.run('onImageGenerated', { url, prompt, engine });
  }, [setMessages, pipeline]);

  // ── AI 调用 ──
  const callAI = useCallback(async (userText) => {
    const aiPlugin = plugins.find(p => p.name === 'ai');
    if (!aiPlugin) return;

    const controller = new AbortController();
    abortRef.current = controller;

    pipeline.run('onBeforeAI', userText);
    const result = await aiPlugin.sendToAI(userText, controller);

    setIsStreaming(false);
    setStreamingText('');
    abortRef.current = null;

    if (result) {
      pipeline.run('onAfterAI', result);
      addMessage({ text: result, type: 'bot', time: getTime() });
    }
    setIsProcessing(false);
  }, [plugins, addMessage, pipeline]);

  // ── 快速检定 ──
  const handleQuickRoll = useCallback((check) => {
    const mod = charStats[check.stat] || 0;
    const result = rollDice(`1d20${mod >= 0 ? '+' : ''}${mod}`);
    const diceText = formatDiceResult(result);

    pipeline.run('onBeforeSend', `/r 1d20${mod >= 0 ? '+' : ''}${mod}`);
    addMessage({ text: diceText, type: 'dice', time: getTime() });

    if (apiKey) {
      const ctx = `🎲 我进行了**${check.desc}**：${diceText}\n\n请根据这个检定结果，在故事中描述接下来发生了什么。`;
      addMessage({ text: ctx, type: 'user', time: getTime() });
      setIsProcessing(true);
      callAI(ctx);
    }
    pipeline.run('onAfterSend', ctx || diceText, { type: 'dice' });
  }, [charStats, apiKey, addMessage, callAI, pipeline]);

  // ── 发送消息 ──
  const handleSend = useCallback(async (text) => {
    if (text === '/clear') { newStory(); return; }
    if (abortRef.current) abortRef.current.abort();

    pipeline.run('onBeforeSend', text);

    // 走 pipeline 处理
    const result = pipeline.process(text);
    if (!result) { setIsProcessing(false); return; }

    // 用户消息
    addMessage({ text, type: 'user', time: getTime() });

    // 根据 source 分发
    if (result.source === 'dice') {
      addMessage({ ...result, time: getTime() });
      if (apiKey) {
        const ctx = `🎲 我进行了检定：${text}\n\n检定结果：${result.text}\n\n请根据这个结果，在故事中描述接下来发生了什么。`;
        setTimeout(() => {
          addMessage({ text: ctx, type: 'user', time: getTime() });
          setIsProcessing(true);
          callAI(ctx);
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

    pipeline.run('onAfterSend', text, result);
  }, [addMessage, apiKey, callAI, newStory, pipeline, plugins]);

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
            <input type="text" className="character-name-input" value={characterName} onChange={(e) => setCharacterName(e.target.value || '冒险者')} maxLength={20} placeholder="冒险者" />
          </label>
          <button className="settings-btn" onClick={() => setShowSettings(!showSettings)} title="API 设置">⚙️</button>
          <button className="clear-btn" onClick={onNewWithHook} title="开始新冒险">✨ 新冒险</button>
        </div>
      </header>

      <CharPanel stats={charStats} onChange={setCharStats} onQuickRoll={handleQuickRoll} isOpen={showCharPanel} onToggle={() => setShowCharPanel(!showCharPanel)} />

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
                  <input type="text" className="api-key-input" placeholder="尺寸" value={imageConfig.size} onChange={(e) => updateImageConfig({ size: e.target.value })} style={{ flex: 1, maxWidth: 140 }} />
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
        <ChatInput onSend={handleSend} disabled={isProcessing} />
      </footer>
    </div>
  );
}
