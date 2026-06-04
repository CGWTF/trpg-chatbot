# 🐉 跑团游戏机 - TRPG Storyteller

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

## 🎲 游戏流程

```
玩家描述动作（"我试着悄悄穿过走廊"）
  ↓
AI 回复检定请求（【检定请求：DEX，DC12】请投一个d20进行潜行检定）
  ↓
输入框上方出现紫色横幅 + 快速检定按钮高亮
  ↓
点击高亮按钮 → 骰子投掷 + 分级标签（🌟大成功 / ✅成功 / ❌失败 / 💀大失败）
  ↓
AI 根据检定结果叙事
```

- **快速检定按钮**：输入框上方，显示角色属性加值，AI 请求检定时对应按钮发光
- **快速投骰按钮**：通用骰子（d20/d100/2d6 等），不含属性修正
- **角色属性面板**：右上角 📋 展开，可分配属性加值

## 📁 项目结构

```
├── server.js           # 后端 (DeepSeek 代理 + 图片代理)
├── src/
│   ├── hooks/          # usePipeline / useStoryManager / useLocalStorageState
│   ├── plugins/        # dice / rule / ai / image 四个插件
│   ├── components/     # ChatWindow / Message / CharPanel / StorySidebar
│   └── utils/          # 骰子引擎 / 检定上下文 / 图片生成 / 存档工具
└── .claude/            # /start skill + pre-commit hook
```

## 🛠️ 技术栈

React 19 + Vite / Express 5 / DeepSeek API / Vitest
