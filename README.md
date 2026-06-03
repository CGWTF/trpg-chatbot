# 🐉 跑团助手 - TRPG Storyteller

一个基于 AI 的互动跑团故事机器人，支持对话叙事、骰子检定、场景配图和多存档管理。

## ✨ 功能

- **📖 AI 互动故事** — DeepSeek 驱动的 GM，通过对话带领你进行冒险
- **🎲 骰子判定系统** — 角色属性面板 + 快速检定按钮，投骰结果自动发给 AI 判定成败
- **🖼️ 场景配图** — 一键为 GM 描述生成场景插图（支持 OpenAI / Pollinations / 自定义 API）
- **📖 规则知识库** — 离线查询 D&D / CoC 常用规则
- **📜 多存档管理** — 保存多个冒险记录，随时切换
- **🎭 扮演提示** — 随机 RP 灵感

## 🚀 快速开始

```bash
npm install
npm run dev
```

打开 `http://localhost:5173`

## ⚙️ 配置

点右上角 ⚙️ 设置，或创建 `.env` 文件：

```env
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_MODEL=deepseek-chat
```

## 📁 项目结构

```
├── server.js                # 后端代理 (DeepSeek + 图片)
├── src/
│   ├── App.jsx              # 主应用
│   ├── components/
│   │   ├── ChatWindow.jsx   # 聊天窗口
│   │   ├── ChatInput.jsx    # 输入 + 骰子
│   │   ├── Message.jsx      # 消息气泡 + 图片
│   │   ├── CharPanel.jsx    # 角色属性面板
│   │   └── StorySidebar.jsx # 故事存档侧栏
│   └── utils/
│       ├── dice.js          # 骰子引擎
│       ├── botLogic.js      # 指令/规则/故事路由
│       ├── imageGen.js      # 图片生成
│       └── storage.js       # 存档管理
└── package.json
```

## 🛠️ 技术栈

React 19 + Vite / Express 5 / DeepSeek API / OpenAI GPT-Image / localStorage
