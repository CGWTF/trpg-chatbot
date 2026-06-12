import { useState, useCallback, useMemo } from 'react';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import GameSidebar from './components/GameSidebar';
import InvestigationWorkspace from './components/InvestigationWorkspace';
import StorySetupWizard from './components/StorySetupWizard';
import useLocalStorageState from './hooks/useLocalStorageState';
import useStoryManager from './hooks/useStoryManager';
import usePipeline from './hooks/usePipeline';
import useGameState from './hooks/useGameState';
import useAIChat from './hooks/useAIChat';
import useRollResolution from './hooks/useRollResolution';
import useImageSettings from './hooks/useImageSettings';
import { findLatestSummaryReply } from './utils/rollContext';
import createDicePlugin from './plugins/dicePlugin';
import createRulePlugin from './plugins/rulePlugin';
import createImagePlugin from './plugins/imagePlugin';
import './App.css';
import './zelda-theme.css';

function getTime() {
  return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

const WELCOME_MSG = {
  text: `🐉 **欢迎来到跑团故事机！**

我是你的 守秘人。你可以直接描述角色的行动，我会像真正的 TRPG 游戏主持人一样，推动剧情、扮演 NPC、在你尝试有风险的动作时请求检定。

**点击右上角 📜 开始新冒险** — 创建你的角色卡，选择故事规模，我会根据你设定的游戏背景，为你呈现一个独一无二的互动故事。

故事中你可以——
• 🎲 投骰检定（AI 自动请求 + 输入框上方快速按钮）
• 🎒 收集道具、🔍 发现线索、🏛️ 探索场所（自动记录到右侧面板）
• 🕵️ 使用调查工作台整理推理假设和人物关系
• 🖼️ 生成场景配图（输入 \`/image 描述\`）

先点 ⚙️ 设置 API Key（免费注册 DeepSeek），然后开始你的冒险吧！`,
  type: 'bot',
  time: getTime(),
};

export default function App() {
  // ── 故事/消息 ──
  const {
    stories, currentId, messages, setMessages, addMessage, newStory, switchStory, removeStory, renameStory,
    character, setCharacter, gameState: storyGameState, setGameState: setStoryGameState,
  } =
    useStoryManager(WELCOME_MSG);

  // ── API Key ──
  const [apiKey, setApiKey] = useLocalStorageState('trpg_deepseek_key', '');

  // ── 图片配置 ──
  const { imageConfig, updateImageConfig, handleImageGenerate } = useImageSettings(setMessages);

  // ── 角色属性 ──
  const charStats = character.stats;
  const pointLimit = character.pointLimit;
  const characterName = character.name;
  const setupComplete = character.setupComplete || false;
  const setCharStats = useCallback(
    (value) => setCharacter((prev) => ({ ...prev, stats: typeof value === 'function' ? value(prev.stats) : value })),
    [setCharacter]
  );
  const setPointLimit = useCallback(
    (value) => setCharacter((prev) => ({ ...prev, pointLimit: typeof value === 'function' ? value(prev.pointLimit) : value })),
    [setCharacter]
  );
  const setCharacterName = useCallback(
    (value) => setCharacter((prev) => ({ ...prev, name: typeof value === 'function' ? value(prev.name) : value })),
    [setCharacter]
  );

  // ── 游戏状态（HP/SP/道具/线索） ──
  const { gameState, setGameState, applyAIStateUpdate } =
    useGameState(storyGameState, setStoryGameState);

  const reasoningContext = useMemo(() => ({
    clues: gameState.clues || [],
    inventory: gameState.inventory || [],
    quests: gameState.quests || [],
    threats: gameState.threats || [],
    locations: gameState.locations || [],
    currentLocation: gameState.location || '',
    knownEntities: gameState.knowledgeGraph?.entities || [],
    pacing: character.pacing || null,
    characterCard: setupComplete ? {
      name: character.name,
      gender: character.gender,
      age: character.age,
      identity: character.identity,
      background: character.background,
    } : null,
  }), [gameState.clues, gameState.inventory, gameState.knowledgeGraph?.entities, gameState.locations, gameState.location, gameState.quests, gameState.threats, character, setupComplete]);

  const handleReanalyzeRecords = useCallback(async () => {
    const summaryReply = findLatestSummaryReply(messages);
    if (summaryReply) {
      return applyAIStateUpdate(summaryReply.slice(-20000), {
        forceRefresh: true,
        priorityOnly: true,
      });
    }
    return {
      items: 0,
      people: 0,
      entities: 0,
      knowledgeUpdated: false,
      noSummary: true,
    };
  }, [applyAIStateUpdate, messages]);

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
  } = useAIChat({
    apiKey,
    addMessage,
    messages,
    onAIStateUpdate: applyAIStateUpdate,
    storyId: currentId,
    reasoningContext,
  });

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
  const [showSetupWizard, setShowSetupWizard] = useState(false);

  const onNewWithHook = useCallback(() => {
    newStory();
    setShowSetupWizard(true);
    pipeline.run('onStorySaved', { id: null, action: 'new' });
  }, [newStory, pipeline]);

  const handleSetupComplete = useCallback(({ storyTitle, character: char, scale: storyScale, pacing }) => {
    const title = storyTitle || `${char.name}的冒险`;
    renameStory(title);
    setCharacter((prev) => ({
      ...prev,
      name: char.name,
      stats: char.stats,
      pointLimit: char.pointLimit,
      gender: char.gender,
      age: char.age,
      identity: char.identity,
      background: char.background,
      storyTitle: title,
      storyScale,
      pacing,
      setupComplete: true,
    }));
    // 直接把角色卡信息写入开场指令（不依赖异步 reasoningContext）
    const buildIntro = (c) => {
      const p = ['[故事开场指令]'];
      p.push(`角色: ${c.name}`);
      if (c.identity) p.push(`身份: ${c.identity}`);
      if (c.gender) p.push(`性别: ${c.gender === 'male' ? '男' : c.gender === 'female' ? '女' : c.gender}`);
      if (c.age) p.push(`年龄: ${c.age}`);
      if (c.background) p.push(`游戏背景: ${c.background}`);
      p.push('');
      p.push('请为玩家撰写一段沉浸式的故事开场白：');
      p.push('以第二人称「你」开场，将玩家直接代入角色；');
      p.push('基于游戏背景描绘初始场景的细节（声音、气味、光线、氛围）；');
      p.push('引入第一个情节钩子——悬念、奇怪现象或即将到来的事件；');
      p.push('200~400字，不要请求检定，纯粹叙事；');
      p.push('结尾留出行动空间让玩家做出第一个选择。');
      return p.join('\n');
    };
    setTimeout(() => {
      if (!apiKey) return;
      addMessage({ text: '开始冒险', type: 'user', time: getTime() });
      callAI(buildIntro(char));
    }, 300);
  }, [setCharacter, renameStory, apiKey, addMessage, callAI]);

  // ── UI 开关 ──
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showInvestigation, setShowInvestigation] = useState(false);
  const [showStories, setShowStories] = useState(false);
  const [investigationTab, setInvestigationTab] = useState('reasoning');

  const openInvestigation = useCallback((tab = 'reasoning') => {
    setInvestigationTab(tab);
    setShowInvestigation(true);
  }, []);

  // ── render ──
  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <button
            className="sidebar-toggle-btn"
            onClick={() => setShowSidebar(!showSidebar)}
            title="打开冒险侧边栏"
          >
            ☰
          </button>
          <button
            className="sidebar-toggle-btn"
            onClick={() => openInvestigation('reasoning')}
            title="打开调查工作台" title="打开调查工作台" aria-label="打开调查工作台"
          >
            🕵️
          </button>
          <span className="header-icon">🐉</span>
          <h1>跑团故事机</h1>
          <span className="header-subtitle">TRPG Storyteller</span>
          <span className="header-rounds" title={`${messages.length} 条消息 / 约 ${Math.floor(messages.length / 2)} 轮对话`}>
            📝 ~{Math.floor(messages.length / 2)}轮
          </span>
        </div>
        <div className="header-right">
          <button className="settings-btn" onClick={() => setShowSettings(!showSettings)} title="API 设置" title="API 设置" aria-label="API 设置">
            ⚙️
          </button>
          <button className="clear-btn" onClick={() => setShowStories(true)} title="冒险记录" title="冒险记录" aria-label="冒险记录" title="冒险记录" title="冒险记录" aria-label="冒险记录" aria-label="冒险记录">
            📜 冒险记录
          </button>
        </div>
      </header>

      {/* 新故事引导弹窗 */}
      <StorySetupWizard
        isOpen={showSetupWizard}
        onClose={() => setShowSetupWizard(false)}
        onComplete={handleSetupComplete}
        initialStats={charStats}
        initialName={characterName}
      />

      <GameSidebar
        isOpen={showSidebar}
        readOnly={setupComplete}
        character={character}
        onClose={() => setShowSidebar(false)}
        stories={stories}
        currentId={currentId}
        onSwitchStory={switchStory}
        onDeleteStory={removeStory}
        onNewStory={onNewWithHook}
        onOpenReasoning={() => openInvestigation('reasoning')}
        stats={charStats}
        onChange={setCharStats}
        pointLimit={pointLimit}
        onPointLimitChange={setPointLimit}
        characterName={characterName}
        onCharacterNameChange={setCharacterName}
        gameState={gameState}
        setGameState={setGameState}
      />

      <InvestigationWorkspace
        isOpen={showInvestigation}
        onClose={() => setShowInvestigation(false)}
        gameState={gameState}
        setGameState={setGameState}
        activeTab={investigationTab}
        onTabChange={setInvestigationTab}
        onAnalyze={handleReanalyzeRecords}
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

      {/* 冒险记录弹窗 */}
      {showStories && (
        <div className="sidebar-overlay" onClick={() => setShowStories(false)}>
          <div className="story-modal" onClick={(e) => e.stopPropagation()}>
            <div className="sidebar-header">
              <h3>📜 冒险记录</h3>
              <button className="sidebar-close-btn" onClick={() => setShowStories(false)}>✕</button>
            </div>
            <button className="new-story-btn" onClick={() => { onNewWithHook(); setShowStories(false); }}>
              ✨ 开始新冒险
            </button>
            <div className="story-list">
              {stories.length === 0 && (
                <div className="story-empty">还没有冒险记录</div>
              )}
              {stories.map(story => (
                <div
                  key={story.id}
                  className={`story-item ${story.id === currentId ? 'story-item-active' : ''}`}
                  onClick={() => { switchStory(story.id); setShowStories(false); }}
                >
                  <div className="story-item-content">
                    <div className="story-item-title">
                      {story.id === currentId && <span className="story-active-dot">●</span>}
                      {story.title}
                      <button className="story-rename-btn" onClick={(e) => { e.stopPropagation(); const t = prompt('修改冒险名称', story.title); if (t?.trim()) renameStory(t.trim()); }} title="改名" title="改名" aria-label="修改冒险名称">✏️</button>
                    </div>
                    <div className="story-item-meta">
                      <span>{new Date(story.updatedAt).toLocaleDateString('zh-CN')}</span>
                      <span>{story.messages.length} 条消息</span>
                    </div>
                  </div>
                  <button
                    className="story-delete-btn"
                    onClick={(e) => { e.stopPropagation(); if (confirm('删除？')) removeStory(story.id); }}
                    title="删除" title="删除" aria-label="删除冒险记录"
                  >
                    🗑️
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
