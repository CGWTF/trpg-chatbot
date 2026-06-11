import { useState, useCallback, useMemo } from 'react';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import StorySidebar from './components/StorySidebar';
import CharPanel from './components/CharPanel';
import useLocalStorageState from './hooks/useLocalStorageState';
import useStoryManager from './hooks/useStoryManager';
import usePipeline from './hooks/usePipeline';
import useGameState from './hooks/useGameState';
import useAIChat from './hooks/useAIChat';
import useRollResolution from './hooks/useRollResolution';
import useCharacterState from './hooks/useCharacterState';
import useImageSettings from './hooks/useImageSettings';
import createDicePlugin from './plugins/dicePlugin';
import createRulePlugin from './plugins/rulePlugin';
import createImagePlugin from './plugins/imagePlugin';
import './App.css';

function getTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

const WELCOME_MSG = {
  text: `🐉 **欢迎来到跑团故事机！**

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
  // ── 故事/消息 ──
  const { stories, currentId, messages, setMessages, addMessage, newStory, switchStory, removeStory } =
    useStoryManager(WELCOME_MSG);

  // ── API Key ──
  const [apiKey, setApiKey] = useLocalStorageState('trpg_deepseek_key', '');

  // ── 图片配置 ──
  const { imageConfig, updateImageConfig, handleImageGenerate } = useImageSettings(setMessages);

  // ── 角色属性 ──
  const { charStats, setCharStats, pointLimit, setPointLimit, characterName, setCharacterName } =
    useCharacterState();

  // ── 游戏状态（HP/SP/道具/线索） ──
  const { gameState, applyAIStateUpdate } = useGameState();

  // ── AI 对话核心 ──
  const {
    callAI,
    aiPlugin,
    isProcessing,
    setIsProcessing,
    isStreaming,
    streamingText,
    abortRef,
    pendingRollRequest,
    setPendingRollRequest,
  } = useAIChat({ apiKey, addMessage, messages, onAIStateUpdate: applyAIStateUpdate });

  // ── 静态插件 + 管道 ──
  const staticPlugins = useMemo(
    () => [createDicePlugin(), createRulePlugin(), createImagePlugin()],
    []
  );
  const plugins = useMemo(
    () => [...staticPlugins, aiPlugin],
    [staticPlugins, aiPlugin]
  );
  const pipeline = usePipeline(plugins);

  // ── 检定处理 ──
  const { handleQuickRoll, resolveDiceRoll } = useRollResolution({
    charStats,
    pendingRollRequest,
    setPendingRollRequest,
    apiKey,
    addMessage,
    callAI,
  });

  // ── 消息发送（编排） ──
  const handleSend = useCallback(
    async (text) => {
      if (text === '/clear') {
        newStory();
        return;
      }
      if (abortRef.current) abortRef.current.abort();

      const result = pipeline.process(text);
      if (!result) {
        setIsProcessing(false);
        return;
      }

      addMessage({ text, type: 'user', time: getTime() });

      if (result.source === 'dice') {
        resolveDiceRoll({
          rawResult: result._rawResult,
          notation: result.notation || text,
          sourceText: text,
        });
        if (!apiKey) setIsProcessing(false);
      } else if (result.source === 'rule') {
        addMessage({ ...result, time: getTime() });
        setIsProcessing(false);
      } else if (result.source === 'image') {
        setIsProcessing(true);
        const imgPlugin = plugins.find((p) => p.name === 'image');
        if (imgPlugin) {
          try {
            const imgResult = await imgPlugin.generateImage(result.text);
            addMessage({ ...imgResult, time: getTime() });
          } catch (err) {
            addMessage({
              text: `❌ 图片生成失败: ${err.message}`,
              type: 'system',
              time: getTime(),
            });
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
    },
    [addMessage, apiKey, callAI, newStory, pipeline, plugins, resolveDiceRoll, abortRef, setIsProcessing]
  );

  // ── 新冒险 ──
  const onNewWithHook = useCallback(() => {
    newStory();
    pipeline.run('onStorySaved', { id: null, action: 'new' });
  }, [newStory, pipeline]);

  // ── UI 开关 ──
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showCharPanel, setShowCharPanel] = useState(false);

  // ── render ──
  return (
    <div className="app">
      <StorySidebar
        stories={stories}
        currentId={currentId}
        onSwitch={switchStory}
        onDelete={removeStory}
        onNew={onNewWithHook}
        isOpen={showSidebar}
        onClose={() => setShowSidebar(false)}
      />

      <header className="app-header">
        <div className="header-left">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setShowSidebar(!showSidebar)}
            title="冒险记录"
          >
            📜
          </button>
          <span className="header-icon">🐉</span>
          <h1>跑团故事机</h1>
          <span className="header-subtitle">TRPG Storyteller</span>
          <span className="header-rounds" title={`${messages.length} 条消息 / 约 ${Math.floor(messages.length / 2)} 轮对话`}>
            📝 ~{Math.floor(messages.length / 2)}轮
          </span>
        </div>
        <div className="header-right">
          <label className="character-name-label">
            🧑 角色名:
            <input
              type="text"
              className="character-name-input"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              maxLength={20}
              placeholder="冒险者"
            />
          </label>
          <button className="settings-btn" onClick={() => setShowSettings(!showSettings)} title="API 设置">
            ⚙️
          </button>
          <button className="clear-btn" onClick={onNewWithHook} title="开始新冒险">
            ✨ 新冒险
          </button>
        </div>
      </header>

      <CharPanel
        stats={charStats}
        onChange={setCharStats}
        pointLimit={pointLimit}
        onPointLimitChange={setPointLimit}
        isOpen={showCharPanel}
        onToggle={() => setShowCharPanel(!showCharPanel)}
        gameState={gameState}
      />

      {showSettings && (
        <div className="settings-panel">
          <div className="settings-content">
            <h3>💬 对话 API (DeepSeek)</h3>
            <div className="settings-input-row">
              <input
                type="password"
                className="api-key-input"
                placeholder="sk-... DeepSeek API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button className="settings-save-btn" onClick={() => setShowSettings(false)}>
                💾 保存
              </button>
            </div>
            <p className="settings-hint">
              获取:{' '}
              <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer">
                platform.deepseek.com
              </a>
              {apiKey && ' ✅'}
            </p>

            <hr className="settings-divider" />

            <h3>🖼️ 图片生成 API</h3>
            <div className="settings-field">
              <label>引擎:</label>
              <select
                className="settings-select"
                value={imageConfig.provider}
                onChange={(e) => updateImageConfig({ provider: e.target.value })}
              >
                <option value="pollinations">Pollinations.ai (免费，不稳定)</option>
                <option value="openai">OpenAI DALL-E</option>
                <option value="custom">自定义 (OpenAI 兼容)</option>
              </select>
            </div>
            {(imageConfig.provider === 'openai' || imageConfig.provider === 'custom') && (
              <>
                <div className="settings-input-row" style={{ marginTop: 8 }}>
                  <input
                    type="password"
                    className="api-key-input"
                    placeholder="图片 API Key"
                    value={imageConfig.apiKey}
                    onChange={(e) => updateImageConfig({ apiKey: e.target.value })}
                  />
                </div>
                <div className="settings-input-row" style={{ marginTop: 6, gap: 6 }}>
                  {imageConfig.provider === 'custom' && (
                    <input
                      type="text"
                      className="api-key-input"
                      placeholder="Base URL"
                      value={imageConfig.baseUrl}
                      onChange={(e) => updateImageConfig({ baseUrl: e.target.value })}
                      style={{ flex: 2 }}
                    />
                  )}
                  <input
                    type="text"
                    className="api-key-input"
                    placeholder="模型"
                    value={imageConfig.model}
                    onChange={(e) => updateImageConfig({ model: e.target.value })}
                    style={{ flex: 1 }}
                  />
                  <select
                    className="settings-select"
                    value={
                      ['1024x1024', '1792x1024', '1024x1792', '512x512', '256x256'].includes(
                        imageConfig.size
                      )
                        ? imageConfig.size
                        : 'custom'
                    }
                    onChange={(e) => {
                      if (e.target.value === 'custom') {
                        updateImageConfig({ size: '' });
                      } else {
                        updateImageConfig({ size: e.target.value });
                      }
                    }}
                    style={{ flex: 1, maxWidth: 150 }}
                  >
                    <option value="1024x1024">1024×1024 (正方形)</option>
                    <option value="1792x1024">1792×1024 (横版)</option>
                    <option value="1024x1792">1024×1792 (竖版)</option>
                    <option value="512x512">512×512 (小图)</option>
                    <option value="256x256">256×256 (缩略图)</option>
                    <option value="custom">🔧 自定义...</option>
                  </select>
                  {!['1024x1024', '1792x1024', '1024x1792', '512x512', '256x256'].includes(
                    imageConfig.size
                  ) && (
                    <input
                      type="text"
                      className="api-key-input"
                      placeholder="如: 1280x720"
                      value={imageConfig.size}
                      onChange={(e) => updateImageConfig({ size: e.target.value })}
                      style={{ flex: 1, maxWidth: 140 }}
                    />
                  )}
                </div>
              </>
            )}
            <p className="settings-hint">
              {imageConfig.provider === 'pollinations' && '免费引擎，无需 Key，但可能限流。'}
              {imageConfig.provider === 'openai' && (
                <>
                  获取:{' '}
                  <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">
                    platform.openai.com
                  </a>
                </>
              )}
              {imageConfig.provider === 'custom' && '任意兼容 OpenAI /v1/images/generations 的 API'}
            </p>
          </div>
        </div>
      )}

      <main className="app-main">
        <ChatWindow
          messages={messages}
          streamingText={streamingText}
          isStreaming={isStreaming}
          onImageGenerate={handleImageGenerate}
        />
      </main>

      <footer className="app-footer">
        <ChatInput
          onSend={handleSend}
          disabled={isProcessing}
          pendingRollRequest={pendingRollRequest}
          charStats={charStats}
          onQuickRoll={handleQuickRoll}
        />
      </footer>
    </div>
  );
}
