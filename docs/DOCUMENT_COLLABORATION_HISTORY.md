# 文档协作实施记录

> 基于 [ADR 0009](./adr/0009-document-collaboration-storage-design.md) 和 [在线文档协作设计](./DOCUMENT_COLLABORATION.md) 的评审结论的各阶段实施记录，供参考与回溯。

## 代码基线验证（已完成）

以下设计假设已通过代码验证，可作为实施前提：

| 设计假设 | 验证位置 | 结论 |
|---|---|---|
| `syncContentUri()` 已存在 | `knowledge-tree.service.ts:141-152` | 签名和行为与设计一致 |
| `IMMUTABLE_FIELDS` 保护 `contentUri` | `knowledge-tree.service.ts:38-42`, `update()` L115-128 | `update()` 会抛 `BadRequestException` |
| WebDAV 已实现 Atomic Swap | `webdav.service.ts:1486-1547` `overwritePutFile()` | 四步流程与设计完全对齐 |
| `prepareDocumentTarget` 仍做递归清空 | `task-worker.service.ts:409-436` | 需在此处加互斥检查 |
| `syncDocumentContentUri` 多叶子保护 | `task-worker.service.ts:469-478` | 叶子数 > 1 时 warn 并跳过 |
| shutdown hooks 需启用 | `main.ts` | 实施前未启用，P1-5 已补齐 `enableShutdownHooks()` |
| `CommonModule` 是 `@Global()` | `common.module.ts:7-22` | 新增 provider 不引入额外模块依赖 |

## 当前实施进度

截至 2026-05-13，P1 互斥与安全基座、P2 文档读写与媒体资源、P3 Hocuspocus 协作网关、P4 前端编辑器与入口能力、P5 独立知识站点化，以及后续补充的 P5-7 站点首页知识库治理、P6 站点内知识树治理均已完成并通过验证。产品最终形态已经切换为独立站点：现有 `/console/knowledge-tree/:nodeId/edit` 路由与控制台文档入口均已移除，后台只保留治理与登录回跳支持。另外，站点已完成 V3 架构升级，实现节点数据懒加载溯源及深层路由联动，UI 原语已全部迁移至 `ShellPanel` 与 `ShellButton` 的 Starry Sky 规范。

| 阶段 | 状态 | 说明 |
|---|---|---|
| P1 | 已完成 | `DocumentSessionRegistry`、树/知识库/导入/WebDAV 会话互斥、shutdown hooks 均已落地 |
| P2 | 已完成 | `DocumentContentCodec`、`DocumentService`、REST API、媒体上传、模块注册和 WebDAV/协作保存策略复核均已完成 |
| P3 | 已完成 | P3-0 至 P3-5 后端协作网关、保存、关闭与互斥联动均已完成 |
| P4 | 已完成（能力底座） | P4-1 至 P4-7 已完成；协作编辑器、图片、知识树创建入口均已就位 |
| P5 | 已完成 | 独立知识站点化：空间首页、站点路由、站点壳、站点导航、独立登录跳转、控制台入口移除 |
| P5-7 | 已完成 | `/site` 已补齐新建/重命名/归档知识库；后台 `知识库管理` 已补齐重命名入口 |
| P6 | 已完成 | `/site/:kbId` 已补齐树治理工作区、节点 CRUD、移动、ACL 与回归测试 |
| V3 架构升级 | 已完成 | `/site/:kbId/folder/:nodeId` 目录详情页就绪；`childrenCount` 与 `lineage` 接口上线实现按需懒加载；全组件接入 Starry Sky `ShellPanel` 原语 |

已完成的验证：

- `pnpm --filter server test`：68 个测试套件、332 个测试用例通过。
- `pnpm --filter server test -- document-content-codec`：P2-1 focused 测试通过。
- `pnpm --filter server test -- document.service document-content-codec`：P2-1/P2-2 focused 测试通过。
- `pnpm --filter server test -- document.controller document.service document-content-codec`：P2-1 至 P2-4 focused 测试通过（3 个测试套件、22 个测试用例）。
- `pnpm --filter server test -- document.module document.controller document.service document-content-codec`：P2-1 至 P2-5 focused 测试通过（4 个测试套件、25 个测试用例）。
- `pnpm --filter server test -- webdav.service document.service`：P2-2/P2-6 focused 测试通过（2 个测试套件、16 个测试用例）。
- server 启动烟测：`pnpm --filter server start` 可启动，`GET /api/v1/healthz` 返回 `200`；未授权访问 `GET /api/v1/editor/smoke-node` 返回 `401`，证明 `/api/v1/editor` 已挂载且受 JWT 保护。
- `pnpm --filter server typecheck`：通过。
- P3-0 upgrade Spike：`pnpm --filter server test -- document-collab-upgrade.spike` 通过；`node --check apps/server/src/document/document-collab-upgrade.spike-runner.mjs` 通过。
- P3-1 依赖兼容性检查：本机 `node --version` 为 `v24.14.1`，满足 `@hocuspocus/server@4.0.0` 的 Node.js `>=22` 要求；CI 与生产 Docker 构建基线已同步为 Node.js 24；`apps/server/package.json` 与 `pnpm-lock.yaml` 已锁定 `@hocuspocus/server@4.0.0`、`crossws@0.4.5`、`yjs@13.6.30`、`y-protocols@1.0.7`。
- P3-1 包管理器一致性检查：临时干净目录内执行 `pnpm@9.15.9 install --lockfile-only --frozen-lockfile --ignore-scripts` 通过，证明 workspace manifests 与 lockfileVersion `9.0` 对齐。
- P3-2/P3-3/P3-5 focused 测试：`pnpm --filter server test -- document-collab.gateway document-content-codec auth.service document.module` 通过，覆盖动态 ESM 加载、`/collab` upgrade 挂载、JWT 鉴权、ACL、只读模式、会话注册/注销、Y.Doc 加载/保存、防抖参数和 `onModuleDestroy()` flush。
- P3-4 focused 测试：`pnpm --filter server test -- task-worker.service webdav.service document-collab.gateway document-session-registry` 通过，使用真实 `DocumentSessionRegistry.register()` 注册可写协作会话，验证导入任务标记 `failed` 且不清空容器，WebDAV PUT 返回 `423 Locked` 且不上传、不注入资源。
- P4-1 前端依赖兼容性验证：`pnpm --filter web typecheck` 通过；`pnpm --filter web build` 通过。`@blocknote/react@0.50.0` peer 支持 React 18/19，`@blocknote/mantine@0.50.0` peer 已通过显式安装 `@mantine/core@9.2.0` 与 `@mantine/hooks@9.2.0` 满足。
- P4-2 编辑页路由历史验证已完成：控制台内嵌页曾通过 focused 测试覆盖普通控制台仍保留侧栏、编辑页无侧栏认证壳、元数据加载、只读状态、错误态与返回入口；该路由已在 P5 删除，当前回归由 `site` 路由测试接管。
- P4-2 前端类型检查：`pnpm --filter web typecheck` 通过。
- P4-2 前端生产构建：`pnpm --filter web build` 通过，`/console/knowledge-tree/[nodeId]/edit` 已进入 Next.js 动态路由表。
- P4-2 浏览器冒烟：本地 `http://localhost:6002` 运行 web dev server 后，用 Playwright 注入登录态并 mock `/api/v1/editor/node-doc`；桌面视口 `1366x900` 下无 `aside`、无控制台导航文案、正文区宽度 720px，移动视口 `390x844` 下无 `aside`、正文区宽度 390px。
- P4-3 BlockNote focused 测试：`pnpm --filter web test -- components/document-editor/document-editor.spec.tsx app/console/layout.spec.tsx` 通过，覆盖正文 blocks 加载、只读模式、编辑后未保存状态、手动保存 `PUT /editor/:nodeId/content` 和编辑器状态栏。
- P4-3 前端类型检查与生产构建：`pnpm --filter web typecheck` 通过；`pnpm --filter web build` 通过。
- P4-3 浏览器冒烟：真实 BlockNote 组件在本地 `http://localhost:6002` 可渲染 mock 后端 blocks；桌面视口下正文区宽度 720px、无 `aside`，点击保存触发一次 `PUT /api/v1/editor/node-doc/content`。
- P4-4 HocuspocusProvider focused 测试：`pnpm --filter web test -- components/document-editor/document-collaboration.spec.ts components/document-editor/document-editor.spec.tsx app/site/[kbId]/doc/[nodeId]/page.spec.tsx app/console/layout.spec.tsx` 通过，覆盖 URL 构造、`token` 配置、`document-store` fragment、`status/synced/disconnect/close/authenticationFailed` 状态映射、cleanup、协作模式不请求 REST 正文，以及独立站点文档页承接编辑器能力。
- P4-4/S9 真实协议层验证：`node --check apps/server/src/document/document-collab-realtime.e2e-runner.mjs` 通过；`pnpm --filter server test -- document-collab.gateway document-collab-realtime.e2e` 通过，覆盖两个 `HocuspocusProvider` 客户端经 Nest `/collab` upgrade 同步同一文档的 Y.Text 内容和 awareness 协作者状态。
- P4-4 类型检查与生产构建：`pnpm --filter server typecheck`、`pnpm --filter web typecheck`、`pnpm --filter web build` 通过。
- P4-5 图片上传 focused 测试：`pnpm --filter web test -- components/document-editor/document-assets.spec.ts components/document-editor/document-collaboration.spec.ts components/document-editor/document-editor.spec.tsx app/site/[kbId]/doc/[nodeId]/page.spec.tsx app/console/layout.spec.tsx` 通过，覆盖资产上传 endpoint 编码、FormData 字段名、格式和体积校验、只读拒绝、REST/协作模式 `uploadFile` 接入、上传状态和站点文档页承载。
- P4-5 前端类型检查与生产构建：`pnpm --filter web typecheck` 通过；`pnpm --filter web build` 通过。
- P4-6 图片渲染与缓存 focused 测试：`pnpm --filter web test -- components/document-editor/document-assets.spec.ts components/document-editor/document-collaboration.spec.ts components/document-editor/document-editor.spec.tsx app/site/[kbId]/doc/[nodeId]/page.spec.tsx app/console/layout.spec.tsx` 通过，覆盖 `assets/{filename}` 路径解析、非法路径拒绝、Bearer Token fetch、Object URL 缓存与释放、失败错误和 REST/协作模式 `resolveFileUrl` 接入。
- P4-6 前端类型检查与生产构建：`pnpm --filter web typecheck` 通过；`pnpm --filter web build` 通过。
- P4-7 后端 focused 测试：`pnpm --filter server test -- knowledge-tree.controller knowledge-tree.service` 通过，覆盖目录创建兼容、文档创建分派和创建接口角色兜底。
- P4-7 前端 focused 测试：`pnpm --filter web test -- app/console/knowledge-tree/page.spec.tsx app/console/layout.spec.tsx app/site/[kbId]/page.spec.tsx` 通过，覆盖新建目录兼容、新建文档后控制台不再跳转编辑页、控制台文档入口移除，以及独立站点首页与左侧目录承接最终入口。
- P4-7 类型检查：`pnpm --filter server typecheck`、`pnpm --filter web typecheck` 通过。
- `pnpm docs:check`：通过。
- `pnpm --filter web test -- app/site/page.spec.tsx app/site/[kbId]/page.spec.tsx app/console/knowledge-bases/page.spec.tsx`：通过，覆盖站点首页知识库治理、站点内树治理、后台知识库重命名入口。
- `git diff --check`：无空白错误，仅存在既有 CRLF warning。
- 本轮新增和修改的协作相关文件已确认 UTF-8 without BOM。

