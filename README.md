# 🐉 跑团助手 - TRPG Storyteller

AI 互动跑团故事机器人 — 对话叙事、骰子检定、场景配图、多存档。

## 🚀 快速开始

```bash
git clone https://github.com/CGWTF/trpg-chatbot.git
cd trpg-chatbot
npm install
npm run dev
```

打开 `http://localhost:5173`。

> **不需要 API Key 也能用**：骰子投掷 (`/r 2d6`)、规则查询 ("AC怎么算")、扮演提示 (`/rp`)、多存档管理都完全离线可用。

## ⚙️ 开启故事模式

要使用 AI 故事引擎，需要 DeepSeek API Key（[免费注册获取](https://platform.deepseek.com/)）：

1. 点右上角 ⚙️ → 输入 Key → 保存
2. 或者创建 `.env` 文件：

```env
DEEPSEEK_API_KEY=sk-xxx
```

### 图片生成 (可选)

| 引擎 | 需要 Key | 获取地址 |
|------|----------|----------|
| Pollinations.ai | ❌ 免费 | 无需注册 |
| OpenAI GPT-Image | ✅ | platform.openai.com |
| 自定义兼容 API | ✅ | 任意端点 |

在设置面板中选择引擎并填入 Key 即可。

## 📁 项目结构

```
├── server.js           # 后端 (DeepSeek 代理 + 图片代理)
├── src/
│   ├── hooks/          # usePipeline / useStoryManager / useLocalStorageState
│   ├── plugins/        # dice / rule / ai / image 四个插件
│   ├── components/     # ChatWindow / Message / CharPanel / StorySidebar
│   └── utils/          # 骰子引擎 / 图片生成 / 存档工具
└── .claude/            # /start skill + pre-commit hook
```

## 🛠️ 技术栈

React 19 + Vite / Express 5 / DeepSeek API / Vitest
