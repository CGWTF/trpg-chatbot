# Changelog

## [Unreleased]

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
