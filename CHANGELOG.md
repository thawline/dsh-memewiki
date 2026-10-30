# Changelog

## 0.1.0 — 2026-10-30

首个版本。从 [in1t1a1/astrbot_plugin_memewiki](https://github.com/in1t1a1/astrbot_plugin_memewiki)（AstrBot 插件）移植到 DSH。

### 来源

- 词库：原版 `data/memes.db`（6668 条，2026-10-26 构建，数据整理自 cnmeme.wiki）
- 设计：原文的预查注入思路、接梗规则、像梗判断（问梗句式 / 裸词 / 停用词）、`search_meme_wiki` 工具

### 新增

- 插件外壳重写为 Node.js ESM 模块，支持 DSH 的 `dsh.bundle.patch` / `dsh.client` 机制
- 词库读取改用 Node 22.13+ 自带的 `node:sqlite`，零依赖
- 预查注入改走 `ctx.systemPrompt.context()`（order 950，仅当轮上下文）
- **设置页「梗百科」**：词条列表、搜索、增删改、本机词条总数
- **「自动思考梗」开关**：设置页勾选，写入 `~/.dsh/memewiki.json`，下一轮生效
- **双向匹配**：新增「标题包含查询词」一层（查询 ≥ 3 字时启用），解决短查询查不到长标题

### 移除

- 联网兜底（cnmeme.wiki 公开 API）——避免把用户聊天片段发往第三方，同时去掉网络超时/节流/缓存路径
- `/梗` 图片卡片（Pillow 渲染）
- `/黑话` 命令（由设置页的新增词条替代）
- AstrBot WebUI 面板

### 未变

- 词库内容、`memes` 表结构
- 接梗规则文案与「先接梗别科普」的注入策略
- 只在「像在问梗」时触发预查
