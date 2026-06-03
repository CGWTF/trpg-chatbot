# 🐉 跑团助手 - TRPG Storyteller

AI 互动跑团故事机器人 — 对话叙事、骰子检定、场景配图、多存档。

## 🚀 快速开始

```bash
npm install
npm run dev
# → http://localhost:5173
```

## ⚙️ 配置

点右上角 ⚙️，或创建 `.env`：

```env
DEEPSEEK_API_KEY=sk-xxx
```

图片 API 支持 OpenAI (gpt-image) / Pollinations (免费) / 自定义兼容端点。

## 🧱 架构

```
消息 → Pipeline → Plugin 链 → 响应
         ├─ dicePlugin   (🎲 骰子)
         ├─ rulePlugin   (📖 规则)
         ├─ imagePlugin  (🖼️ 图片)
         └─ aiPlugin     (📖 DeepSeek GM)
```

新增功能只需写一个 plugin，在 `App.jsx` 的 `staticPlugins` 里加一行。详见 [CHANGELOG.md](./CHANGELOG.md)。

## 🛠️ 技术栈

React 19 + Vite / Express 5 / DeepSeek API / Vitest
