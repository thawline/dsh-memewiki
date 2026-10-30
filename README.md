# dsh-memewiki

给 [DSH](https://dsh.deepseek.com) 用的**梗百科 / 黑话词典**插件。移植自 AstrBot 插件 [`astrbot_plugin_memewiki`](https://github.com/in1t1a1/astrbot_plugin_memewiki)。

内置 6668 条网络梗词条，离线可用，不联网、不写文件、零依赖（只用 Node 自带的 `node:sqlite`）。

当你问一句「XX 是什么梗」时，它会在模型看到这句话**之前**就把对应词条查好塞进上下文，让模型直接接梗；同时提供一个 `search_meme_wiki` 工具，让模型自己想查的时候也能查。

## 特性

- **预查注入**：只对「像在问梗」的消息触发（问梗句式、裸词、停用词过滤），闲聊不会被塞东西。
- **一条都不多**：没命中就不注入，命中只注入那一条。
- **设置页可管**：DSH 设置 → 插件 → 梗百科 里能查、增、改、删词条，能看到本机词条总数。
- **自动思考梗开关**：不想让它自动预查时，一个勾选框关掉即可，下一轮生效。
- **双向匹配**：除了「问句里包含标题」，还支持「标题里包含查询词」（查询 ≥ 3 字才启用，避免两个字乱中）。
- **离线**：不发任何网络请求。

## 安装

在 DSH 的 `profiles/desktop` 目录下：

```bash
pnpm add dsh-memewiki
```

（或把本仓库 `link:` 进 profile，参考 DSH 插件开发文档。）

放入 `package.json` 的 `dsh.profile.bundles`，重启 DSH。

## 配置

配置文件：`~/.dsh/memewiki.json`

```json
{ "自动思考梗": true }
```

- `自动思考梗`：是否在每轮请求前自动查词库并注入。默认 `true`。

## 词条数据

`data/memes.db` 是 SQLite 数据库，表结构：

```sql
CREATE TABLE memes (
  title   TEXT PRIMARY KEY,  -- 词条名
  slug    TEXT,              -- 拼音/英文别名
  tags    TEXT,              -- 标签，逗号分隔
  usage   TEXT,              -- 怎么用 / 怎么接
  origin  TEXT,              -- 出处
  other   TEXT,
  summary TEXT               -- 释义
);
```

词库来自原版插件的 `data/memes.db`（6668 条，构建于 2026-10-26），原数据由 [cnmeme.wiki](https://cnmeme.wiki) 整理。

## 与原版的差异

本插件是**重构移植**，不是逐行翻译。AstrBot 是 Python 的 Star 插件框架，DSH 是 Node.js 的插件体系，外壳必须重写；词库、匹配逻辑、预查闸门、注入文案沿用原版的设计。

| 能力 | 原版 `astrbot_plugin_memewiki` | 本插件 `dsh-memewiki` |
| --- | --- | --- |
| 运行环境 | AstrBot（Python） | DSH（Node.js，ESM，零依赖） |
| 词库读取 | SQLite（`sqlite3`） | `node:sqlite`（Node ≥ 22.13 自带） |
| 预查注入点 | `@filter.on_llm_request` → `_append_temp` | `ctx.systemPrompt.context()`（order 950，仅该轮） |
| 注入内容 | 接梗规则 + 命中词条 | 相同设计（规则约 750 字符 + 一条词条） |
| 查询工具 | `search_meme_wiki` | 同名工具，参数 `{ query }` |
| 匹配方式 | 精确 + 查询词包含标题 | 精确 + 查询词包含标题 + **标题包含查询词（≥3 字）** |
| 注入开关 | 配置项 | **设置页「自动思考梗」勾选框**（写 `~/.dsh/memewiki.json`） |
| 词条管理 | AstrBot WebUI 面板 + `/黑话` 命令 | **DSH 设置页「梗百科」**（增删改查 + 总数） |
| 图片卡片 | `/梗` → Pillow 渲染图片 | ❌ 暂未实现 |
| 联网兜底 | cnmeme.wiki 公开 API（像梗才查、同词 10 分钟一次、带缓存） | ❌ **不联网**（见下） |
| 预查闸门 | 本地精确 → 像梗才联网 → 同词节流 → 缓存 | 本地匹配 + 像梗判断（问梗句式 / 裸词 / 停用词） |
| 黑话自建 | `/黑话 词 释义` 命令 | 设置页新增词条（等价，但走界面） |

### 为什么去掉联网兜底

原版在本地查不到时会去 `cnmeme.wiki` 搜。移植时去掉了，原因：

1. **隐私**：联网意味着把用户的聊天片段发到第三方，梗查询往往带着上下文；
2. **稳定**：外部 API 挂了就多一次失败路径，还要处理超时、缓存、节流；
3. **够用**：6668 条覆盖了绝大多数常见梗，查不到时模型说「不知道」比编一个更安全。

需要联网版的话，可以在设置页把「自动思考梗」关掉，改用 `search_meme_wiki` 工具自行决定何时查（工具同样只查本地库）。

## 已知限制

- 只有**本地词库**，生僻梗、新梗查不到（例如「蚌埠住了」当前词库就没有）。
- 预查判断靠句式与停用词表，不是分类模型；宁可漏查，不硬塞。
- 没有图片卡片、没有命令系统（DSH 的设置页替代了 `/黑话`）。

## 许可

MIT。词库数据版权归原作者与 cnmeme.wiki；本项目仅做格式适配与功能移植，详见 `NOTICE`。