风险记录：P1-P3 修改触达 `TaskWorkerService.processTask`、`WebdavService.buildResponse`、`DocumentCollabGateway` 等核心入口，GitNexus 变更检测给出过高风险提示；当前以全量 server Jest、focused Jest 和 typecheck 覆盖主要回归面，后续继续修改这些入口前仍需重新做影响分析。包管理器执行基线已统一为 `pnpm@9.15.9`，与 `pnpm-lock.yaml` 的 lockfileVersion `9.0` 对齐；CI 与生产 Docker 构建均使用 Node.js 24 和 `pnpm install --frozen-lockfile`。`@hocuspocus/server@4.0.0`、`crossws@0.4.5` 和 `@blocknote/core@0.50.0` 均按 ESM 优先方式处理，生产代码通过 `importEsmModule()` 动态加载，避免当前 Jest/CommonJS 运行时静态 import 失败。

## 补充设计项（评审新增）

以下 11 项在设计文档中未覆盖或未明确，实施时必须同步处理：

### S1. WebSocket upgrade 路径路由（P3 前置 Spike）

NestJS 默认使用 `@nestjs/platform-express`，Express HTTP server 需要手动监听 `upgrade` 事件才能将 WebSocket 连接分发给 Hocuspocus。设计中"嵌入 NestJS 进程"缺少具体的升级路径说明。

**方案**：在 `DocumentCollabGateway.onModuleInit()` 中通过 `app.getHttpServer()` 获取底层 HTTP server，监听 `upgrade` 事件，按路径 `/collab` 分发给 `hocuspocus.handleConnection()`。参考 Docmost 的集成模式。

**必须在 P3 编码前完成 Spike 验证。**

### S2. JWT 长会话刷新机制（P3/P4 约束声明）

编辑器 WebSocket 连接可能持续数小时，JWT 通常 2 小时过期。`onAuthenticate` 只在连接建立时校验一次。

**P1/P2/P3 采用方案 A**：接受"连接期间权限变更不生效"的约束，与 WebDAV Basic Auth 语义对齐。在文档中明确声明此限制。

**后续迭代可考虑方案 B**：前端定期刷新 JWT 并通过自定义 Hocuspocus extension 重新认证。

### S3. WebSocket 路径排除全局前缀（P3 实施细节）

`main.ts:68` 设置了全局前缀 `api`，REST 端点自动变为 `/api/v1/editor/...`。WebSocket 路径 `ws://host/collab` 不走 REST 路由，需在 `setGlobalPrefix` 的 `exclude` 中显式排除：

```typescript
{ path: 'collab', method: RequestMethod.ALL }
```

### S4. 不支持内容的前端降级表现（P2/P4 接口约定）

BlockNote 不支持的块类型在反序列化时应降级为纯文本段落，不得静默丢弃。`DocumentContentCodec` 转换时应记录 warn 日志。P2 实现 codec 时需同步编写降级测试用例。

### S5. DocumentService 依赖注入链（P2 实施细节）

`DocumentService` 需要注入以下依赖以完成 OpenViking 读写：

| 依赖 | 来源 | 用途 |
|---|---|---|
| `OVClientService` | `CommonModule`（@Global） | 调用 OpenViking API |
| `SettingsService` | `SettingsModule` | 解析租户 OV 配置（`resolveOVConfig`） |
| `KnowledgeTreeService` | `KnowledgeTreeModule` | `findOne`、`syncContentUri`、`touch` |
| `DocumentSessionRegistry` | `CommonModule` | 会话注册/注销 |

### S6. 新建文档节点的完整流程（P4 入口交互）

明确为"先创建空节点，再进入独立站点文档页"：用户在知识树点击"新建文档" → 调用现有 `POST /api/v1/knowledge-tree` 并传入 `kind: 'document'` → 生成文档节点的 `vikingUri` 容器（`contentUri` 为 null）→ 通过独立站点链接 `/site/:kbId/doc/:nodeId` 进入文档页 → 首次保存走设计中的"情况 B"。

当前实现中，`POST /api/v1/knowledge-tree` 已在**不新增专用后端 API**的前提下支持 `kind:'collection' | 'document'`：`kind` 缺省仍为 `collection`，`kind:'document'` 时调用已有 `KnowledgeTreeService.createFile()` / `createFileWithGeneratedUri()` 分支；文档名称没有后缀时由服务层通过集中常量补齐 Markdown 默认扩展名，避免把 `.md` 散落在 Controller 或页面代码里。

---

### S7. 编辑器 UI/UX 规范——与管理后台的统一与分离（P4-0 前置）

编辑器是**创作工具**，不是管理后台的数据面板。它的用户长时间沉浸于内容本身，UX 范式与扫一眼就走的 Dashboard 完全不同（参考 Notion / Outline / Typora）。但编辑器仍需与管理后台共享同一套视觉 DNA，让用户感知"这是同一个产品"。

#### 基调层：必须统一

以下设计令牌从 `DESIGN.md` 和 `globals.css` 继承，编辑器不得另起炉灶：

| 维度 | 继承内容 | 来源 |
|---|---|---|
| 色彩系统 | `--brand`、`--bg-base`、`--bg-card`、`--bg-elevated`、`--text-primary`、`--text-muted`、`--border`、`--danger`、`--warning` | `globals.css` CSS 变量 |
| 双主题 | 星智流光（草原绿 / 浅灰底）与浩瀚星空（霓虹蓝 / 深空黑）的完整色值、阴影、边框质感 | `globals.css` + `app-provider.tsx` |
| 排版 | Inter + PingFang SC / Microsoft YaHei 字体栈 | `layout.tsx` font-sans |
| 圆角 | `--radius-base: 28px`（容器卡片）、`--radius-tile: 16px`（内部组件）、`--radius-pill: 9999px`（按钮/标签） | `globals.css` |
| 图标 | Lucide React，strokeWidth 1.5，严禁 Emoji | `DESIGN.md` §1-4 |
| 文案 | 面向用户中文，面向协议英文；错误信息给下一步 | `DESIGN.md` §1-6 |
| 动画缓动 | Framer Motion 弹簧曲线 | 现有依赖 |

#### 编辑器层：必须独立

以下维度是管理后台的壳层范式，编辑器页面**不得复用**：

