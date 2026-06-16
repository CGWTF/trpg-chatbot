# Changelog

## [Unreleased]

### 证据板升级
- **自定义节点** — 带Handle连接点的彩色卡片，支持四向拖线
- **连线重连** — 拖拽端点切换目标
- **自动保存** — 画布状态持久化到 gameState，刷新不丢失
- **旧数据迁移** — normalizeBoardNodes 兼容旧格式

### 图像引擎默认值
- `useImageSettings` 默认 model: gpt-image-2, size: auto, quality: medium

### 界面
- `GameSidebar` 重构 — `CharacterField` 组件化，主线任务列表
- ESLint 忽略 `.venv`/`.pytest_cache`/`python_service/**/__pycache__`

## [0.3.0] — 2026-06-13

### 新功能

- **新故事引导弹窗** — 角色卡(姓名/性别/年龄/身份/背景) + 属性加点 + 故事规模选择(小150/中220/大300轮)
- **TRPG_EVENTS 统一事件块** — 替代不可靠的粗体标记，JSON结构化格式(snapshot/delta模式)
- **调查工作台** — 推理板(假设卡片+置信度滑块) + 人物关系(实体点击选中+类型标签+关联关系) + 拖拽证据板
- **证据板(React Flow)** — 环形布局(我→线索→人物/地点→道具)、🧬合成图谱(自动连线)、手动拖拽连线
- **道具/线索/场所系统** — 右侧折叠面板、清空按钮、滚动条、12/8上限、NLP知识图谱关联
- **右侧折叠角色面板** — 角色名/属性/HP-SP/位置 + 主线任务列表
- **塞尔达·海拉鲁主题皮肤** — 深蓝金配色、自定义背景图、半透明毛玻璃、希卡风格装饰
- **FastAPI NLP 知识服务** — 结构化JSON + Transformers NER + 规则匹配三层抽取 + NetworkX图分析
- **故事节奏四档控制** — 150/200/280/350轮分级提示，按故事规模自适应
- **存档备份/导入** — JSON导出下载 + 文件上传恢复 + 写入失败红色横幅
- **冒险记录弹窗** — 可改名(✏️)、可删除(🗑️)、居中展示
- **Humanizer-zh 去AI化** — 系统提示词注入反AI高频词规则
- **web-design-guidelines 合规** — transition去all、outline加focus-visible、aria-label全覆盖、color-scheme:dark
- **narrative-director + writer agent** — 故事架构/NPC设计/场景写作辅助

### 架构

- **useGameState 独立** — HP/道具/线索/场所/知识图谱从useAIChat中拆分
- **存档层写穿模式** — React state唯一数据源，localStorage只写不读回
- **normalizeGameState** — 旧数据格式安全迁移

### 修复

- onStreamEnd回调丢失 → sendToAI流结束后直接触发
- parseAIForStateChanges只捕获第一个STATE标签 → matchAll全局合并
- scanAIForItems三层策略(TRPG_STATE JSON→emoji分区→自然语言兜底)
- server.js模板字符串反引号语法错误 → 服务端崩溃
- 线索提取取描述侧 → '冒牌哈桑'→'接头人被调包'
- 未识别分区标题(⏳/💡)误入内容
- CORS限定localhost + SSRF域名白名单 + XSS HTML转义
- ESLint拆分配置(browser/node globals)

## [0.2.0] — 2026-06-03

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
