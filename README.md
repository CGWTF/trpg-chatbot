# 🐉 跑团故事机 - TRPG Storyteller

AI 互动跑团故事机器人 — 对话叙事、骰子检定、场景配图、多存档。

## 🚀 快速开始

```bash
git clone https://github.com/CGWTF/trpg-chatbot.git
cd trpg-chatbot
npm install
npm run dev
```

打开 `http://localhost:5173`。

### NLP 人物关系图（可选）

人物、地点和关系抽取由独立 Python 服务负责。默认使用结构化知识块与规则抽取；
配置 Transformers 模型后会额外使用 NER 模型。

```bash
python -m venv .venv
.venv\Scripts\pip install -r python_service\requirements.txt
npm run dev:full
```

启用 Transformers NER：

```bash
.venv\Scripts\pip install -r python_service\requirements-model.txt
```

然后在 `.env` 中设置 `NLP_MODEL_NAME`。NetworkX 会分析关系图的中心人物、连通分量与孤立实体。
当前不会默认引入向量数据库；当实体与关系总量达到配置阈值时，界面才会提示考虑 Embedding 检索。

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
AI 回复检定请求（【检定请求：DEX，DC12】）  +  自动记录道具/线索/场所
  ↓
紫色横幅 + 快速检定按钮高亮 → 点击投骰 → 分级标签
  ↓
AI 根据检定结果叙事，道具/线索/场所自动录入右侧面板
```

## 🧭 界面布局

| 入口 | 内容 |
|------|------|
| ☰ 左栏 | 角色名、六维属性加点、HP/SP 血条、当前位置 |
| 🕵️ 右栏 | 调查工作台：推理板 + 人物关系 + 道具/线索/场所 |
| 📜 冒险记录 | 居中弹窗：存档列表、切换、删除、新冒险 |
| 输入框上方 | 紫色检定横幅 + 快速检定(带属性加值) + 快速投骰 |

## 📁 项目结构

```
├── server.js              # Express 后端 (DeepSeek 代理 + 图片代理 + NLP 代理)
├── src/
│   ├── hooks/             # useAIChat / useGameState / useStoryManager / usePipeline ...
│   ├── plugins/           # dice / rule / ai / image 四个插件
│   ├── components/        # ChatWindow / GameSidebar / InvestigationWorkspace ...
│   └── utils/             # 骰子 / 检定上下文 / 知识API / 启发式扫描 / 存档
├── python_service/        # FastAPI NLP 服务
│   ├── app.py             # /extract 端点 + 知识图谱合并
│   ├── extractor.py       # 结构化 + NER模型 + 规则匹配 三层抽取
│   └── graph_analysis.py  # NetworkX 中心度/连通分量分析
└── .claude/               # settings + skills
```

## 🛠️ 技术栈

React 19 + Vite / Express 5 / DeepSeek API / FastAPI + NetworkX / Vitest