| 维度 | 管理后台（Console） | 文档编辑器（Editor） | 理由 |
|---|---|---|---|
| **页面布局** | 固定侧边栏（292px / 72px）+ `px-6 py-8` 主内容区 | 无侧边栏。顶部精简导航条 + 居中内容区 | 侧边栏侵占写作空间，创作工具需要尽可能宽 |
| **内容宽度** | 铺满 content area（卡片拼贴） | 正文区约束 `max-width: 720px`，居中，两侧留白 | 参考 Notion/Typora，长行宽降低阅读效率 |
| **导航方式** | 侧边栏 13 项菜单 + 编号前缀 | 面包屑 `知识树 > 文档名` + 返回按钮 | 编辑器内不需要全局导航 |
| **信息密度** | Bento Grid 高密度卡片拼贴 | 大面积留白，正文为绝对主角 | 创作场景需要"呼吸感" |
| **数据呈现** | `text-6xl font-black` 大数字冲击 | 正文 16px（`--editor-body-size`），标题 h1-h4 递减 | 阅读节奏优先 |
| **操作模式** | 表格行内按钮分级（一级/二级/更多） | 块级斜杠菜单（`/` 触发）+ 浮动工具栏 + 顶部操作栏 | 编辑器原生交互范式 |
| **反馈系统** | 边缘脉冲电流、数据显影乱码解码 | 保存状态指示（已保存/保存中/未保存）、协作者光标 | 编辑场景关注的是"我的内容安全吗" |
| **滚动行为** | 隐形式滚动条 | 编辑器内正常滚动（保留原生滚动条或极细可见滑块） | 长文档需要精确滚动定位 |
| **Viking Watchers** | 右下角守望者跟随鼠标 | 不出现 | 编辑器内任何非内容元素都是干扰 |

#### 编辑页布局结构

```text
┌─────────────────────────────────────────────────────────┐
│ 顶栏（h-14，可折叠隐藏）                                   │
│ [← 返回] [面包屑] [文档名]     [协作者头像] [保存状态] [···] │
├─────────────────────────────────────────────────────────┤
│                                                          │
│          ┌─────────────────────────────┐                 │
│          │                             │                 │
│          │   正文区（max-width: 720px）  │                 │
│          │   BlockNote 编辑器           │                 │
│          │                             │                 │
│          │   向下滚动时顶栏自动隐藏，    │                 │
│          │   向上滚动时顶栏重新出现      │                 │
│          │                             │                 │
│          └─────────────────────────────┘                 │
│                                                          │
│          左侧：可选大纲目录（TOC），默认折叠               │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

#### 编辑器专属 CSS 变量

在 `globals.css` 中追加，供 BlockNote 主题覆盖使用：

```css
:root {
  /* 编辑器排版 */
  --editor-body-size: 16px;
  --editor-line-height: 1.75;
  --editor-max-width: 720px;

  /* 编辑器内容区背景（与管理后台的 bg-base 区分） */
  --editor-bg: var(--bg-base);
  --editor-surface: var(--bg-card);
  --editor-toolbar-bg: var(--bg-elevated);

  /* 协作光标色盘（每人一个色） */
  --collab-cursor-1: #E06C75;
  --collab-cursor-2: #61AFEF;
  --collab-cursor-3: #C678DD;
  --collab-cursor-4: #98C379;
  --collab-cursor-5: #E5C07B;
  --collab-cursor-6: #56B6C2;
}

