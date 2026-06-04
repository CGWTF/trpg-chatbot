# Changelog

## [Unreleased]

### 新功能

- **AI 检定请求 → 快速检定 → 结果叙事 完整闭环**
  - AI 描述玩家动作时自动请求检定（`【检定请求：STAT，DCn】`），不再直接叙事
  - 输入框上方显示紫色检定横幅 + 对应属性按钮高亮发光
  - 点击快速检定按钮 → 骰子结果附带分级标签（🌟大成功 / ✅成功 / ❌失败等）
  - 检定结果自动发送给 AI，GM 严格按结果叙事
- **快速检定按钮移至输入框上方** — 从角色面板移到 ChatInput，AI 请求检定时对应按钮高亮
- **`injectCheckReminder`** — 服务端自动在玩家消息中注入检定指令，解决 DeepSeek 忽略提示词的问题
- **调试日志** — AI 回复不含检定请求时浏览器控制台 warn

### 修复

- `handleQuickRoll` 技能名用 `check.desc` 导致重复属性名 → 改为 `pendingRollRequest.skill`
- 点击属性不匹配的检定按钮仍使用 AI 的 DC → 属性不匹配时 `dc=null`
- 修正值为 0 时显示 `1d20+0` → 改为 `1d20`
- `callAI` 闭包过期导致消息历史缺失 → 支持传入最新消息列表
- `/r d20` 纯骰子不包含角色属性加值 → 有待处理请求时自动应用修正值
- `parseAIForRollRequest` 正则健壮性 → 双正则 + 末尾标点清理
- `dicePlugin` 返回 `_rawResult` 供分级判定
- `aiPlugin` 的 `onStreamEnd` 传递完整回复文本

### 改进

- 系统提示词重写：检定机制置顶、从"可以"改为"必须"、增加 few-shot 示例
- `temperature` 从 0.8 降至 0.7，提高输出一致性
- 检定请求标签和结果块在消息中紫色高亮显示
- 角色面板去除快速检定区域（已移至 ChatInput）

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
