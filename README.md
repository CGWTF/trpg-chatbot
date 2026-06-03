# 🐉 跑团助手 - TRPG Storyteller

基于 AI 的互动跑团故事机器人，支持对话叙事、骰子检定、场景配图和多存档管理。

## ✨ 功能

- **📖 AI 互动故事** — DeepSeek 驱动的 GM，通过对话带领冒险
- **🎲 骰子判定系统** — 角色属性面板 + 快速检定，投骰结果自动发给 AI 判定
- **🖼️ 场景配图** — GM 描述一键生成插图（OpenAI / Pollinations / 自定义 API）
- **📖 规则知识库** — 离线查询 D&D / CoC 常用规则
- **📜 多存档管理** — 保存多个冒险记录，随时切换
- **🎭 扮演提示** — `/rp` 随机 RP 灵感
- **🛠️ Skill & Hook** — `/start` 一键启动 + pre-commit 自动测试

## 🚀 快速开始

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`

## ⚙️ 配置

点右上角 ⚙️ 设置面板，或创建 `.env`：

```env
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_MODEL=deepseek-chat
```

### 图片 API

| 引擎 | 需要 Key | 说明 |
|------|----------|------|
| Pollinations.ai | ❌ | 免费，可能限流 |
| OpenAI (gpt-image-1/2) | ✅ | 稳定 |
| 自定义 (OpenAI 兼容) | ✅ | 任意 `/v1/images/generations` 端点 |

## 🧱 架构

```
消息 → Pipeline → Plugin 链 → 响应
         │
         ├─ beforeSend  (dice / rule / image 拦截指令)
         ├─ onDiceRoll  (自然语言投骰)
         ├─ onRuleQuery (规则知识库)
         ├─ fallback    (AI 对话)
         ├─ onBeforeAI / onAfterAI
         └─ afterSend   (副作用回调)
```

## 📁 项目结构

```
├── server.js                  # 后端代理 (DeepSeek 流式 + 图片多引擎)
├── .claude/
│   ├── settings.json          # pre-commit hook (自动测试)
│   └── skills/start.md        # /start skill
├── src/
│   ├── App.jsx                # UI 组合
│   ├── App.css                # 暗色奇幻主题
│   ├── hooks/
│   │   ├── usePipeline.js     # 消息管道引擎
│   │   ├── useStoryManager.js # 故事存档管理
│   │   └── useLocalStorageState.js  # localStorage 状态
│   ├── plugins/
│   │   ├── dicePlugin.js      # 🎲 骰子
│   │   ├── rulePlugin.js      # 📖 规则
│   │   ├── aiPlugin.js        # 📖 AI 故事
│   │   └── imagePlugin.js     # 🖼️ 图片
│   ├── components/
│   │   ├── ChatWindow.jsx     # 聊天窗口 + 流式
│   │   ├── ChatInput.jsx      # 输入 + 快速骰子
│   │   ├── Message.jsx        # 消息气泡 + 配图
│   │   ├── CharPanel.jsx      # 角色属性面板
│   │   └── StorySidebar.jsx   # 故事存档侧栏
│   └── utils/
│       ├── dice.js            # 骰子引擎
│       ├── botLogic.js        # (遗留，已迁移到 plugins)
│       ├── imageGen.js        # 图片生成客户端
│       └── storage.js         # localStorage 工具
└── __tests__/dice.test.js     # 11 个单元测试
```

## 🛠️ 技术栈

React 19 + Vite / Express 5 / DeepSeek API / OpenAI GPT-Image / Vitest / localStorage

## 🔌 扩展

新增功能只需创建 plugin：

```js
// src/plugins/musicPlugin.js
export default function createMusicPlugin() {
  return {
    name: 'music',
    beforeSend(input) {
      if (input.startsWith('/music ')) {
        return { result: { text: '🎵', type: 'bot', source: 'music' } };
      }
      return input;
    },
  };
}
```

然后在 `App.jsx` 的 `staticPlugins` 数组加一行即可。