.theme-starry {
  --editor-bg: var(--bg-base);
  --editor-surface: rgba(255, 255, 255, 0.04);
  --editor-toolbar-bg: rgba(255, 255, 255, 0.06);
}
```

#### BlockNote 主题覆盖策略

Mantine 是 BlockNote 的底层 UI 框架。通过 `@blocknote/mantine` 的主题定制 API，覆盖 Mantine 默认色值以匹配双主题系统，但**保留 BlockNote 自身的编辑交互范式**（斜杠菜单、块拖拽、悬浮工具栏），不做"管理后台化"改造。

| 覆盖项 | 方法 |
|---|---|
| 正文字体/字号/行高 | CSS 变量注入 `.bn-container` |
| 代码块配色 | 继承 `--text-primary` / `--bg-elevated` |
| 选中态高亮 | 使用 `--brand` 半透明 |
| 斜杠菜单圆角 | 继承 `--radius-tile` |
| 协作光标颜色 | 使用 `--collab-cursor-*` 色盘 |
| 图片块圆角 | 继承 `--radius-tile` |

#### 多人协作光标视觉规范

| 元素 | 规范 |
|---|---|
| 光标线条 | 2px 宽，使用色盘中不重复的颜色 |
| 名称标签 | 光标尾部显示用户名，`font-size: 11px`，背景半透明黑/白，`border-radius: 4px`，`padding: 1px 6px` |
| 选区高亮 | 与光标同色，`opacity: 0.15` |
| 头像缩略 | 顶栏右侧显示当前在线协作者头像圆点（取用户名首字），hover 显示完整用户名 |

#### 保存状态指示

| 状态 | 表现 |
|---|---|
| 已保存 | 顶栏右侧显示 `✓ 已保存`，`var(--text-muted)` 色，2 秒后淡出 |
| 保存中 | 显示 `⟳ 保存中…`，带 subtle 旋转动画 |
| 未保存 | 显示 `● 未保存`，`var(--brand)` 色 |
| 保存失败 | 显示 `✕ 保存失败`，`var(--danger)` 色，hover 展开重试按钮 |

### S8. 协作 Provider 生命周期与单写入通道（P4-4）

P4-3 的 REST 手动保存只适用于尚未接入协作 Provider 的编辑器基座。P4-4 接入 `HocuspocusProvider` 后，活跃编辑会话会由 `DocumentCollabGateway` 注册到 `DocumentSessionRegistry`；此时再从同一页面调用 `PUT /api/v1/editor/:nodeId/content` 会被 REST 写入互斥规则识别为可写协作会话冲突，容易得到 `423 Locked`。

**方案**：协作模式下只保留一条活动写入通道，即 `BlockNote → Y.Doc → HocuspocusProvider → Hocuspocus → DocumentService`。顶栏保存状态改为表达协作连接与服务端同步状态；REST `GET/PUT /content` 仅作为非协作回退、测试夹具或后续显式恢复工具使用，不得在 Provider 已连接时并行写正文。

Provider 生命周期必须显式管理：

| 事项 | 要求 |
|---|---|
| WebSocket 地址 | 由服务端元数据直接下发 `collab.serverUrl`；前端不得再从 `window.location.origin` 或 `collab.path` 推导协作地址，也不得把 `documentName` 拼进 `url` |
| 文档名 | 使用元数据 `collab.documentName` 作为 `HocuspocusProvider` 的 `name` |
| 鉴权参数 | 从 `readSessionToken()` 读取 JWT，通过 `token` 配置传给 `HocuspocusProvider` |
| Fragment | 使用与后端一致的 `document-store`，前端需集中定义常量，不在组件内散落字符串 |
| 创建时机 | 元数据和 token 都就绪后再创建 `Y.Doc` 与 `HocuspocusProvider`，避免空 token 握手 |
| 清理时机 | `nodeId`、`documentName` 变化或组件卸载时调用 `provider.disconnect()` 并释放当前 `Y.Doc` 引用 |
| 连接状态 | 监听 `status`、`synced`、`disconnect`、`close`、`authenticationFailed`，映射到顶栏中文状态 |
| 只读模式 | 元数据 `readOnly` / `canWrite=false` 仍传入 BlockNote `editable=false`，服务端只读鉴权作为第二道防线 |

### S9. P4 端到端验收边界（P4-4 至 P4-7）

P4 后半段不能只靠组件单测验收。最终必须覆盖真实用户路径：

1. `tenant_operator` 打开同一文档两个标签页，任一端输入后另一端实时出现内容和协作者光标。
2. `tenant_viewer` 打开同一文档时只读，无法输入，也不会触发正文写入。
3. 断开 WebSocket 后顶栏明确提示连接中断，并提供重新连接入口，不显示"已保存"。
4. 粘贴或拖拽图片后，前端上传到 `assets/`，正文插入相对路径，重新打开后图片仍可渲染。
5. WebDAV PUT 或导入任务遇到活跃可写协作会话时保持 `423 Locked` / failed 语义，不覆盖正在编辑的内容。
6. `/site/:kbId/doc/:nodeId` 在桌面和移动视口均无控制台侧栏，正文区域仍遵守 `--editor-max-width`。

当前 S9 状态：已完成真实协议层闭环。验收 runner 使用两个 `HocuspocusProvider` 客户端连接同一 `document:{tenantId}:{nodeId}`，验证任一端写入 Y.Text 后另一端能在超时窗口内读到相同内容，并验证 awareness 协作者状态能同步到另一端。runner 输出 `P4_S9_REALTIME_OK name=document:tenant-a:node-realtime`。

### S10. 认证图片渲染与正文路径分离（P4-5/P4-6）

后端资产读取端点受 JWT Guard 保护，而浏览器普通 `<img src>` 不能携带 `Authorization` Header。若直接把 `/api/v1/editor/:nodeId/assets/{filename}` 写入图片块，要么预览失败，要么只能把 token 放进 URL，这会带来泄露和缓存污染风险。

**决策**：

- 正文和 Markdown 中只保存 `assets/{generatedFileName}` 相对路径，保持 OpenViking 内容可移植。
- P4-5 使用 BlockNote `uploadFile` 钩子接收粘贴/拖拽产生的单个 `File`，上传成功后返回相对路径给编辑器。
- P4-6 负责把 `assets/{generatedFileName}` 映射为可预览资源：带 Bearer Token `fetch` 资产端点，生成 Object URL 给编辑器展示，并在节点切换或组件卸载时释放。
- 当前资产目录是扁平结构。前端只接受 `assets/{filename}`，不保留多级子路径语义；`..`、空文件名和非 `assets/` 路径必须拒绝代理。
- SVG 仍按后端强制下载策略处理。编辑器内联上传只允许 PNG、JPG/JPEG、GIF、WebP，不能把未清洗 SVG 放入图片块。
- P4-5 focused 测试只验上传校验、字段名、状态和相对路径写入；“粘贴后可预览、重开后可渲染”的完整验收归入 P4-6。

### S11. 知识树入口集成边界（P4-7）

P4-7 是把既有编辑器能力接到用户真实入口，不应引入新的内容写入链路或新的后端资源模型。

| 边界 | 要求 |
|---|---|
| 后端端点 | 继续使用 `POST /api/v1/knowledge-tree`；只扩展 DTO/Controller 对 `kind:'document'` 的分派，不新增 `/documents` 或 `/editor/create` 之类的专用创建 API |
| 缺省兼容 | 未传 `kind` 时保持现有目录节点创建语义，避免破坏现有"新建节点"入口和测试 |
| 文档节点创建 | `kind:'document'` 时生成文档节点容器 URI，`contentUri` 保持 null，首次保存仍由 `DocumentService` 走首次写入分支回写 |
| 角色兜底 | 创建文档节点必须由后端校验 `tenant_operator` 及以上角色，前端按钮显隐只能作为体验优化 |
| 前端类型 | `KnowledgeNode` / `TreeNode` 类型必须补齐 `kind`、`contentUri`，不能继续靠 `vikingUri` 是否以 `/` 结尾推断文档类型 |
| 入口按钮 | 仅 `kind:'document'` 节点显示"编辑"入口；目录节点不显示编辑入口 |
| 只读进入 | `tenant_viewer` 只要满足 ACL 可见性即可进入编辑页，由 `/api/v1/editor/:nodeId` 元数据返回 `readOnly=true` / `canWrite=false` 控制只读 |
| 新建后访问 | 创建成功后文档可直接通过 `/site/:kbId/doc/:nodeId` 访问，不要求用户再手动选中节点 |
| 父子关系 | P4-7 沿用现有知识树父级选择器，不额外引入"文档不能有子节点"的新约束；若后续要把文档强制为叶子节点，需要单独评审数据迁移和 WebDAV 路径影响 |
| UI 范式 | 知识树页面可沿用管理后台视觉；进入编辑页后必须切换到 S7 创作工具布局 |

---

### S12. 独立站点形态边界（P5）

P4 已经把协作编辑内核做完，但当前入口仍挂在 `/console` 下，这与飞书知识库、钉钉知识库的最终用户体验不一致。P5 的目标不是重写协作内核，而是把现有能力迁移到“独立知识站点”：

| 边界 | 要求 |
|---|---|
| 站点路由 | 首阶段使用稳定 ID 路由：`/site` 作为知识空间首页，`/site/:kbId` 作为知识库空间首页，`/site/:kbId/doc/:nodeId` 作为文档页 |
| 稳定性 | 当前没有 `slug/siteId` 字段，禁止直接用可变的 `knowledge_nodes.path` 作为唯一 URL 键 |
| 控制台关系 | 控制台不再保留文档编辑页路由或文档打开按钮；最终用户入口只认 `/site` |
| 后台全局入口 | 控制台右上角提供 `进入知识空间`，直接打开 `/site` |
| 后台列表入口 | `知识库管理` 列表页每行保留 `进入空间` 主按钮，低频治理动作进入二级菜单 |
| 站点壳 | 必须有独立顶栏、左侧树导航、站点级搜索与用户菜单；不能复用控制台 13 项管理菜单 |
| 站点治理组件 | `site/[kbId]/page.tsx` 的知识树治理区必须使用站点专用组件，不直接复用 `console/knowledge-tree` 页面组件 |
| 鉴权跳转 | 未登录访问 `/site/*` 时走站点登录跳转语义，并在登录后回跳原站点链接 |
| 阅读/编辑统一 | 阅读态与编辑态共享站点壳，只在工具栏与正文可编辑性上区分，不拆成两套完全不同页面 |
| 入口迁移 | 后台不再承担文档打开入口；站点文档通过直接站点链接和登录回跳进入 |
| 兼容策略 | P5 不改变 `DocumentService`、`DocumentCollabGateway`、`/api/v1/editor` 和 `/collab` 的核心契约，只迁移前端壳和入口 |

---

## 任务清单

### P1：互斥与安全基座

目标：导入、WebDAV、删除、移动在活跃协作会话下返回明确冲突，优雅关闭不丢数据。

- [x] **P1-1** `CommonModule` 新增 `DocumentSessionRegistry`
  - 文件：`apps/server/src/common/document-session-registry.ts`
  - 实现 `register` / `unregister` / `hasActiveSession` / `hasActiveWriteSession` / `hasActiveSessionInKb` / `assertNoActiveWriteSession` / `assertNoActiveSessionInNodes`
  - 内部结构：`nodeSessions: Map<nodeId, Map<connectionId, SessionInfo>>` + `kbNodes: Map<kbId, Set<nodeId>>`
  - 在 `common.module.ts` 的 `providers` 和 `exports` 中注册
  - 编写单元测试
  - 状态：已完成，验证命令 `pnpm --filter server test -- document-session-registry`
  - **验收**：所有公开方法有单测覆盖，`CommonModule` 导出后可被任意模块注入

- [x] **P1-2** `KnowledgeTreeService` 注入子树会话检查
  - 文件：`apps/server/src/knowledge-tree/knowledge-tree.service.ts`
  - 注入 `DocumentSessionRegistry`
  - `remove()` 执行前收集目标节点及所有后代 ID，调用 `assertNoActiveSessionInNodes`
  - `update()` 中涉及移动/重命名时同样检查子树
  - 新增内部方法 `collectSubtreeNodeIds(nodeId, tenantId)` 遍历子树
  - 状态：已完成，验证命令 `pnpm --filter server test -- knowledge-tree.service`
  - **验收**：删除/移动含活跃协作会话的节点时抛出 `423 Locked`；无会话时正常执行

- [x] **P1-3** `TaskWorkerService` 导入前加写会话检查
  - 文件：`apps/server/src/import-task/task-worker.service.ts`
  - 注入 `DocumentSessionRegistry`
  - 在 `prepareDocumentTarget()` 调用前检查 `assertNoActiveWriteSession(nodeId)`
  - 冲突时将任务标记为 `failed`，原因："目标节点正在被协作编辑"
  - Worker 现有 `nodeRepo.update()` 直接调用保留不变（租户仓储上下文约束）
  - 状态：已完成，验证命令 `pnpm --filter server test -- task-worker.service`
  - **验收**：导入任务目标节点有可写协作会话时，任务标记为 failed 而非覆盖容器

- [x] **P1-4** `WebdavService` 加会话检查
  - 文件：`apps/server/src/webdav/webdav.service.ts`
  - 注入 `DocumentSessionRegistry`
  - `overwritePutFile()` 执行前调用 `assertNoActiveWriteSession(nodeId)`
  - `delete()` / `move()` 执行前调用 `assertNoActiveSessionInNodes`
  - 冲突时返回 `423 Locked`
  - 状态：已完成，验证命令 `pnpm --filter server test -- webdav.service`
  - **验收**：WebDAV PUT 覆盖含可写协作会话的文档时返回 423；DELETE/MOVE 含任意活跃会话时返回 423

- [x] **P1-5** 启用 NestJS shutdown hooks
  - 文件：`apps/server/src/main.ts`
  - 在 `bootstrap()` 中 `await app.listen(port)` 之前添加 `app.enableShutdownHooks()`
  - 状态：已完成，验证命令 `pnpm --filter server typecheck`
  - **验收**：发送 SIGTERM 时 NestJS 触发 `onModuleDestroy` 生命周期钩子

- [x] **P1-6** `KnowledgeBaseService` 补齐知识库级删除会话检查
  - 文件：`apps/server/src/knowledge-base/knowledge-base.service.ts`
  - `remove()` 删除知识库前调用 `DocumentSessionRegistry.hasActiveSessionInKb`
  - WebDAV 知识库级 `DELETE` / `MOVE` 遇到活跃协作会话时返回 `423 Locked`
  - 状态：已完成，验证命令 `pnpm --filter server test -- knowledge-base.service webdav.service`
  - **验收**：知识库下存在任意活跃协作会话时，不删除或移动知识库

### P2：文档读写与媒体资源

目标：Markdown 读取、Atomic Swap 保存、资产上传下载可独立测试，无需 WebSocket 协作。

- [x] **P2-1** 实现 `DocumentContentCodec` 格式转换组件
  - 文件：`apps/server/src/document/document-content-codec.ts`
  - 辅助文件：`apps/server/src/document/document-content-codec.types.ts`、`apps/server/src/document/document-markdown-parser.ts`、`apps/server/src/document/document-markdown-renderer.ts`
  - 职责：Markdown ↔ BlockNote JSON 双向转换
  - 实施前已检查 `apps/server/package.json`，当前无可复用 Markdown / BlockNote 转换依赖；P2-1 未新增生产依赖，采用后端自包含的受支持 Markdown 子集解析与渲染
  - P1/P2 只承诺：标题、段落、有序/无序列表、引用、代码块、链接、图片、分隔线
  - 不支持的块类型降级为纯文本段落，转换时记录 warn 日志（参见补充项 S4）
  - 编写 Markdown → JSON → Markdown 往返测试
  - 状态：已完成，验证命令 `pnpm --filter server test -- document-content-codec`、`pnpm --filter server typecheck`
  - **验收**：常规 Markdown 元素往返无损；不支持的块降级为纯文本且有 warn 日志

- [x] **P2-2** 实现 `DocumentService`
  - 文件：`apps/server/src/document/document.service.ts`
  - 辅助文件：`apps/server/src/document/document.service.types.ts`
  - 依赖注入参见补充项 S5
  - `loadContent(nodeId, tenantId)` → 通过 `contentUri` 读取 Markdown → 转为 BlockNote JSON；`contentUri` 为 null 时返回空文档结构
  - `saveContent(nodeId, tenantId, json)` → BlockNote JSON → Markdown → Atomic Swap 写入（情况 A/B）
  - `uploadAsset(nodeId, tenantId, file)` → temp_upload → 注入到 `{vikingUri}assets/`
  - `loadAsset(nodeId, tenantId, filename)` → 流式读取资产文件
  - 单元测试：mock `OVClientService` 覆盖情况 A（已有 contentUri）和情况 B（首次写入）
  - 状态：已完成，验证命令 `pnpm --filter server test -- document.service document-content-codec`、`pnpm --filter server typecheck`
  - **验收**：REST 读写可独立运行，不依赖 Hocuspocus

- [x] **P2-3** 实现 `DocumentController`（REST API）
  - 文件：`apps/server/src/document/document.controller.ts`
  - 辅助文件：`apps/server/src/document/document-openviking-response.util.ts`
  - 路由前缀：`/api/v1/editor`
  - `GET /:nodeId` — 文档元数据（名称、权限、协作地址）
  - `GET /:nodeId/content` — 读取 contentUri 转为编辑器 JSON
  - `PUT /:nodeId/content` — 将编辑器内容转为 Markdown 写入 OpenViking
  - `POST /:nodeId/assets` — 上传图片（multipart/form-data）
  - `GET /:nodeId/assets/*path` — 代理读取图片（流式，含 Cache-Control / ETag）
  - 鉴权：复用现有 JWT Guard，写操作校验 `tenant_operator` 及以上角色
  - REST 写正文时启用 `assertNoActiveWriteSession`，避免活跃协作写会话与普通 REST 保存互相覆盖
  - 写正文和上传资产均记录审计日志
  - 状态：已完成，验证命令 `pnpm --filter server test -- document.controller document.service document-content-codec`、`pnpm --filter server typecheck`
  - **验收**：Controller 单元测试覆盖文档元数据、正文读写、图片上传和资产代理；运行时 HTTP 可访问性由 P2-5 统一验收

- [x] **P2-4** 媒体资源上传配置与安全策略
  - 文件：`apps/server/src/document/constants.ts`
  - 定义 `DOCUMENT_ASSET_UPLOAD_CONFIG`（参见设计文档"上传配置"节）
  - 使用 `@nestjs/platform-express` 的 `FilesInterceptor` 在资产上传路由按配置注册，避免影响导入上传链路
  - SVG 读取代理返回时强制 `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`
  - 状态：已完成，验证命令 `pnpm --filter server test -- document.controller document.service document-content-codec`、`pnpm --filter server typecheck`
  - **验收**：合法图片格式通过过滤，非法格式被拒；SVG 读取代理下载而非内联；运行时 multipart 验证随 P2-5 完成

- [x] **P2-5** 注册 `DocumentModule` 到 `AppModule`
  - 文件：`apps/server/src/document/document.module.ts`、`apps/server/src/app.module.ts`
  - 测试文件：`apps/server/src/document/document.module.spec.ts`
  - 导入依赖模块：`CommonModule`、`KnowledgeTreeModule`、`SettingsModule`、`AuditModule`
  - 声明 `DocumentController`、`DocumentService`、`DocumentContentCodec`
  - 导出 `DocumentService`、`DocumentContentCodec`，供 P3 Hocuspocus 网关复用
  - 状态：已完成，验证命令 `pnpm --filter server test -- document.module document.controller document.service document-content-codec`、`pnpm --filter server typecheck`，并完成 server 启动烟测
  - **验收**：应用启动无报错，`/api/v1/editor` 端点可访问

- [x] **P2-6** 验证 WebDAV PUT 与协作保存策略一致（与 P1-4 联动）
  - `WebdavService.overwritePutFile()` 的协作会话互斥已在 P1-4 完成
  - P2-2 完成 `DocumentService.saveContent()` 后，验证 WebDAV 覆盖与协作保存的 Atomic Swap 策略一致（只替换叶子，不清空容器）
  - 已补充 WebDAV 覆盖 PUT happy path 回归测试，断言 `temp_upload` → `/api/v1/resources` 注入新叶子 → `syncContentUri` → `recursive=false` 删除旧正文叶子，不调用导入任务，不触碰 `assets/` 容器
  - 状态：已完成，验证命令 `pnpm --filter server test -- webdav.service document.service`、`pnpm --filter server typecheck`
  - **验收**：WebDAV PUT 覆盖不丢失 `assets/` 下的附件

### P3：Hocuspocus 协作网关

目标：多人实时协作编辑、防抖持久化、优雅关闭 flush。

- [x] **P3-0** Spike：Hocuspocus + NestJS HTTP server 升级验证（补充项 S1）
  - 已验证 `@hocuspocus/server` 的 `Server` 类会自建 HTTP server，不适合作为现有 NestJS 进程内嵌入口
  - 已验证可使用 `Hocuspocus` 核心类 + `crossws/adapters/node` 挂载到 NestJS 底层 HTTP server 的 `upgrade` 事件
  - 已验证 Hocuspocus 不额外占用独立端口，WebSocket 握手发生在 NestJS 监听端口
  - 已确认当前 Jest/CommonJS 运行时不能静态 import Hocuspocus 4 ESM 入口；P3-2 生产网关已通过 `importEsmModule()` 动态加载 `@hocuspocus/server` 与 `crossws/adapters/node`
  - 状态：已完成，新增验证文件 `apps/server/src/document/document-collab-upgrade.spike.spec.ts`、`apps/server/src/document/document-collab-upgrade.spike-runner.mjs`
  - 验证命令：`node --check apps/server/src/document/document-collab-upgrade.spike-runner.mjs`、`pnpm --filter server test -- document-collab-upgrade.spike`、`pnpm --filter server typecheck`
  - **验收**：Node 原生 WebSocket 客户端可通过 NestJS 随机监听端口的 `/collab` 建立 WebSocket 连接并握手成功，且 `hocuspocus.server` 保持未创建状态

- [x] **P3-1** 安装后端协作依赖
  - 已安装 `@hocuspocus/server@4.0.0`、`crossws@0.4.5`、`yjs@13.6.30`、`y-protocols@1.0.7`
  - 已确认 `@hocuspocus/server@4.0.0` 要求 Node.js `>=22`，本机 `v24.14.1`、CI 与生产 Docker 的 Node.js 24 基线均满足要求
  - 已用 `apps/server/package.json` 和 `pnpm-lock.yaml` 固定版本
  - 状态：已完成，验证命令 `pnpm --filter server typecheck`
  - **验收**：后端协作依赖可被当前 server TypeScript 工程解析，未引入新的数据库、Redis 或后台队列强依赖；`crossws` 作为直接依赖用于 Nest HTTP server `upgrade` 适配，不依赖 transitive package 解析

- [x] **P3-2** 实现 `DocumentCollabGateway`
  - 文件：`apps/server/src/document/document-collab.gateway.ts`
  - `onModuleInit`：初始化 Hocuspocus 实例，注册钩子，挂载 WebSocket upgrade（参见 P3-0 结论）
  - `onAuthenticate`：验证 JWT + 检查 ACL 可见性 + 判断角色（operator→write, viewer→readonly）
  - `onLoadDocument`：从 OpenViking 读取 `contentUri` → Markdown → 初始化 Y.js Doc（contentUri 为 null 时返回空 Doc）
  - `onStoreDocument`：Y.js Doc → Markdown → Atomic Swap 写入
  - `onConnect` / `onDisconnect`：调用 `DocumentSessionRegistry.register/unregister`
  - 协作文档名格式：`document:{tenantId}:{nodeId}`，tenantId 从 JWT 解析，不信任客户端
  - 状态：已完成，验证命令 `pnpm --filter server test -- document-collab.gateway document-content-codec auth.service document.module`、`pnpm --filter server typecheck`
  - **验收**：后端网关单元测试覆盖鉴权、ACL、只读模式、会话注册/注销、Y.Doc 加载和保存；两个浏览器标签页光标同步随 P4-4 前端 Provider 接入做端到端验收

- [x] **P3-3** 防抖配置与优雅关闭
  - 配置 Hocuspocus `debounce: 30000`、`maxDebounce: 60000`
  - 在 `DocumentCollabGateway` 实现 `onModuleDestroy()`：
    - 调用 `hocuspocus.closeConnections()`
    - 调用 `hocuspocus.flushPendingStores()`
  - 依赖 P1-5 的 `enableShutdownHooks()`
  - 状态：已完成，验证命令 `pnpm --filter server test -- document-collab.gateway`、`pnpm --filter server typecheck`
  - **验收**：focused 测试覆盖防抖参数与 `onModuleDestroy()` 关闭连接、移除 upgrade 监听、flush 待保存内容；真实 SIGTERM 内容不丢失随 P4 端到端协作验证复核

- [x] **P3-4** 协作会话与导入/WebDAV 互斥联动
  - 验证 P1-3（TaskWorker）和 P1-4（WebDAV）的互斥检查与 P3-2 的会话注册联动
  - 导入任务冲突时标记 `failed`；WebDAV PUT 冲突时返回 423
  - 状态：已完成，验证命令 `pnpm --filter server test -- task-worker.service webdav.service document-collab.gateway document-session-registry`、`pnpm --filter server typecheck`
  - **验收**：测试使用真实 `DocumentSessionRegistry.register('kb-1', 'node-doc', 'collab-conn-1', 'write')` 模拟协作编辑中的可写会话；导入任务失败并提示"目标节点正在被协作编辑"，WebDAV PUT 返回 `423 Locked`，且两个入口均未继续覆盖 OpenViking 资源

- [x] **P3-5** WebSocket 路径排除全局前缀（补充项 S3）
  - 文件：`apps/server/src/main.ts`
  - 在 `setGlobalPrefix('api', { exclude: [...] })` 中追加 `{ path: 'collab', method: RequestMethod.ALL }`
  - 状态：已完成，使用 `DOCUMENT_COLLAB_ROUTE_PATH` 常量配置，验证命令 `pnpm --filter server test -- document-collab.gateway document.module`、`pnpm --filter server typecheck`
  - **验收**：`ws://host/collab` 不进入 `/api` 全局前缀；真实 WebSocket 连接随 P4 端到端协作验证复核

### P4：前端编辑器与入口

目标：文档节点可进入编辑器，普通查看者只读，图片粘贴和渲染可用。

- [x] **P4-1** 安装前端编辑器依赖
  - 已安装 `@blocknote/core@0.50.0`、`@blocknote/react@0.50.0`、`@blocknote/mantine@0.50.0`、`@mantine/core@9.2.0`、`@mantine/hooks@9.2.0`、`@hocuspocus/provider@4.0.0`、`yjs@13.6.30`
  - 已验证 `@blocknote/react@0.50.0` peer 支持 React 19，`@blocknote/mantine@0.50.0` peer 由 Mantine 9.2.0 显式满足
  - 已用 `apps/web/package.json` 和 `pnpm-lock.yaml` 固定版本；`y-websocket` 不再作为前端生产依赖
  - 状态：已完成，P4-4 迁移后已重新执行 `pnpm --filter web typecheck`、`pnpm --filter web build`
  - **验收**：前端 typecheck 和生产构建均无报错

- [x] **P4-2** 新增编辑页路由
  - 历史文件：`apps/web/app/console/knowledge-tree/[nodeId]/edit/page.tsx`（已在 P5 删除）
  - 复用控制台登录态和 JWT 鉴权，但编辑页不得复用控制台侧栏、Bento 卡片拼贴和 `px-6 py-8` 主内容布局
  - 页面加载时调用 `GET /api/v1/editor/:nodeId` 获取元数据
  - 顶栏包含返回按钮、面包屑 `知识树 > 文档名`、文档名、协作者头像占位、保存状态和更多按钮
  - 正文区使用 S7 编辑器布局：全屏编辑器壳、无侧栏、居中内容区、`max-width: 720px`
  - 普通控制台页面仍保留现有侧栏和主内容布局，编辑页单独走沉浸式创作布局
  - 状态：已完成并在 P5 删除。历史验证已覆盖控制台内嵌页的登录态校验和沉浸式编辑壳；当前最终入口由 `site` 路由承接
  - **验收**：P4 证明了编辑器壳可落地；P5 已移除该历史路由

- [x] **P4-3** BlockNote 编辑器组件集成
  - 文件：`apps/web/components/document-editor/` 目录下新建组件
  - 集成 `@blocknote/react` + `@blocknote/mantine` 主题
  - 加载时调用 `GET /api/v1/editor/:nodeId/content` 获取初始内容
  - 手动保存调用 `PUT /api/v1/editor/:nodeId/content`
  - 状态：已完成，新增 `DocumentEditor` 组件、BlockNote/Mantine 主题覆盖和顶栏保存状态联动；当前由独立站点文档页承接该能力
  - **验收**：编辑器加载文档内容，编辑后可保存

- [x] **P4-4** HocuspocusProvider 协作 Provider 接入
  - 文件：`apps/web/components/document-editor/` 内新增或拆出协作 Provider 辅助模块，集中管理 WebSocket URL 构造、`document-store` fragment 常量、用户颜色和连接状态映射
  - 编辑页把元数据 `collab.path`、`collab.documentName`、`readOnly`、`canWrite` 传入 `DocumentEditor`
  - 使用 `readSessionToken()` 读取 JWT，通过 `new HocuspocusProvider({ url: serverUrl, name: documentName, document: yDoc, token })` 传给后端；token 缺失时显示中文错误，不建立空鉴权连接
  - serverUrl 从当前 origin 和 `collab.path` 构造，协议按 `http → ws`、`https → wss` 转换，`documentName` 仅作为 `name` 传给 Provider
  - BlockNote 协作配置使用 `provider`、`yDoc.getXmlFragment('document-store')`、当前用户信息和 `showCursorLabels: 'activity'`
  - 协作模式下不再并行调用 REST `PUT /api/v1/editor/:nodeId/content` 保存正文，避免被活跃协作会话互斥为 `423 Locked`；REST 内容读写只保留为非协作回退路径
  - 监听 Provider `status`、`synced`、`disconnect`、`close`、`authenticationFailed`，顶栏显示"协作连接中 / 已连接 / 同步中 / 已断开 / 连接失败"
  - `nodeId` 或 `documentName` 变化、页面卸载时断开 Provider 并释放当前 Y.Doc，防止重复连接和内存泄漏
  - 根据元数据中的 `readOnly` / `canWrite=false` 切换 BlockNote `editable=false`；服务端只读连接仍作为最终约束
  - 测试覆盖 URL 构造、token 参数、fragment 名、只读态、连接状态回调、Provider cleanup、协作模式不请求 REST 正文，以及顶栏自动同步/重连语义
  - 状态：已完成。历史 `WebsocketProvider` 实现已迁移为官方 `HocuspocusProvider`，前端辅助模块、单测和真实协议层 e2e runner 均已更新
  - 验证命令：`node --check apps/server/src/document/document-collab-realtime.e2e-runner.mjs`、`pnpm --filter server test -- document-collab.gateway document-collab-realtime.e2e`、`pnpm --filter web test -- components/document-editor/document-collaboration.spec.ts components/document-editor/document-editor.spec.tsx app/site/[kbId]/doc/[nodeId]/page.spec.tsx app/console/layout.spec.tsx`、`pnpm --filter server typecheck`、`pnpm --filter web typecheck`、`pnpm --filter web build`
  - **验收**：两个真实 `HocuspocusProvider` 客户端同时连接同一文档时内容实时同步，awareness 协作者状态可同步到另一端；只读用户无法编辑；断线状态不误报"已保存"；关闭编辑页后 WebSocket 连接被释放；runner 输出 `P4_S9_REALTIME_OK name=document:tenant-a:node-realtime`

- [x] **P4-5** 图片粘贴/拖拽上传
  - 使用 BlockNote `uploadFile` 钩子承接编辑器原生粘贴/拖拽图片行为；除非库能力不足，不额外手写 DOM paste/drop 分支
  - 调用 `POST /api/v1/editor/:nodeId/assets` 上传，前端 API endpoint 统一通过 helper 构造
  - 上传文件字段名使用后端 `DOCUMENT_ASSET_UPLOAD_CONFIG.FIELD_NAME` 对应的 `files`，前端集中定义常量
  - 前端先校验可内联格式和大小：PNG、JPG/JPEG、GIF、WebP，单文件不超过 10MB；最终仍以后端校验为准
  - SVG 不进入内联图片上传流程。后端仍可保存 SVG 附件，但在服务端清洗能力完成前，编辑器不得把 SVG 插入图片块
  - 仅 `canWrite=true` 且编辑器非只读时允许上传；只读模式拦截上传并给出中文提示
  - 上传过程中顶栏显示“图片上传中”，上传失败时显示中文错误并让编辑器保留当前内容
  - 上传成功后返回并写入 `assets/{filename}` 相对路径，不能写入绝对 URL、Blob URL、带 token 的临时地址或 OpenViking 内部 URI
  - 协作模式上传成功后的图片块进入 Y.Doc；非协作回退模式进入 REST blocks，二者最终都由 Markdown 转换保存为相对路径
  - 测试覆盖 endpoint 编码、FormData 字段名、格式/大小校验、只读拒绝、上传状态和协作/非协作两种编辑器配置
  - 状态：已完成，新增 `document-assets.ts` 辅助模块并接入 `DocumentEditor` 的 REST 与协作两种 `useCreateBlockNote` 配置；当前由独立站点文档页承接该能力
  - **验收**：合法图片可上传并在编辑器内容中形成 `assets/{filename}` 相对路径；只读用户不能上传；非法格式和超限体积显示中文错误；完整预览体验由 P4-6 关闭

- [x] **P4-6** 图片渲染与缓存
  - 编辑器解析 `assets/{filename}` 相对路径引用，并拒绝非 `assets/` 路径、空文件名和 `..` 路径穿越
  - 当前资产目录按单文件名扁平化处理，不保留多级子路径语义；请求前对文件名做 `encodeURIComponent`
  - 使用带 Bearer Token 的 fetch 请求 `GET /api/v1/editor/:nodeId/assets/{filename}`，不能把 JWT 放入 URL，也不能依赖普通 `<img src>` 直接访问受保护 API
  - 将响应 Blob 转为 Object URL 供 BlockNote 图片预览使用，并在 nodeId 变化、图片块移除或组件卸载时释放 Object URL
  - 利用后端返回的 `Cache-Control` 和 `ETag` 头做浏览器私有缓存；如果实现内存缓存，key 必须包含 `nodeId` 与相对路径
  - 图片加载失败时保留文档块并显示中文占位，不删除原始 Markdown 引用
  - SVG 按后端安全策略处理：未引入清洗前不以内联方式展示
  - 测试覆盖相对路径解析、认证 fetch、Object URL 释放、非法路径拒绝、SVG 不内联和失败占位
  - 状态：已完成，`document-assets.ts` 新增认证资产读取端点构造、相对路径白名单、Bearer Token fetch、Object URL 缓存和 `revokeAll()`；`DocumentEditor` 的 REST 与协作模式均已把 `resolveFileUrl` 传入 BlockNote，当前由独立站点文档页承接该能力
  - **验收**：保存后重新打开文档，PNG/JPG/GIF/WebP 图片正常渲染；浏览器二次请求可复用缓存；失败图片不会破坏正文结构；URL、日志和 Markdown 中均不出现 JWT

- [x] **P4-7** 知识树入口集成（补充项 S6）
  - 扩展现有 `POST /api/v1/knowledge-tree` 的请求 DTO，支持 `kind:'collection' | 'document'`，缺省值保持 `collection`
  - `kind:'document'` 时在 Controller/Service 内复用已有文档节点创建分支，生成 `vikingUri` 容器并保持 `contentUri=null`
  - 为知识树创建入口补齐后端角色校验：`tenant_operator` 及以上可创建目录或文档，`tenant_viewer` 不能只靠前端隐藏按钮
  - 前端 `KnowledgeNode` / `TreeNode` 类型补齐 `kind` 和 `contentUri`
  - 历史实现中，知识树页面曾为 `kind:'document'` 节点提供编辑按钮；P5 已移除该入口
  - "新建文档"调用现有 `POST /api/v1/knowledge-tree`（`kind:'document'`）→ 成功后直接跳转编辑页
  - `tenant_viewer` 及以上可进入编辑页（只读），`tenant_operator` 及以上可编辑
  - 普通目录节点不显示编辑入口；文档节点的查看、编辑和新建入口沿用现有权限提示风格
  - 新建文档不新增专用后端 API，继续复用 `POST /api/v1/knowledge-tree`，避免与知识树节点创建语义分叉
  - 新建成功后的首次内容持久化仍由协作保存的"情况 B"回写 `contentUri`；P5 起不再由控制台负责跳转文档页
  - 状态：已完成。后端新增知识树节点类型常量，`CreateNodeDto` 支持 `kind:'collection' | 'document'`，`KnowledgeTreeController.create()` 在 `kind:'document'` 时调用 `KnowledgeTreeService.createFile()` 并使用集中常量传入 Markdown 扩展名；创建接口使用 `RolesGuard` 限制 `tenant_operator` 及以上角色。前端补齐 `KnowledgeNode.kind/contentUri` 类型，知识树左侧新增"新建文档"按钮，文档节点显示编辑入口，创建成功后跳转编辑页。
  - 验证命令：`pnpm --filter server test -- knowledge-tree.controller knowledge-tree.service`、`pnpm --filter server typecheck`、`pnpm --filter web test -- app/console/knowledge-tree/page.spec.tsx app/console/layout.spec.tsx app/site/[kbId]/page.spec.tsx`、`pnpm --filter web typecheck`
  - focused 测试覆盖目录创建兼容、文档创建分派、viewer 创建被拒、文档节点编辑入口、目录节点无编辑入口、新建文档后跳转
  - **验收**：新建文档 → 空编辑器 → 输入内容 → 自动协作保存 → 重新打开内容不丢失；只读用户能进入但不能编辑；现有新建目录行为不回归

### P5：独立知识站点化

目标：把已完成的协作编辑内核迁移为独立站点形态，对齐飞书知识库、钉钉知识库的空间化协作方式。

- [x] **P5-1** 新增站点路由树与独立站点壳
  - 文件：`apps/web/app/site/page.tsx`、`apps/web/app/site/[kbId]/page.tsx`、`apps/web/app/site/[kbId]/doc/[nodeId]/page.tsx`、共享站点壳组件
  - 站点壳必须包含：顶栏（站点名、搜索、用户菜单）、左侧树导航、主内容区；不能复用控制台 13 项管理菜单
  - 首阶段路由固定为 `/site`、`/site/:kbId` 和 `/site/:kbId/doc/:nodeId`
  - 状态：已完成，新增 `apps/web/app/site/page.tsx`、`apps/web/app/site/[kbId]/page.tsx`、`apps/web/app/site/[kbId]/doc/[nodeId]/page.tsx` 和共享站点壳组件 `apps/web/components/knowledge-site/knowledge-site-shell.tsx`
  - 验证命令：`pnpm --filter web test -- app/site/page.spec.tsx app/site/[kbId]/page.spec.tsx app/site/[kbId]/doc/[nodeId]/page.spec.tsx`、`pnpm --filter web build`
  - **验收**：直接访问站点路由时，不出现控制台侧栏；桌面与移动端布局都能承载导航与正文

- [x] **P5-2** 站点登录跳转与会话复用
  - 复用现有会话与 JWT，但 `site` 路由必须有独立登录跳转语义
  - 未登录访问 `/site/*` 时跳转站点登录入口，并在登录后回跳原始 URL
  - 不能要求用户先进控制台再进入站点
  - 状态：已完成，登录页新增 `next` 回跳决策；站点壳未登录时会跳转 `/login?next=/site/...`
  - 验证命令：`pnpm --filter web test -- app/login/page.spec.tsx app/site/[kbId]/page.spec.tsx`
  - **验收**：未登录打开站点文档链接可完成登录并返回原文档

- [x] **P5-3** 站点首页与知识树导航
  - `/site` 需要提供知识空间首页视图：空间列表、最近打开、进入某个知识库空间的入口
  - `/site/:kbId` 需要提供知识库空间首页视图：站点名、最近打开、可继续阅读文档、树导航入口
  - 左侧导航使用现有知识树数据，不新增第二套树模型
  - 目录节点在站点壳中可展开/折叠；文档节点进入 `/site/:kbId/doc/:nodeId`
  - 状态：已完成，知识空间首页已提供空间列表与最近打开，知识库空间首页已提供站点名、最近打开、快速进入和左侧树导航
  - 验证命令：`pnpm --filter web test -- app/site/page.spec.tsx app/site/[kbId]/page.spec.tsx`、`pnpm --filter web build`
  - **验收**：用户可从站点首页进入任一文档，不必先进入控制台知识树

- [x] **P5-4** 文档页从控制台过渡到站点壳
  - 把当前 `/console/knowledge-tree/:nodeId/edit` 的编辑页能力迁移到 `/site/:kbId/doc/:nodeId`
  - 保留现有 `DocumentEditor`、`/api/v1/editor`、`HocuspocusProvider`、图片上传/预览实现，不重写协作内核
  - 阅读态与编辑态共享同一页面壳，只通过 `readOnly` / `canWrite` 控制工具栏和编辑能力
  - 状态：已完成，站点文档页已复用现有 `DocumentEditor`、`/api/v1/editor` 和 `HocuspocusProvider` 协作链路
  - 验证命令：`pnpm --filter web test -- app/site/[kbId]/doc/[nodeId]/page.spec.tsx components/document-editor/document-editor.spec.tsx components/document-editor/document-collaboration.spec.ts`、`pnpm --filter web build`
  - **验收**：站点文档页可只读查看、可写协作、上传图片、断线重连；控制台过渡页不再存在

- [x] **P5-5** 控制台入口移除
  - 删除 `/console/knowledge-tree/:nodeId/edit` 路由与对应测试
  - 移除知识树中的文档打开按钮与检查器中的文档打开按钮
  - 新建文档后不再从控制台跳转编辑页；后台仅保留节点治理能力
  - 控制台右上角新增全局 `进入知识空间`，打开 `/site`
  - `知识库管理` 列表页每行保留 `进入空间` 主按钮；`查看知识树` 与 `归档知识库` 收进二级菜单
  - 状态：已完成，控制台文档入口和旧编辑页代码已移除
  - 验证命令：`pnpm --filter web test -- app/console/layout.spec.tsx app/console/knowledge-tree/page.spec.tsx app/console/knowledge-bases/page.spec.tsx`、`pnpm --filter web build`
  - **验收**：普通用户主路径不再经过控制台；后台不再承载文档编辑入口；后台仍能通过全局入口或知识库管理页进入知识空间

- [x] **P5-6** 站点化验证与回归
  - focused 测试需要覆盖：站点壳无控制台侧栏、未登录站点跳转、站点首页树导航、文档页只读/可写、控制台入口改为站点入口
  - 生产验证需要覆盖：`pnpm --filter web typecheck`、`pnpm --filter web build`、`pnpm docs:check`
  - 若新增 server 只读聚合接口或站点入口 DTO，同步补 server focused 测试
  - 状态：已完成，站点首页、站点文档页、登录回跳、控制台入口移除均已补齐 focused 自动化验证
  - 验证命令：`pnpm --filter web test -- app/login/page.spec.tsx app/site/[kbId]/page.spec.tsx app/site/[kbId]/doc/[nodeId]/page.spec.tsx app/console/layout.spec.tsx app/console/knowledge-tree/page.spec.tsx`、`pnpm --filter web typecheck`、`pnpm --filter web build`、`pnpm docs:check`
  - **验收**：P5 路由、鉴权、入口迁移和 UI 壳均有自动化证据，不只依赖人工点击

- [x] **P5-7** 站点首页知识库治理与后台重命名入口

目标：让 `/site` 在“空间首页”之外直接承接知识库治理，同时把后台 `知识库管理` 的行级重命名入口补齐。

- [x] **P5-7-1** `/site` 支持新建知识库
  - 站点首页直接支持创建知识库，不再要求“请联系后台”
  - 继续复用 `POST /api/v1/knowledge-bases`
  - 状态：已完成，`apps/web/app/site/page.tsx` 已支持站点内新建知识库
  - **验收**：用户在 `/site` 可直接创建知识库并刷新空间列表

- [x] **P5-7-2** `/site` 支持重命名与归档知识库
  - 站点首页卡片支持重命名知识库、归档知识库
  - 继续复用 `PATCH /api/v1/knowledge-bases/:id`
  - 状态：已完成，`apps/web/app/site/page.tsx` 已补齐重命名与归档交互
  - **验收**：用户在 `/site` 内即可完成知识库名称维护和归档

- [x] **P5-7-3** 后台 `知识库管理` 补充重命名行级入口
  - 保留 `进入空间` 主按钮
  - 将 `重命名知识库` 收进行级二级菜单，避免主按钮区过长
  - 状态：已完成，`apps/web/app/console/knowledge-bases/page.tsx` 已补齐“重命名知识库”
  - **验收**：后台列表页可在不跳转详情页的情况下完成名称更新

- [x] **P5-7-4** 站点首页治理回归验证
  - focused 测试覆盖：新建知识库、重命名知识库、归档知识库、后台菜单重命名入口
  - 状态：已完成，已补齐 `app/site/page.spec.tsx` 与 `app/console/knowledge-bases/page.spec.tsx`
  - 验证命令：`pnpm --filter web test -- app/site/page.spec.tsx app/console/knowledge-bases/page.spec.tsx`
  - **验收**：`/site` 与后台知识库列表的治理入口均有自动化证据

### P6：站点内知识树治理

目标：让 `site/[kbId]/page.tsx` 在站点壳内直接支持知识树治理，不必回后台完成节点操作。

- [x] **P6-1** 站点专用树管理工作区
  - `site/[kbId]/page.tsx` 改为“站点概览 + 树治理工作区”双区结构
  - 站点专用树管理区必须自带：树列表、选中态、根目录拖拽投放区、治理操作入口
  - 不直接复用 `console/knowledge-tree` 页面组件
  - 状态：已完成，`apps/web/app/site/[kbId]/page.tsx` 已改为站点概览 + 树治理双区布局
  - **验收**：用户在站点内可完成树浏览与选中，不需要返回后台

- [x] **P6-2** 新增节点 / 新建文档
  - 站点页支持新增目录节点、新建文档
  - 继续复用 `POST /api/v1/knowledge-tree` 契约，`kind:'collection' | 'document'`
  - 新建文档后不自动跳后台，仍留在站点壳流程内
  - 状态：已完成，站点治理页已支持新增目录与新建文档，并在站点壳内刷新树状态
  - **验收**：站点内可新建目录和文档，列表刷新与站点左侧树同步

- [x] **P6-3** 节点与文档重命名
  - 站点页支持对目录节点与文档节点执行重命名
  - 继续复用 `PATCH /api/v1/knowledge-tree/:id`
  - 状态：已完成，站点治理页右侧检查面板已支持目录/文档重命名
  - **验收**：名称更新后，站点治理区与左侧目录树同步刷新

- [x] **P6-4** 节点与文档移动
  - 站点页支持拖拽移动目录节点和文档节点，包含拖到根目录
  - 继续复用 `PATCH /api/v1/knowledge-tree/:id/move`
  - 状态：已完成，站点治理页已支持拖拽到目录节点和根目录投放区
  - **验收**：移动成功后路径与树结构同步更新，非法自包含移动被阻止

- [x] **P6-5** ACL 管理
  - 站点页支持公开/私有切换、授权角色、额外授权用户配置
  - 继续复用 `PATCH /api/v1/knowledge-tree/:id` 的 `acl` 保存
  - 状态：已完成，站点治理页已支持 ACL 编辑、角色授权、用户授权与权限预览
  - **验收**：ACL 保存后权限预览和节点状态同步更新

- [x] **P6-6** 删除节点 / 删除文档
  - 站点页支持删除目录节点和文档节点
  - 继续复用 `DELETE /api/v1/knowledge-tree/:id`
  - 状态：已完成，站点治理页已支持删除目录/文档并刷新树
  - **验收**：删除成功后树刷新，目标节点从站点治理区和左侧树消失

- [x] **P6-7** 站点治理回归验证
  - focused 测试覆盖：新增节点、新建文档、重命名、拖拽移动、ACL 保存、删除
  - 补齐 `pnpm --filter web typecheck`、`pnpm --filter web build`、`pnpm docs:check`
  - 状态：已完成，已补齐 `app/site/[kbId]/page.spec.tsx`
  - 验证命令：`pnpm --filter web test -- app/site/[kbId]/page.spec.tsx`、`pnpm --filter web typecheck`、`pnpm --filter web build`、`pnpm docs:check`
  - **验收**：P6 能力有自动化证据，不依赖人工点击

---

## 依赖关系总览

```text
P1-1 ──┬── P1-2
       ├── P1-3
       └── P1-4

P2-1 ── P2-2 ──┬── P2-3
               ├── P2-4
               └── P2-5

P3-0 ──┐
       ├── P3-2 ──┬── P3-3
P3-1 ──┘          ├── P3-4
                  └── P3-5

P4-1 ── P4-2 ── P4-3 ── P4-4 ── P4-5 ── P4-6
          └────────────────────────────── P4-7

P4-2 ── P5-1 ── P5-3 ── P5-4 ── P5-6
P4-7 ──────────┘      └── P5-5 ──┘
P4-4 ───────────────────────┘
P2/P3 ──────────────────────┘（复用协作内核，不重写）

P1-1 ← P3-2（互斥联动）
P1-5 ← P3-3（shutdown hooks）
P2-3 ← P4-2（REST API 前置）
P2-4 ← P4-5（资产上传 API 前置）
S10  ← P4-6（认证图片渲染前置约束）
S11  ← P4-7（知识树入口边界）
S12  ← P5-1/P5-2/P5-3/P5-4/P5-5/P5-6（独立站点化边界）
```

## 约束声明

- **JWT 长会话**：P1-P3 期间接受"WebSocket 连接建立后权限变更不生效"的约束（补充项 S2），后续迭代评估刷新方案。
- **单实例限制**：P1-P2 阶段协作 WebSocket 限制为单实例部署。多实例需引入 Redis 共享层或 sticky session，不在当前范围。
- **Markdown 子集**：P1-P2 只承诺常规 Markdown 元素的往返保真。扩展块（任务列表、嵌入卡片等）需先定义降级规则再进入生产写入链路。
- **资产路径 SSOT**：正文只保存 `assets/{filename}` 相对路径；预览所需 Object URL 只是浏览器运行态，不得写入 Markdown、Y.Doc 持久化内容或审计日志。
