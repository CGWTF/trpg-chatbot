# Changelog

## [Unreleased]

### 新功能

- **FastAPI NLP 知识服务** (`python_service/`)
  - `extractor.py`: 结构化 JSON + Transformers NER + 规则匹配 三层抽取
  - `graph_analysis.py`: networkx 知识图谱中心度/连通分量分析
  - `/api/knowledge/extract` 代理端点 (15s 超时 + 503 友好提示)
  - AI 回复中的 `<TRPG_REASONING>` 推理块 + `<TRPG_KNOWLEDGE>` 知识块解析
  - `npm run dev` 一键启动 server+app+nlp 三进程
- **调查工作台** (`InvestigationWorkspace.jsx`)
  - 🧠 推理板: 假设卡片、置信度滑块、支持证据/反证
  - 🕸️ 人物关系: 关系网络、关键人物排名、实体统计
  - 底部集成道具/线索/场所折叠面板
- **道具系统 + 线索日志 + 场所系统**
  - 右侧面板独立管理，AI 用粗体标记 / emoji 分区 / STATE 标签三种格式自动录入
  - 每栏可折叠 + 🗑️ 清空 + 细滚动条
  - 写穿模式持久化，切换故事不丢失
- **故事节奏控制**
  - 三幕结构系统提示词 + 轮数感知注入 (120轮节奏提示 / 200轮终章推进)
  - 页头 📝~N轮 计数器
- **布局重组**
  - 左栏固定角色面板 (属性/HP/SP/位置，不折叠)
  - 右栏调查工作台 (推理+关系+道具/线索/场所)
  - 冒险记录居中弹窗 (取代侧边栏)

### 修复

- `onStreamEnd` 回调丢失 → `sendToAI` 流结束后直接触发
- `callAI` 不设 `isProcessing(true)` → 快速检定期间输入框不禁用
- `parseAIForStateChanges` 只捕获第一个 STATE 标签 → 改用 `matchAll` 全局合并
- `scanAIForItems` 三层策略 (粗体标记 + 逐行扫描 + 自然语言兜底)，支持 AI 各种回复格式
- server.js 模板字符串反引号冲突导致服务端崩溃
- CORS 限定 localhost + SSRF 域名白名单 + XSS HTML 转义

### 架构

- **App.jsx 拆分**: `useGameState` / `useAIChat` / `useRollResolution` / `useImageSettings` 4 个 hook
- **存档层写穿模式**: React state 唯一数据源，localStorage 只写不读回
- **ESLint 双配置**: `src/**` 用 browser globals，`server.js` 用 node globals

## [0.2.0] — 2026-06-03

### 架构重构

- **Pipeline + Plugins 生命周期架构** — 消息处理从单一 `botLogic.js` 拆分为可扩展的插件管道
  - `usePipeline` — 消息管道引擎，统一 `beforeSend → onDiceRoll → onRuleQuery → fallback → afterSend` 流程
  - `dicePlugin` — 骰子投掷（`/r` 指令 + 自然语言检测）
  - `rulePlugin` — 规则知识库（D&D / CoC）+ `/help` `/rp` 指令
  - `aiPlugin` — DeepSeek 流式对话，`onBeforeAI` / `onAfterAI` 钩子
  - `imagePlugin` — 图片生成（`/image` 指令），支持 OpenAI / Pollinations / 自定义 API
- **自定义 Hooks** — `useLocalStorageState`、`useStoryManager` 抽取通用逻辑
- **静态/动态插件分离** — dice/rule/image 只创建一次，aiPlugin 按需更新

### 新功能

- **角色属性面板** — STR/DEX/CON/INT/WIS/CHA 调整值 + 快速检定按钮
- **骰子→AI 判定联动** — 投骰结果自动发送给 AI，GM 叙事判定成败
- **图片 API 自定义** — 引擎下拉切换、模型/尺寸可配、GPT-Image b64_json 支持
- **多存档管理** — localStorage 持久化，侧边栏切换/删除
- **`/start` Skill** — `.claude/skills/start.md` 一键启动
- **Pre-commit Hook** — `.claude/settings.json` 提交前自动跑 `npm test`

### 修复

- 图片引擎名称写死 Pollinations → 动态读取配置
- blob URL 刷新失效 → 保存时自动清理
- GPT-Image 返回 `b64_json` 而非 `url` → 双格式兼容
- aiPlugin 依赖 `messages` 导致频繁重建 → 改用闭包

## [0.1.0] — 2026-06-03

### 初始版本

- Vite + React 19 前端，Express 5 后端代理
- DeepSeek API 流式对话（GM 人设系统提示词）
- 骰子投掷 `/r 2d6+1`，快速骰子按钮
- D&D / CoC 规则知识库离线查询
- Pollinations.ai 免费图片生成
- 暗色奇幻主题 UI
