import { useState, useCallback, useRef, useEffect } from 'react';
import ChatWindow from './components/ChatWindow';
import ChatInput from './components/ChatInput';
import StorySidebar from './components/StorySidebar';
import CharPanel from './components/CharPanel';
import { processMessage } from './utils/botLogic';
import { rollDice, formatDiceResult } from './utils/dice';
import { generateImageUrl, enhancePrompt, fetchGeneratedImage } from './utils/imageGen';
import {
  getAllStories,
  getCurrentStoryId,
  createStory,
  saveStory,
  deleteStory,
  switchToStory,
  getImageConfig,
  saveImageConfig,
} from './utils/storage';
import './App.css';

const API_URL = 'http://localhost:3001/api/chat';

function getTime() {
  const now = new Date();
  return now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
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
  // 初始化：从 localStorage 恢复故事
  const [stories, setStories] = useState(() => getAllStories());
  const [currentStoryId, setCurrentStoryIdState] = useState(() => getCurrentStoryId());

  // 获取当前故事，如果不存在则创建新的
  const getInitialMessages = () => {
    if (currentStoryId) {
      const stories = getAllStories();
      const found = stories.find(s => s.id === currentStoryId);
      if (found) return found.messages;
    }
    const newStory = createStory(WELCOME_MSG);
    setCurrentStoryIdState(newStory.id);
    setStories(getAllStories());
    return newStory.messages;
  };

  const [messages, setMessages] = useState(getInitialMessages);
  const [characterName, setCharacterName] = useState('冒险者');
  const [isProcessing, setIsProcessing] = useState(false);
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('trpg_deepseek_key') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showCharPanel, setShowCharPanel] = useState(false);
  const [imageConfig, setImageConfigState] = useState(getImageConfig);
  const [charStats, setCharStats] = useState(() => {
    try { return JSON.parse(localStorage.getItem('trpg_char_stats')) || { STR:0,DEX:0,CON:0,INT:0,WIS:0,CHA:0 }; }
    catch { return { STR:0,DEX:0,CON:0,INT:0,WIS:0,CHA:0 }; }
  });
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef(null);

  // 自动保存：消息变化时存入 localStorage
  useEffect(() => {
    if (currentStoryId && messages.length > 0) {
      saveStory(currentStoryId, messages);
      setStories(getAllStories());
    }
  }, [messages, currentStoryId]);

  const addMessage = useCallback((msg) => {
    setMessages(prev => [...prev, msg]);
  }, []);

  // ========== 故事管理 ==========
  const handleNewStory = () => {
    const newStory = createStory(WELCOME_MSG);
    setCurrentStoryIdState(newStory.id);
    setMessages(newStory.messages);
    setStories(getAllStories());
  };

  const handleSwitchStory = (id) => {
    const story = switchToStory(id);
    if (story) {
      setCurrentStoryIdState(id);
      setMessages(story.messages);
    }
  };

  const handleDeleteStory = (id) => {
    deleteStory(id);
    setStories(getAllStories());

    if (id === currentStoryId) {
      // 删了当前故事，自动创建新的
      const newStory = createStory(WELCOME_MSG);
      setCurrentStoryIdState(newStory.id);
      setMessages(newStory.messages);
      setStories(getAllStories());
    }
  };

  const handleSaveApiKey = () => {
    localStorage.setItem('trpg_deepseek_key', apiKey);
    setShowSettings(false);
  };

  // ========== 角色属性 ==========
  const handleCharStatsChange = (stats) => {
    setCharStats(stats);
    localStorage.setItem('trpg_char_stats', JSON.stringify(stats));
  };

  // ========== 图片生成处理 ==========
  const handleImageGenerate = useCallback((imageData) => {
    setMessages(prev => {
      const updated = [...prev];
      const idx = imageData.messageIndex;
      if (idx >= 0 && idx < updated.length) {
        updated[idx] = {
          ...updated[idx],
          image: {
            url: imageData.url,
            prompt: imageData.prompt,
            engine: imageData.engine || 'Pollinations.ai (Flux)',
          },
        };
      }
      return updated;
    });
  }, []);

  const handleImageCommand = useCallback(async (prompt) => {
    const enhanced = enhancePrompt(prompt);

    try {
      const blobUrl = await fetchGeneratedImage(enhanced);
      addMessage({
        text: `🖼️ **场景配图**\n\n${prompt}`,
        type: 'bot',
        time: getTime(),
        image: {
          url: blobUrl,
          prompt: enhanced,
          engine: imageConfig.provider === 'pollinations' ? 'Pollinations.ai' : imageConfig.provider,
        },
      });
    } catch (err) {
      addMessage({
        text: `❌ 图片生成失败: ${err.message}`,
        type: 'system',
        time: getTime(),
      });
    }

    setIsProcessing(false);
  }, [addMessage, imageConfig]);

  // ========== AI 故事引擎 (流式) ==========
  const callStoryAI = useCallback(async (userText) => {
    if (!apiKey) {
      addMessage({
        text: '⚠️ **需要设置 API Key 才能使用故事模式！**\n\n请点击右上角的 ⚙️ 设置按钮，输入你的 DeepSeek API Key。\n\n💡 你仍然可以使用骰子 `/r` 和规则查询功能。',
        type: 'system',
        time: getTime(),
      });
      setIsProcessing(false);
      return;
    }

    setIsStreaming(true);
    setStreamingText('');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const chatMessages = messages
        .filter(m => m.type === 'user' || m.type === 'bot')
        .map(m => ({ type: m.type === 'user' ? 'user' : 'assistant', text: m.text }));

      chatMessages.push({ type: 'user', text: userText });

      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatMessages, apiKey }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: '未知错误' }));
        addMessage({
          text: `❌ ${err.error || `请求失败 (${response.status})`}`,
          type: 'system',
          time: getTime(),
        });
        setIsStreaming(false);
        setIsProcessing(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        fullText += chunk;
        setStreamingText(fullText);
      }

      addMessage({
        text: fullText || '(AI 没有返回内容)',
        type: 'bot',
        time: getTime(),
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        if (streamingText) {
          addMessage({
            text: streamingText + '\n\n*(已中断)*',
            type: 'bot',
            time: getTime(),
          });
        }
      } else {
        addMessage({
          text: `❌ 故事引擎连接失败: ${err.message}\n\n请确保后端服务已启动: \`node server.js\``,
          type: 'system',
          time: getTime(),
        });
      }
    }

    setIsStreaming(false);
    setStreamingText('');
    abortRef.current = null;
    setIsProcessing(false);
  }, [messages, apiKey, addMessage]);

  // ========== 快速检定 + AI 判定 ==========
  const handleQuickRoll = useCallback((check) => {
    const mod = charStats[check.stat] || 0;
    const notation = `1d20${mod >= 0 ? '+' : ''}${mod}`;
    const result = rollDice(notation);
    const diceText = formatDiceResult(result);

    addMessage({ text: diceText, type: 'dice', time: getTime() });

    if (apiKey) {
      const contextMsg = `🎲 我进行了**${check.desc}**：${diceText}\n\n请根据这个检定结果，在故事中描述接下来发生了什么。`;
      addMessage({ text: contextMsg, type: 'user', time: getTime() });
      setIsProcessing(true);
      callStoryAI(contextMsg);
    } else {
      setIsProcessing(false);
    }
  }, [charStats, apiKey, addMessage, callStoryAI]);

  // ========== 发送消息 ==========
  const handleSend = useCallback((text) => {
    if (text === '/clear') {
      handleNewStory();
      return;
    }

    if (abortRef.current) {
      abortRef.current.abort();
    }

    // /image 指令
    if (text.startsWith('/image') || text.startsWith('/img')) {
      const prompt = text.replace(/^\/(image|img)\s*/, '').trim();
      if (!prompt) {
        addMessage({ text: '请提供图片描述，如: `/image 一座黑暗的古堡坐落在悬崖边`', type: 'system', time: getTime() });
        setIsProcessing(false);
        return;
      }
      addMessage({ text, type: 'user', time: getTime() });
      setIsProcessing(true);
      handleImageCommand(prompt);
      return;
    }

    addMessage({ text, type: 'user', time: getTime() });
    setIsProcessing(true);

    const { result, useAI } = processMessage(text, characterName, !!apiKey);

    if (useAI) {
      callStoryAI(text);
    } else if (result) {
      addMessage({ ...result, time: getTime() });

      // 骰子结果 → 发给 AI 做叙事判定
      if (result.type === 'dice' && apiKey) {
        const contextMsg = `🎲 我进行了检定：${text}\n\n检定结果：${result.text}\n\n请根据这个结果，在故事中描述接下来发生了什么（成功或失败，推进剧情）。`;
        setTimeout(() => {
          addMessage({ text: contextMsg, type: 'user', time: getTime() });
          callStoryAI(contextMsg);
        }, 300);
      } else {
        setIsProcessing(false);
      }
    }
  }, [addMessage, characterName, apiKey, callStoryAI, handleImageCommand, handleNewStory]);

  return (
    <div className="app">
      {/* 侧边栏 */}
      <StorySidebar
        stories={stories}
        currentId={currentStoryId}
        onSwitch={handleSwitchStory}
        onDelete={handleDeleteStory}
        onNew={handleNewStory}
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
          <h1>跑团助手</h1>
          <span className="header-subtitle">TRPG Storyteller</span>
        </div>
        <div className="header-right">
          <label className="character-name-label">
            🧑 角色名:
            <input
              type="text"
              className="character-name-input"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value || '冒险者')}
              maxLength={20}
              placeholder="冒险者"
            />
          </label>
          <button
            className="settings-btn"
            onClick={() => setShowSettings(!showSettings)}
            title="API 设置"
          >
            ⚙️
          </button>
          <button
            className="clear-btn"
            onClick={handleNewStory}
            title="开始新冒险"
          >
            ✨ 新冒险
          </button>
        </div>
      </header>

      {/* 角色属性面板 */}
      <CharPanel
        stats={charStats}
        onChange={handleCharStatsChange}
        onQuickRoll={handleQuickRoll}
        isOpen={showCharPanel}
        onToggle={() => setShowCharPanel(!showCharPanel)}
      />

      {/* 设置面板 */}
      {showSettings && (
        <div className="settings-panel">
          <div className="settings-content">
            {/* 对话 API */}
            <h3>💬 对话 API (DeepSeek)</h3>
            <div className="settings-input-row">
              <input
                type="password"
                className="api-key-input"
                placeholder="sk-... DeepSeek API Key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
              />
              <button className="settings-save-btn" onClick={handleSaveApiKey}>
                💾 保存
              </button>
            </div>
            <p className="settings-hint">
              获取: <a href="https://platform.deepseek.com/" target="_blank" rel="noopener noreferrer">platform.deepseek.com</a>
              {apiKey && ' ✅'}
            </p>

            <hr className="settings-divider" />

            {/* 图片 API */}
            <h3>🖼️ 图片生成 API</h3>
            <div className="settings-field">
              <label>引擎:</label>
              <select
                className="settings-select"
                value={imageConfig.provider}
                onChange={(e) => {
                  const c = { ...imageConfig, provider: e.target.value };
                  setImageConfigState(c);
                  saveImageConfig(c);
                }}
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
                    onChange={(e) => {
                      const c = { ...imageConfig, apiKey: e.target.value };
                      setImageConfigState(c);
                      saveImageConfig(c);
                    }}
                  />
                </div>
                <div className="settings-input-row" style={{ marginTop: 6, gap: 6 }}>
                  {imageConfig.provider === 'custom' && (
                    <input
                      type="text"
                      className="api-key-input"
                      placeholder="Base URL"
                      value={imageConfig.baseUrl}
                      onChange={(e) => {
                        const c = { ...imageConfig, baseUrl: e.target.value };
                        setImageConfigState(c);
                        saveImageConfig(c);
                      }}
                      style={{ flex: 2 }}
                    />
                  )}
                  <input
                    type="text"
                    className="api-key-input"
                    placeholder="模型 (dall-e-3)"
                    value={imageConfig.model}
                    onChange={(e) => {
                      const c = { ...imageConfig, model: e.target.value };
                      setImageConfigState(c);
                      saveImageConfig(c);
                    }}
                    style={{ flex: 1, maxWidth: imageConfig.provider === 'custom' ? 140 : 200 }}
                  />
                  <input
                    type="text"
                    className="api-key-input"
                    placeholder="尺寸 (1024x1024)"
                    value={imageConfig.size}
                    onChange={(e) => {
                      const c = { ...imageConfig, size: e.target.value };
                      setImageConfigState(c);
                      saveImageConfig(c);
                    }}
                    style={{ flex: 1, maxWidth: 140 }}
                  />
                </div>
              </>
            )}
            <p className="settings-hint">
              {imageConfig.provider === 'pollinations' && '免费引擎，无需 Key，但可能限流。'}
              {imageConfig.provider === 'openai' && (
                <>获取: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">platform.openai.com</a> | dall-e-3: 1024x1024/1792x1024 | dall-e-2: 1024x1024/512x512/256x256</>
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
        <ChatInput onSend={handleSend} disabled={isProcessing} />
      </footer>
    </div>
  );
}
