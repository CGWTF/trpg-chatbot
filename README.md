# 🐉 跑团故事机 - TRPG Storyteller

AI 互动跑团故事机器人 — 对话叙事、骰子检定、场景配图、多存档、NLP 知识图谱。

## 🚀 快速开始

### 你只需要 VS Code 和 Node.js

如果还没装 Node.js：去 [nodejs.org](https://nodejs.org) 下载 LTS 版，安装后重启 VS Code。

```bash
# 1. 克隆项目（VS Code 终端 Ctrl+`）
git clone https://github.com/CGWTF/trpg-chatbot.git
cd trpg-chatbot

# 2. 安装依赖
npm install

# 3. 启动（前端 + 后端，无需 Python）
npm run dev
```

浏览器打开 `http://localhost:5173`，点右上角 ⚙️ 填入 [DeepSeek API Key](https://platform.deepseek.com/)，然后点 📜 创建角色卡——AI 自动生成专属开场白。

### 可选：NLP 人物关系图

需要 Python 3.10+。装了 Python 后：

```bash
pip install -r python_service/requirements.txt
npm run dev:full     # 三进程：前端 + 后端 + NLP
```

没装 Python → 去 [python.org](https://www.python.org/downloads/) 下载，安装时**勾选 "Add Python to PATH"**。

> 骰子投掷、规则查询、多存档离线可用。故事模式需要 [DeepSeek API Key](https://platform.deepseek.com/)。

## 🎲 游戏流程

```
📜 创建角色 → 选择故事规模 → AI生成专属开场白
  ↓
描述动作 → AI请求检定 → 投骰 → AI根据结果叙事
  ↓
道具/线索/场所自动记录 → 🕵️调查工作台整理推理
```

## 🧭 界面

| 入口 | 内容 |
|------|------|
| 🎮 左栏 | 角色信息、属性、HP/SP、主线任务 |
| 🕵️ 右栏 | 调查工作台：推理板 + 人物关系 + 证据板(拖拽连线) + 道具/线索/场所 |
| 📜 冒险记录 | 居中弹窗：存档列表、重命名、导出/导入备份 |
| 输入框 | 紫色检定横幅 + 快速检定(7属性) + 快速投骰 |

## 📁 项目结构

```
├── server.js              # Express (DeepSeek + 图片 + NLP代理)
├── src/
│   ├── hooks/             # useAIChat/useGameState/useStoryManager/usePipeline...
│   ├── plugins/           # dice/rule/ai/image
│   ├── components/        # ChatWindow/GameSidebar/InvestigationWorkspace/EvidenceBoard...
│   └── utils/             # 骰子/检定上下文/知识API/启发式扫描/存档
├── python_service/        # FastAPI NLP
│   ├── extractor.py       # 结构化+NLP模型+规则 三层抽取
│   └── graph_analysis.py  # NetworkX 中心度分析
├── public/                # 静态资源(背景图等)
└── .claude/               # skills + agents + rules
```

## 🛠️ 技术栈

React 19 + Vite / Express 5 / DeepSeek API / FastAPI + NetworkX / React Flow / Vitest

### Claude Code Skills

| Skill | 用途 |
|-------|------|
| `web-design-guidelines` | 可访问性审计 |
| `taste-redesign` | UI设计品质升级 |
| `humanizer-zh` | 中文去AI写作痕迹 |
| `narrative-director` | 故事架构设计 |
| `writer` | 场景/NPC写作 |
