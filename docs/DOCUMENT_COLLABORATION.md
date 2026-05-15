# 在线文档协作

本文说明 OpenViking Admin 在线文档协作能力的技术设计，包括存储模型、协作引擎、权限、媒体资源和持久化规则。

## 定位

文档协作最终要以“独立知识站点”形态交付，而不是长期停留在控制台子页。文档仍然是知识节点的一种内容类型，但用户侧体验必须对齐飞书知识库、钉钉知识库这类空间化协作产品：独立站点壳、左侧树导航、站点级搜索与分享、文档页内沉浸式编辑。

核心约束：

- 后端在现有 `apps/server` (NestJS) 上增量扩展模块。
- 文档内容的底层存储直接使用 OpenViking，不在 PostgreSQL 另建内容表。
- 文档写入 OpenViking 后，搜索、QA、WebDAV、MCP 全链路自动生效。

## 实施基线与分期

当前代码已经具备以下基础能力：

- `KnowledgeTreeService.syncContentUri()` 已作为内部 `contentUri` 回写入口存在，公开 `update()` 仍然保护 `kind`、`vikingUri`、`contentUri` 不被外部 API 修改。
- WebDAV 覆盖已有文档时已经采用 Atomic Swap：上传临时文件、注入新正文叶子、切换 `contentUri`、异步删除旧正文叶子。协作保存应复用同一类策略，不再设计第二套覆盖语义。
- `DocumentSessionRegistry` 已注册到 `CommonModule`，并区分只读会话和可写会话。
- 知识树、知识库、导入 Worker 和 WebDAV 已接入协作会话互斥检查。
- NestJS shutdown hooks 已启用，可支撑后续 Hocuspocus 网关在优雅关闭时 flush 待保存内容。
- `DocumentContentCodec` 已实现 Markdown ↔ BlockNote JSON 子集转换，支持标题、段落、有序/无序列表、引用、代码块、链接、图片和分隔线。
- `DocumentService` 已实现文档元数据读取、正文读取、Atomic Swap 保存、资产上传和资产读取。
- `DocumentController` 与媒体上传安全配置已实现 focused 测试覆盖，REST 路由契约以 `/api/v1/editor` 为准。
- `DocumentModule` 已注册到 `AppModule`，`/api/v1/editor` REST 入口已进入运行时路由表并受 JWT 保护。
- WebDAV 覆盖 PUT 与协作保存已对齐为 Atomic Swap：只替换正文叶子，不清空文档容器，因此不会删除 `assets/` 子目录。
- 后端协作依赖已完成安装并锁定版本：`@hocuspocus/server@4.0.0`、`crossws@0.4.5`、`yjs@13.6.30`、`y-protocols@1.0.7`。其中 `@hocuspocus/server@4.0.0` 要求 Node.js `>=22`，当前本地验证环境为 Node.js `v24.14.1`，CI 与生产 Docker 构建基线已同步为 Node.js 24。
- P3-0 已验证 Hocuspocus 可通过 NestJS 底层 HTTP server 的 `upgrade` 事件接入 `/collab` WebSocket，并且不额外占用独立端口。
- `DocumentCollabGateway` 已实现后端协作主链路：动态加载 Hocuspocus/crossws，挂载 `/collab` upgrade，校验 JWT、租户 scope、ACL 和写入角色，注册/注销协作会话，并通过 `DocumentService` 完成 Y.Doc 与 OpenViking Markdown 的读写。
- `DocumentContentCodec` 已补齐 Markdown/BlockNote blocks 与 Y.Doc 的转换能力，服务端使用 `@blocknote/core/yjs` 的 `blocksToYDoc` / `yDocToBlocks`，协作 fragment 名固定为 `document-store`。
- `main.ts` 已将 `DOCUMENT_COLLAB_ROUTE_PATH` 排除在全局 `/api` 前缀之外，`ws://host/collab` 作为协作 WebSocket 入口。
- Hocuspocus 防抖保存和优雅关闭 flush 已接入 `DocumentCollabGateway.onModuleDestroy()`，依赖 P1 已启用的 NestJS shutdown hooks。
- P4-2 编辑页路由已作为过渡态完成历史使命：曾用 `/console/knowledge-tree/:nodeId/edit` 承接 P4 能力验证；在独立站点化完成后，该路由和对应控制台编辑入口已移除。
- P4-3 BlockNote 编辑器组件已落地：`DocumentEditor` 使用 `@blocknote/react` + `@blocknote/mantine` 加载 `GET /api/v1/editor/:nodeId/content` 返回的 blocks，编辑后进入未保存状态，顶栏手动保存调用 `PUT /api/v1/editor/:nodeId/content`，只读文档会锁定编辑器。
- P4-4 协作 Provider 已完成：前端使用 `@hocuspocus/provider@4.0.0` 的 `HocuspocusProvider`，协作模式通过元数据 `collab.path` 与 `collab.documentName` 创建 Provider，JWT 通过 `token` 配置传给 Hocuspocus `onAuthenticate`。真实协议层 e2e 已覆盖两个 Provider 客户端的正文同步和 awareness 协作者状态同步。
- P4-5 图片粘贴/拖拽上传已落地：`DocumentEditor` 的 REST 与协作模式均通过 BlockNote `uploadFile` 钩子上传图片到 `POST /api/v1/editor/:nodeId/assets`，前端只允许 PNG/JPG/JPEG/GIF/WebP 内联，字段名固定为 `files`，上传成功后写入 `assets/{filename}` 相对路径，只读模式会拒绝上传并给出中文提示。
- P4-6 图片渲染与缓存已落地：`DocumentEditor` 的 REST 与协作模式均通过 BlockNote `resolveFileUrl` 解析 `assets/{filename}`，前端使用 Bearer Token fetch 受保护资产端点，再生成 Object URL 供编辑器预览，并在编辑器卸载时释放 Object URL。
- P4-7 知识树入口已落地：现有 `POST /api/v1/knowledge-tree` 已支持 `kind:'collection' | 'document'`，缺省保持目录创建语义；`kind:'document'` 时创建文档节点容器并保持 `contentUri=null`。进入 P5 后，控制台不再承担文档打开入口，独立站点成为唯一文档使用入口。

P4 前端编辑器与入口能力已完成到 P4-7，并通过 focused 测试、真实协议层 e2e、类型检查和生产构建验证。P5 独立站点化已经在此基础上完成：独立站点壳、站点首页、文档页、登录回跳和控制台入口移除均已落地。

实施顺序按风险由低到高推进：

| 阶段 | 目标 | 验证重点 |
|------|------|------|
| P1 | 增加 `DocumentSessionRegistry`、互斥检查和 shutdown hooks | 导入、WebDAV、删除、移动在活跃协作会话下返回明确冲突 |
| P2 | 增加 `DocumentService` 与 `/api/v1/editor` REST API | Markdown 读取、Atomic Swap 保存、资产上传下载可独立测试 |
| P3 | 接入 Hocuspocus WebSocket 协作网关 | 鉴权、只读模式、防抖保存、优雅关闭 flush、互斥联动 |
| P4 | 新增前端编辑页与知识树入口 | 已完成：文档节点可进入编辑器，普通查看者只读，图片粘贴和渲染可用，协作 Provider 已通过真实协议层验收 |
| P5 | 独立站点化 | 已完成：空间首页、站点壳、独立路由、站点导航、站点登录跳转、控制台入口移除 |

P1/P2/P3/P4/P5 已完成。最终交付形态已经从控制台子页迁移到独立站点：现有能力在不重写协作内核的前提下，已经搬到独立站点壳中，对齐飞书知识库、钉钉知识库的空间化协作方式。

## 架构分层

```text
┌───────────────────────────────────────────────────────────────┐
│ 编辑器层 (apps/web)                                            │
│ BlockNote 编辑器、Y.js Client、WebSocket Provider              │
├───────────────────────────────────────────────────────────────┤
│ 协作层 (apps/server/document)                                  │
│ Hocuspocus WebSocket Gateway、会话管理、格式转换               │
├───────────────────────────────────────────────────────────────┤
│ 元数据层 (apps/server/knowledge-tree)                          │
│ knowledge_nodes (kind:'document')、ACL、树形结构               │
├───────────────────────────────────────────────────────────────┤
│ 内容存储层 (OpenViking)                                        │
│ vikingUri 容器目录、contentUri 正文叶子文件、assets/ 附件       │
└───────────────────────────────────────────────────────────────┘
```

各层职责：

| 层 | 职责 | 新增 / 复用 |
|------|------|------|
| 编辑器 (BlockNote) | 富文本 UI、块级操作、斜杠菜单 | 新增前端组件 |
| 协作 (Y.js + Hocuspocus) | CRDT 冲突解决、多人光标同步、防抖合并 | 新增 `document/` 模块 |
| 元数据 (KnowledgeTree) | 文档节点 `kind:'document'`、权限、树形结构 | 复用现有 |
| 内容存储 (OpenViking) | 文档正文读写、图片存储、向量化索引 | 复用现有 |
| 搜索/QA | 文档内容在 OpenViking 中自动被索引 | 复用现有 |
| WebDAV/MCP | 第三方客户端访问文档 | 复用现有 |

## 存储模型

### vikingUri 与 contentUri 的精确语义

这两个字段的含义不同，必须区分使用：

| 字段 | 生成时机 | 格式示例 | 含义 |
|------|------|------|------|
| `vikingUri` | 节点创建时自动生成 | `viking://resources/tenants/{tenantId}/{kbId}/{nodeId}/` | OpenViking 中的**资源容器目录**，以 `/` 结尾 |
| `contentUri` | 导入完成后 Worker 回写；首次协作保存后也须回写 | `viking://resources/tenants/{tenantId}/{kbId}/{nodeId}/文件名.md` | 容器内的**正文叶子文件** |

容器目录下的资源布局：

```text
viking://resources/tenants/{tenantId}/{kbId}/{nodeId}/   ← vikingUri (容器)
├── content.md           ← contentUri 指向的正文叶子文件
└── assets/              ← 附件子目录
    ├── screenshot.png
    └── diagram.svg
```

### 为什么不建 `documents` 表

OpenViking 本身就是 Context Database，已承载所有文档原始内容。现有的 WebDAV、导入任务、搜索链路都以 `vikingUri` / `contentUri` 为内容寻址。在 PostgreSQL 另存内容会引入冗余和一致性负担。

| 关注点 | 解法 |
|------|------|
| 文档内容存储 | OpenViking — 正文通过 `contentUri` 寻址 |
| 文档元数据 | `knowledge_nodes` — 已有 `kind`、`name`、`vikingUri`、`contentUri`、`acl` |
| 版本历史 | OpenViking 资源版本能力 |
| 协作会话状态 | Y.js 运行时内存，按规则持久化到 OpenViking（见"持久化规则"） |
| 搜索索引 | 内容已在 OpenViking 中，搜索链路天然覆盖 |

### 知识节点数据模型

`knowledge_nodes` 表字段参见 [数据库 Schema](./DATABASE_SCHEMA.md)。协作相关的关键字段：

- `kind`：`'document'` 表示文档节点，`'collection'` 表示目录节点。
- `vikingUri`：资源容器目录 URI，以 `/` 结尾。不可直接读写内容。
- `contentUri`：正文叶子文件 URI。WebDAV 和编辑器读取内容时优先使用此字段。导入完成后由 Worker 回写；首次协作保存也须回写。
- 若历史脏数据把 `contentUri` 误指向 `assets/` 下的图片或其他非 `.md` 资源，编辑器与协作读取必须按“无正文”处理，不能把二进制资产当 Markdown 解析，也不能在后续正文保存时把该资产当旧正文删除。
- `acl`：控制节点可见性（见"权限模型"）。

## 协作引擎

### 编辑器选型

选用 BlockNote（基于 Tiptap → ProseMirror）。设计文档只记录选型决策，最终依赖版本以 `package.json` 和 lockfile 为准。

| 能力 | 说明 |
|------|------|
| 块级编辑 | 斜杠命令、块拖拽排序、嵌套块结构 |
| Y.js 协作 | 原生支持多人编辑和光标同步 |
| Markdown 转换 | 内建 Markdown ↔ JSON 双向转换 |
| 可扩展 | 可降级到 Tiptap 层做自定义块类型 |

### Hocuspocus 集成

将 Hocuspocus 协作服务嵌入 NestJS 进程，作为 WebSocket Gateway。P3-0 Spike 已确认不能直接使用 `@hocuspocus/server` 的 `Server` 类作为嵌入入口，因为该类会自建 HTTP server。当前生产实现已使用 `Hocuspocus` 核心类，并通过 `crossws/adapters/node` 接管现有 NestJS HTTP server 的 `upgrade` 事件。

```text
浏览器编辑器
  <-- WebSocket --> Hocuspocus (NestJS 内)
                      |-- onAuthenticate: 验证 JWT + 检查角色 + 检查节点 ACL
                      |-- onLoadDocument: 从 OpenViking 读取 contentUri → 转为 Y.js Doc
                      |-- onStoreDocument: Y.js Doc → Markdown → 覆写 contentUri → touch 节点
```

WebSocket 鉴权采用 Hocuspocus Provider 的 token 传递能力，客户端把当前 JWT 作为连接参数传入，服务端在 `onAuthenticate` 中校验。由于浏览器原生 WebSocket 不能稳定设置自定义 `Authorization` Header，服务端日志和追踪中必须对 token 参数脱敏，不能把完整 JWT 写入访问日志、错误日志或审计 meta。

Hocuspocus 4 与 crossws 都是 ESM 优先包，当前 server 的 Jest/CommonJS 运行时不能静态 import。`DocumentCollabGateway` 在模块初始化时通过 `importEsmModule()` 动态加载 `@hocuspocus/server` 与 `crossws/adapters/node`，避免构建和测试环境进入 CJS 入口后触发 ESM 解析错误。

协作文档名使用稳定格式：

```text
document:{tenantId}:{nodeId}
```

`tenantId` 来自 JWT 解析后的租户上下文，`nodeId` 来自前端路由和服务端节点查询结果。服务端不得信任客户端自行传入的租户标识。

### 内容读写路径

协作的内容读写与导入任务使用不同路径，以避免触发容器清理。

**读取（onLoadDocument）**：

通过 `contentUri` 读取正文叶子文件：

```text
OVClientService.requestStream(conn,
  "/api/v1/content/download?uri={contentUri}")
→ Markdown 文本
→ 转为 BlockNote JSON
→ 初始化 Y.js Document
```

若 `contentUri` 为 null（新建文档尚未写入过内容），初始化空 Y.js Document。

**写入（onStoreDocument）**设计约束：文档编辑不会通过数据库记录多版本，不保留历史快照，完全依赖客户端的编辑历史撤销，只保证覆盖时的绝对安全，保证 `contentUri` 是唯一权威正文指针，孤儿叶子由后台清理。

导入/WebDAV 创建的文档可能原本是 `说明.md`、`README.md` 等其他文件名，如果协作保存固定注入 `content.md`，会在容器内形成多个正文叶子文件。而 Worker 的 `syncDocumentContentUri` 明确要求叶子数恰好等于 1（`task-worker.service.ts:469`），多叶子会导致 contentUri 回写失败。

写入流程分两种情况：

**情况 A：已有 contentUri（原子覆盖已有叶子）**

为了彻底杜绝"删旧文件后注入失败"导致的数据丢失，覆盖操作必须采用两阶段的原子交换（Atomic Swap）模式：

```text
1. 先上传新内容到暂存区，获取临时文件 ID：
   OVClientService.uploadTempFile(conn,
     "/api/v1/resources/temp_upload",
     { fileName: "content-{timestamp}.md", buffer: markdownBuffer })
   → 返回 { temp_file_id: "xxx" }

2. 将新文件注入到容器（使用带有时间戳的新文件名，避免与旧文件冲突）：
   OVClientService.request(conn,
     "/api/v1/resources", "POST",
     { temp_file_id: "xxx",
       to: "{vikingUri}",
       reason: "collab-save" })
   → 注入成功，此时容器内同时存在新旧两个叶子

3. 原子切换指针：
   KnowledgeTreeService.syncContentUri(nodeId, newLeafUri, tenantScope)
   → knowledge_nodes.contentUri 指向新文件，旧文件彻底失效

4. 异步清理：删除旧叶子（即便失败也只是产生垃圾文件，不丢数据）：
   OVClientService.request(conn,
     "/api/v1/fs?uri={oldContentUri}&recursive=false", "DELETE")
```

*注：此机制保证了 0 丢失窗口。如果第 2 步失败，旧文件未受任何影响；如果第 3 步失败，数据库仍指向旧文件；如果第 4 步失败，系统可以容忍孤儿叶子文件存在，此时 `contentUri` 仍然是唯一权威正文指针。孤儿文件后续可由后台清理脚本处理。*

**情况 B：contentUri 为 null（首次写入）**

首次保存的文档使用固定文件名 `content.md`：

```text
1. OVClientService.uploadTempFile(conn,
     "/api/v1/resources/temp_upload",
     { fileName: "content.md", buffer: markdownBuffer })
   → 返回 { temp_file_id: "xxx" }

2. OVClientService.request(conn,
     "/api/v1/resources", "POST",
     { temp_file_id: "xxx",
       to: "{vikingUri}",
       reason: "collab-save" })

3. 查询容器叶子文件并回写 contentUri：
   OVClientService.request(conn,
     "/api/v1/fs/tree?uri={vikingUri}&depth=1", "GET")
   → 找到正文叶子文件 URI

4. KnowledgeTreeService.syncContentUri(nodeId, leafUri, tenantScope)
   → 更新 knowledge_nodes.contentUri
```

**关键差异**：协作保存**不经过 `importTaskService.createLocalUpload`**，而是由 `DocumentService` 直接调用 `OVClientService`。绕过导入链路中 `prepareDocumentTarget` 的 `DELETE recursive` 清空容器行为，附件（`assets/`）不会被删除。

**contentUri 回写的内部方法**：

`KnowledgeTreeService.update()` 的 `IMMUTABLE_FIELDS` 保护机制会拒绝通过公开 API 修改 `contentUri`。设计方案：

- 新增 `KnowledgeTreeService.syncContentUri(nodeId, contentUri, tenantScope)` 内部方法。
- 该方法仅供 `DocumentService` 和 `TaskWorkerService` 调用，不暴露到 Controller。
- Worker 现有的 `nodeRepo.update(node.id, { contentUri })` 直接 repository 调用应迁移到此方法，统一入口。

```text
touch 节点：
5. KnowledgeTreeService.touch(nodeId, tenantScope)
   → 更新 updatedAt 时间戳
```

### 内容格式转换

| 环节 | 输入 | 输出 |
|------|------|------|
| 打开文档 | OpenViking 中的 Markdown | Y.js Document (CRDT) |
| 编辑中 | Y.js 增量操作 | 内存中的 CRDT 状态 |
| 保存文档 | Y.js Document | Markdown → temp_upload → 注入到容器 |

Markdown 是与 OpenViking 交互的通用格式。其他渠道（WebDAV、导入）写入的 Markdown 文档也能被编辑器正确加载。

格式转换必须收口到同一组件，供 REST 保存和 Hocuspocus 保存共同调用。推荐命名为 `DocumentContentCodec`，职责只包含：

- Markdown → BlockNote JSON。
- BlockNote JSON → Markdown。
- Y.js Doc → BlockNote JSON。
- BlockNote JSON → Y.js Doc。

当前服务端实现将 BlockNote JSON 表达为受控 `DocumentBlock[]`，并通过 `@blocknote/core/yjs` 的 `blocksToYDoc` / `yDocToBlocks` 与 Y.Doc 互转。协作 fragment 名固定为 `document-store`，必须与前端 BlockNote 协作配置保持一致。

P1/P2 只承诺常规 Markdown 元素：标题、段落、有序列表、无序列表、引用、代码块、链接、图片和分隔线。自定义块、嵌入卡片和任务列表等扩展块必须先定义 Markdown 降级规则，再进入生产写入链路。无法稳定降级的内容不得写入 OpenViking 正文。

任何保存入口都不得直接把 Y.js 二进制状态写入 PostgreSQL 或 OpenViking 正文资源。Y.js 只用于协作运行态，OpenViking 中的正文仍以 Markdown 为准。

## 持久化与一致性规则

### 防抖保存

Hocuspocus `onStoreDocument` 使用防抖策略，避免每次按键都触发写入：

| 参数 | 值 | 说明 |
|------|------|------|
| `debounce` | 30000 ms | 最后一次编辑后 30 秒触发持久化 |
| `maxDebounce` | 60000 ms | 编辑持续不停时的最大等待时间 |

### 服务关闭前 flush

Hocuspocus 有两个类：

- `Server`：管理 HTTP 服务器和 WebSocket 升级。`Server.destroy()` 会关闭 HTTP 连接、断开所有 WebSocket 客户端、调用 `hocuspocus.flushPendingStores()` 立即执行所有待定的 `onStoreDocument`，然后等待所有文档卸载完成后触发 `onDestroy` 钩子。
- `Hocuspocus`：核心协作引擎，管理文档和连接。`Hocuspocus.flushPendingStores()` 遍历所有活跃文档，立即执行任何被防抖延迟的 `onStoreDocument` 回调。

NestJS 集成方式：

1. 在 `main.ts` 调用 `app.enableShutdownHooks()`，让 SIGTERM、SIGINT 等信号触发模块销毁流程。
2. 在 `DocumentCollabGateway.onModuleDestroy()` 中移除 HTTP server 的 `upgrade` 监听，关闭 crossws 连接，并调用 Hocuspocus 实例的 `closeConnections()` + `flushPendingStores()`，确保优雅关闭时所有编辑都被持久化。

缺少第 1 步时，`onModuleDestroy()` 不一定在容器停止时执行，不能承诺优雅关闭零丢失。

### 丢失窗口

| 场景 | 最大丢失量 | 说明 |
|------|------|------|
| 优雅关闭（SIGTERM） | 0 | `flushPendingStores()` 会立即执行所有待定保存 |
| 进程崩溃 / OOM / 强杀 | `maxDebounce` (60 秒) | 连续编辑场景下，防抖尚未触发的最大窗口 |
| 空闲后崩溃 | `debounce` (30 秒) | 最后一次编辑后的防抖等待窗口 |

### 导入/WebDAV 覆盖冲突

导入和协作不能同时写入同一文档节点。`DocumentSessionRegistry` 维护活跃协作会话的节点、知识库和连接模式。

会话分两类：

| 会话类型 | 来源 | 对正文写入的影响 | 对删除/移动的影响 |
|------|------|------|------|
| 只读会话 | `tenant_viewer` 或无写权限用户打开编辑页 | 不阻塞导入和 WebDAV PUT | 阻塞节点、子树和知识库删除/移动 |
| 可写会话 | `tenant_operator` 及以上打开可编辑文档 | 阻塞导入和 WebDAV PUT | 阻塞节点、子树和知识库删除/移动 |

互斥检查位置：

| 危险点 | 位置 | 检查时机 |
|------|------|------|
| `KnowledgeBaseService.remove()` | 知识库删除 | 删除前检查该 KB 下是否有任何节点的活跃协作会话 |
| `KnowledgeTreeService.remove()` | 节点或子树删除 | 删除前检查目标节点和所有后代是否有任意活跃会话 |
| `KnowledgeTreeService.update()` / move | 节点移动、重命名或路径变化 | 移动前检查目标节点和所有后代是否有任意活跃会话 |
| `TaskWorkerService.prepareDocumentTarget()` | 导入 Worker 执行前 | Worker 对 `kind:'document'` 节点执行 `DELETE recursive` 清空容器前，**必须二次检查**是否有可写协作会话 |
| `WebdavService.overwritePutFile()` | WebDAV PUT 覆盖 | WebDAV 写入已绕过导入任务排队，因此**必须在覆盖写入前**立即检查是否有可写协作会话 |
| `WebdavService.delete()` / `move()` | WebDAV 删除或移动 | 执行前检查目标节点和子树是否有任意活跃会话 |
| 导入任务创建 | `ImportTaskService.createLocalUpload()` | 可做预检，但因 pending 任务和新开协作会话之间存在竞态，Worker 执行前的二次检查不可省略 |

当检测到冲突时，导入任务标记为 `failed`（原因："目标节点正在被协作编辑"），WebDAV PUT 返回 423 Locked。

### 多实例部署

P1/P2 阶段限制协作 WebSocket 入口为单实例。生产多实例部署需要：

- 方案 A：Hocuspocus 前加 Redis 共享层（`@hocuspocus/extension-redis`），多实例共享 CRDT 状态。
- 方案 B：负载均衡器按 documentName 做 sticky session，确保同一文档的所有连接路由到同一实例。

当前不引入 Redis 依赖，P1/P2 按单实例运行。

## 权限模型

### ACL 与角色的关系

当前权限体系有两个正交维度：

| 维度 | 机制 | 说明 |
|------|------|------|
| **可见性** | `knowledge_nodes.acl` (jsonb) | `{ roles, users, isPublic }` — 控制用户能否看到该节点 |
| **写入能力** | 用户角色 (`users.role`) | `tenant_operator` 及以上才能写入 — 对齐 WebDAV 约束 |

### 操作权限矩阵

| 操作 | ACL 条件 | 角色条件 | 编辑器行为 |
|------|------|------|------|
| 查看文档 | 节点可见 | `tenant_viewer` 及以上 | 只读模式 |
| 编辑正文 | 节点可见 | `tenant_operator` 及以上 | 读写模式 |
| 上传附件 | 节点可见 | `tenant_operator` 及以上 | 允许粘贴/拖拽图片 |
| 删除附件 | 节点可见 | `tenant_operator` 及以上 | — |
| 创建文档节点 | 父节点可见 | `tenant_operator` 及以上 | 知识树"新建文档"，后端必须兜底校验 |

### Hocuspocus 鉴权流程

```text
1. 客户端 WebSocket 连接携带 JWT Token
2. onAuthenticate:
   a. AuthService 验证 Token → 获取 user { id, role, tenantId }
   b. KnowledgeTreeService.findOne(nodeId, tenantScope) → 获取节点
   c. 检查 ACL 可见性（roles/users/isPublic）
   d. 检查角色：role >= tenant_operator → readOnly: false
                 role == tenant_viewer  → readOnly: true
   e. 不满足 ACL → 拒绝连接
```

## 媒体资源处理

### 图片存储

图片等媒体资源存储在文档节点 vikingUri 容器的 `assets/` 子目录下。Markdown 中使用相对路径引用，示例语法：

```text
![截图](assets/screenshot.png)
```

### 上传流程

1. 用户在编辑器中粘贴或拖拽图片，BlockNote 通过 `uploadFile` 钩子把单个 `File` 交给前端上传逻辑。只有编辑器库无法覆盖的场景，才补充原生 paste/drop 事件处理。
2. 前端先做轻量校验：内联图片只允许 `.png`、`.jpg`、`.jpeg`、`.gif`、`.webp` 且不超过 10MB；SVG 不进入内联图片流程。
3. 编辑器调用 `POST /api/v1/editor/:nodeId/assets`（multipart/form-data），文件字段名固定为 `files`，与后端 `DOCUMENT_ASSET_UPLOAD_CONFIG.FIELD_NAME` 保持一致。
4. 后端调用 `OVClientService.uploadTempFile` 上传临时文件，再通过 `/api/v1/resources` 注入到 `{vikingUri}assets/` 路径。
5. 后端返回 `assets/{generatedFileName}` 相对路径，编辑器只把该相对路径写入图片块，不写入绝对 URL、Blob URL、带 token 的临时地址或 OpenViking 内部 URI。
6. 协作模式下，图片块进入 Y.Doc 并由 Hocuspocus 保存；非协作回退模式下，图片块随 REST blocks 保存。两条路径最终都由同一套 Markdown 转换写回图片引用，其中 URL 字段为 `assets/{generatedFileName}`。

### 渲染流程

1. 编辑器解析到 `assets/{generatedFileName}` 相对路径引用。
2. 前端只代理 `assets/` 下的单文件名资源：去掉 `assets/` 前缀后对文件名做 `encodeURIComponent`，再请求 `GET /api/v1/editor/:nodeId/assets/{filename}`。当前资产目录是扁平结构，不保留多级子路径语义。
3. 资产读取端点受 JWT 保护，普通 `<img src="/api/v1/editor/...">` 不能携带 `Authorization` Header。前端渲染必须通过带 Bearer Token 的 `fetch` 拉取资源，再生成临时 Object URL 给编辑器预览；如果后续改为 Cookie 鉴权或短期签名 URL，必须重新评审 token 暴露和缓存策略。
4. 后端调用 `OVClientService.requestStream` 从 OpenViking 流式读取，并设置 `Cache-Control`、`ETag` 和必要的安全响应头。前端 fetch 层可以复用浏览器私有缓存，但 Object URL 生命周期必须在节点切换或组件卸载时释放。
5. 图片加载失败时保留原始图片块和相对路径，显示中文占位或错误状态，不删除正文中的 Markdown 引用。

### 清理

删除文档节点时，`KnowledgeTreeService.remove()` 已经递归删除 OpenViking 容器下的所有子资源，附件自动清理。

### WebDAV 覆盖行为对齐

原有的 `WebdavService.overwritePutFile()` 会使用 `prepareDocumentTarget` 导致容器和附件（`assets/`）被清空。
既然协作保存明确了“只替换正文叶子”的策略，WebDAV PUT 作为另一个正文编辑入口也必须迁移到相同策略：
- WebDAV PUT 覆盖已有文档时，只替换 `contentUri` 叶子文件，不触发递归删除。
- 完整的容器清空仅限于 ImportTask 导入（全量同步知识源的场景）。
这保证了用户通过本地编辑器（如 Obsidian via WebDAV）保存 Markdown 后，控制台上的图片资源不会丢失。

### 上传配置

媒体上传使用独立配置（`DOCUMENT_ASSET_UPLOAD_CONFIG`），与导入上传配置（`LOCAL_IMPORT_UPLOAD_CONFIG`）完全分离。导入配置的 `ALLOWED_EXTENSIONS` 只包含 `.pdf`、`.md`、`.json`、`.doc`、`.docx` 等文档格式，不含任何图片格式。

```text
DOCUMENT_ASSET_UPLOAD_CONFIG
  FIELD_NAME:           'files'
  MAX_FILES:            10
  MAX_FILE_SIZE_BYTES:  10 * 1024 * 1024 (10MB)
  ALLOWED_EXTENSIONS:   .png, .jpg, .jpeg, .gif, .webp, .svg
  ALLOWED_MIME_TYPES:   image/png, image/jpeg, image/gif, image/webp, image/svg+xml
```

SVG 安全策略：SVG 可能包含 `<script>` 标签。代理返回 SVG 时强制设置 `Content-Disposition: attachment` 或使用 DOMPurify 清洗。

P1/P2 默认采用强制下载策略：上传 API 允许 `.svg` 和 `image/svg+xml`，但读取代理返回 SVG 时必须设置 `Content-Disposition: attachment`，并添加 `X-Content-Type-Options: nosniff`。P4 编辑器的内联图片上传不得接受 SVG；只有在引入服务端 SVG 清洗并补齐测试后，才允许以内联图片方式渲染 SVG。

## 后端增量模块

在 `apps/server/src/` 下新增 `document/` 模块，与现有模块平级：

```text
apps/server/src/
├── knowledge-tree/              -- 已有（新增 syncContentUri 内部方法）
├── knowledge-base/              -- 已有
├── import-task/                 -- 已有
├── search/                      -- 已有
├── common/                      -- 已有
│   └── document-session-registry.ts -- 新增：轻量共享 provider
├── document/                    -- 新增
│   ├── document.module.ts       -- 注册 REST provider 与后续协作 provider
│   ├── document.controller.ts   -- REST: 内容读写、资源上传
│   ├── document.service.ts      -- OV 读写、格式转换
│   ├── document-collab.gateway.ts -- Hocuspocus WebSocket 协作网关
│   └── constants.ts             -- DOCUMENT_ASSET_UPLOAD_CONFIG
└── app.module.ts                -- 已注册 DocumentModule
```

### DocumentSessionRegistry

协作互斥检查需要在 `TaskWorkerService`、`WebdavService` 和 `DocumentCollabGateway` 三处生效。如果让导入模块和 WebDAV 模块直接依赖完整的 `DocumentService`，会放大模块耦合——当前 `ImportTaskModule` 已经依赖 `SettingsModule`、`TenantModule`、`CommonModule`、`AuditModule`、`KnowledgeBaseModule`、`KnowledgeTreeModule`，`WebdavModule` 也有类似的依赖图。

解法：抽出 `DocumentSessionRegistry` 作为轻量共享 provider，放在 `CommonModule` 下。它只负责维护活跃会话节点 ID 集合，不依赖任何业务模块：

```text
DocumentSessionRegistry (内部使用 nodeSessions: Map<string, Map<string, SessionInfo>> 和 kbNodes: Map<string, Set<string>>)
  - register(kbId: string, nodeId: string, connectionId: string, mode: "readonly" | "write"): void
  - unregister(kbId: string, nodeId: string, connectionId: string): void
  - hasActiveSession(nodeId: string): boolean
  - hasActiveWriteSession(nodeId: string): boolean
  - hasActiveSessionInKb(kbId: string): boolean
  - assertNoActiveWriteSession(nodeId: string): void
  - assertNoActiveSessionInNodes(nodeIds: string[]): void
```

注入路径：

- `DocumentCollabGateway` → 连接建立时 `register`，当前连接断开时 `unregister`。利用 `Set` 保证同一文档多连接场景下，仅当最后一个连接断开时才释放节点锁定。
- `KnowledgeBaseService` → 删除知识库前调用 `hasActiveSessionInKb`，有则抛 423。
- `KnowledgeTreeService` → 删除或移动节点前收集目标子树节点 ID，并调用 `assertNoActiveSessionInNodes`。
- `TaskWorkerService` → 导入注入前调用 `assertNoActiveWriteSession`。
- `WebdavService` → WebDAV PUT 写入前调用 `assertNoActiveWriteSession`；DELETE/MOVE 前调用 `assertNoActiveSessionInNodes`。
- 层级操作（移动、删除）：`KnowledgeTreeService.remove/update` 与 `WebdavService.delete/move` 必须检查目标节点及其子树（或祖先）是否有活跃协作会话，以防正在编辑的文档失效。

`CommonModule` 已被 `ImportTaskModule` 和 `WebdavModule` 依赖（通过 `OVClientService`），新增该 provider 不引入额外模块依赖。

### 需要修改的现有模块

| 模块 | 修改 |
|------|------|
| `CommonModule` | 新增 `DocumentSessionRegistry` provider 并 export |
| `KnowledgeTreeService` | 1. 复用现有 `syncContentUri(nodeId, contentUri, tenantScope)` 内部方法。<br>2. `remove/update` 节点（或树结构移动）时注入 `DocumentSessionRegistry` 检查子树是否有活跃会话。<br>3. 为子树检查提供内部节点收集逻辑，避免每个调用方重复遍历。 |
| `TaskWorkerService` | 注入 `DocumentSessionRegistry`，在导入 Worker 清空文档容器前调用 `assertNoActiveWriteSession`。Worker 当前使用租户仓储上下文回写 `contentUri`，迁移时必须保留 MEDIUM/LARGE 租户写入语义。 |
| `WebdavService` | `overwritePutFile` 前调用 `assertNoActiveWriteSession`；`delete`、`move` 前检查节点或子树任意活跃会话。现有 PUT 覆盖已按叶子替换策略对齐，不再创建覆盖导入任务。 |
| `main.ts` | 调用 `app.enableShutdownHooks()`，确保容器优雅停止时触发 `DocumentCollabGateway.onModuleDestroy()`；同时将 `DOCUMENT_COLLAB_ROUTE_PATH` 排除在全局 `/api` 前缀之外。 |
| `AppModule` | 注册 `DocumentModule`，让 `/api/v1/editor` REST API 成为运行时入口。 |

### API 端点

API 路径使用 `/api/v1/editor` 前缀，避免与"文档处理中心"（导入任务）的命名混淆。

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v1/editor/:nodeId` | GET | 文档元数据（名称、权限、协作地址） |
| `/api/v1/editor/:nodeId/content` | GET | 从 OpenViking 读取 contentUri 并转为编辑器 JSON |
| `/api/v1/editor/:nodeId/content` | PUT | 将编辑器内容转为 Markdown 写入 OpenViking |
| `/api/v1/editor/:nodeId/assets` | POST | 上传图片到文档容器 `assets/` |
| `/api/v1/editor/:nodeId/assets/*path` | GET | 代理读取图片（流式，含缓存头） |
| `ws://host/collab` | WebSocket | Hocuspocus 协作入口 |

当前状态：REST Controller、上传策略、`DocumentModule` 装配和 `DocumentCollabGateway` 已完成 focused 测试，`/api/v1/editor` 已完成启动烟测。P3-4 已使用真实 `DocumentSessionRegistry` 注册可写协作会话，验证导入任务失败和 WebDAV PUT `423 Locked` 的互斥联动。SVG 资产读取采用强制下载策略，并设置 `X-Content-Type-Options: nosniff`。

## 前端集成

### 路由设计

独立站点化后的前端路由不再挂在 `console` 下作为最终入口，而是采用“同域双壳”模式：控制台负责治理，站点负责协作。首阶段由于当前数据模型没有稳定 `slug/siteId`，路由使用 `kbId` 与 `nodeId` 作为稳定键：

```text
apps/web/app/site/
├── page.tsx                 -- 知识空间首页 / 展示可进入的知识库空间
└── [kbId]/
    ├── page.tsx             -- 某个知识库空间首页 / 默认打开根节点或最近文档
    ├── folder/
    │   └── [nodeId]/
    │       └── page.tsx     -- 目录视图 / 独立路由支持深层链接
    └── doc/
        └── [nodeId]/
            └── page.tsx     -- 文档页
```

现有 `/console/documents` 路由继续作为"文档处理中心"（导入任务管理）；`/console/knowledge-tree/:nodeId/edit` 已删除，控制台不再承担文档编辑入口。

独立站点必须按飞书知识库、钉钉知识库这类主流空间化产品对齐以下结构：

| 区域 | 要求 |
|------|------|
| 站点顶栏 | 站点名、空间切换、全局搜索、分享、收藏/最近、用户菜单 |
| 左侧导航 | 知识树目录、最近打开、收藏、站点级快捷入口；不能出现控制台 13 项管理菜单。采用按需懒加载 + lineage 溯源策略以支撑万级节点。 |
| 主体 | 独立站点壳，编辑页与阅读页共享同一空间导航，不复用管理后台主内容布局 |
| 正文 | 居中内容区，`max-width: 720px`，为 BlockNote 编辑器和阅读态共用稳定宽度 |
| 鉴权 | 独立站点有自己的登录跳转语义；未登录访问 `/site`、`/site/:kbId` 或 `/site/:kbId/doc/:nodeId` 时跳转到站点登录入口，再回跳原链接 |
| 状态 | 元数据加载失败时展示站点级错误页，不回落到控制台壳 |

后台到站点的入口也应保持清晰分层：

| 后台位置 | 入口 | 目的 |
|------|------|------|
| 右上角全局工具区 | `进入知识空间` | 直接打开 `/site` 知识空间首页 |
| `知识库管理` 列表页 | `进入空间` 主按钮 | 直接打开对应 `/site/:kbId` |
| `知识库管理` 行级二级菜单 | `查看知识树`、`归档知识库` | 收纳低频治理动作，避免一排主按钮过多 |

当前实现已经完成从控制台内嵌页到 `/site` 路由树的迁移。控制台继续保留治理壳；文档阅读、编辑与协作全部在独立站点壳中完成。

`/site/:kbId` 的知识树治理区也必须走站点专用组件，而不是直接搬运后台 `console/knowledge-tree` 页面组件。站点首页承载的是“空间内治理 + 立即使用”的混合场景，布局节奏应比后台治理更轻、操作反馈更贴近空间工作流。

### 编辑器组件

`apps/web/components/document-editor/document-editor.tsx` 是 P4-3 的前端编辑器入口：

| 职责 | 实现 |
|------|------|
| 初始内容 | 调用 `GET /api/v1/editor/:nodeId/content`，把后端返回的 blocks 作为 BlockNote `initialContent` |
| 编辑状态 | BlockNote `onChange` 后进入未保存状态，顶栏显示 `未保存` |
| 手动保存 | 顶栏保存按钮触发 `PUT /api/v1/editor/:nodeId/content`，请求体为 `{ blocks }` |
| 只读模式 | 元数据 `readOnly` 或 `canWrite=false` 时，BlockNote `editable=false`，保存按钮禁用 |
| 主题 | Mantine theme 使用 `globals.css` 中的编辑器变量，保留 BlockNote 斜杠菜单、悬浮工具栏和块级交互 |

P4-3 的 REST 读写是编辑器基座，不是最终协作写入形态。P4-4 协作模式必须使用官方 `HocuspocusProvider`，并以 WebSocket/Hocuspocus 作为唯一活动写入通道；REST `PUT /api/v1/editor/:nodeId/content` 只保留给非协作回退或后续显式恢复工具。原因是后端 REST 写入已经启用 `DocumentSessionRegistry.assertNoActiveWriteSession`，活跃协作连接存在时并行 REST 保存会被视为写入冲突。

### 协作 Provider

P4-4 的前端协作接入规则如下。Hocuspocus v4 客户端必须使用 `@hocuspocus/provider`，不得使用 `y-websocket` 连接生产网关：

| 项目 | 规则 |
|------|------|
| Provider | 使用 `@hocuspocus/provider@4.0.0` 的 `HocuspocusProvider` |
| url | 由服务端元数据直接下发 `collab.serverUrl`；前端不得在浏览器端用 `window.location.origin` 猜测协作地址，也不得把 `documentName` 拼进 URL |
| name | 使用元数据 `collab.documentName`，格式由后端生成，前端不得自行拼租户 |
| token | 从 `readSessionToken()` 读取，通过 Provider 的 `token` 配置传给 Hocuspocus `onAuthenticate` |
| fragment | 使用 `document-store`，必须与后端 `DOCUMENT_YJS_FRAGMENT_NAME` 一致 |
| 用户信息 | 使用当前登录用户生成 `name` 与协作光标颜色，颜色来自 `--collab-cursor-*` 色盘 |
| 只读 | 元数据 `readOnly` 或 `canWrite=false` 时传给 BlockNote `editable=false`，服务端鉴权继续兜底 |
| 生命周期 | `nodeId`、`documentName` 变化或页面卸载时断开 Provider，并释放当前 `Y.Doc` 引用 |

BlockNote 协作配置应由 Provider 驱动，而不是同时传入 REST 初始 blocks：

```typescript
const doc = new Y.Doc();
const provider = new HocuspocusProvider({
  url: serverUrl,
  name: documentName,
  document: doc,
  token,
});

useCreateBlockNote({
  collaboration: {
    provider,
    fragment: doc.getXmlFragment("document-store"),
    user: { name, color },
    showCursorLabels: "activity",
  },
});
```

连接状态要进入顶栏，而不是只写入控制台日志：

| Provider 事件 | 顶栏状态 |
|------|------|
| 初始化中 | 协作连接中 |
| `status: connected` | 已连接 |
| `synced: { state: false }` | 同步中 |
| `synced: { state: true }` | 已同步到协作服务 |
| `status: disconnected` / `disconnect` / `close` | 已断开 |
| `authenticationFailed` | 连接失败，需要重新登录或刷新页面 |

这里的"已同步到协作服务"不等同于"已持久化到 OpenViking"。OpenViking 持久化仍由 Hocuspocus 的 `debounce=30000`、`maxDebounce=60000` 规则控制；优雅关闭由 `flushPendingStores()` 兜底。因此 P4-4 的 UI 文案不得在仅收到 Provider `synced=true` 时承诺"已保存到知识库"。

### 图片上传与预览

P4-5/P4-6 的前端实现应保持正文路径和预览 URL 分离：

| 项目 | 规则 |
|------|------|
| 正文持久化值 | 只保存 `assets/{generatedFileName}` 相对路径 |
| 上传入口 | 已使用 BlockNote `uploadFile` 钩子，复用编辑器原生粘贴/拖拽行为 |
| 上传 API | `POST /api/v1/editor/:nodeId/assets`，multipart 字段名 `files` |
| 内联格式 | PNG、JPG/JPEG、GIF、WebP；SVG 不进入内联图片流程 |
| 上传前处理 | 前端会优先对较大的 PNG/JPG/JPEG/WebP 做浏览器端压缩，优先转为更小的 WebP；GIF 为避免动画丢失保持原文件 |
| 权限 | `readOnly=true` 或 `canWrite=false` 时禁止上传，并给出中文提示 |
| 预览加载 | 已接入带 Bearer Token 的 fetch → Blob → Object URL，不把 JWT 放入图片 URL |
| 资源释放 | 已在 nodeId 切换或组件卸载时释放 Object URL |
| 错误表现 | 上传失败或加载失败时显示中文错误，不删除原图片块 |

P4-5 已通过组件单测验证上传校验、字段名、只读拒绝、上传状态和相对路径写入；P4-6 已通过 focused 测试验证认证拉取、Object URL 缓存释放和 `resolveFileUrl` 接入。后续若引入服务端 SVG 清洗或短期签名 URL，需要重新评审 token 暴露和缓存策略。

### 入口交互

独立站点成为唯一文档使用入口，入口关系如下：

| 场景 | 交互 | 后端契约 |
|------|------|------|
| 进入知识空间 | 用户先打开 `/site`，选择要进入的知识库空间，再进入 `/site/:kbId` | 空间首页调用知识库列表接口，列出当前租户可进入的空间 |
| 知识空间首页治理 | `/site` 直接支持新建知识库、重命名知识库、归档知识库，不再要求先切回后台 | 复用 `POST /api/v1/knowledge-bases` 与 `PATCH /api/v1/knowledge-bases/:id` |
| 打开已有文档（站点） | 用户从 `/site/:kbId` 的左侧树或最近列表打开文档，进入 `/site/:kbId/doc/:nodeId` | 文档页调用 `GET /api/v1/editor/:nodeId` 获取元数据，服务端按 ACL 与角色返回 `readOnly` / `canWrite` |
| 站点内树治理 | 用户在 `/site/:kbId` 直接完成新增目录、新建文档、拖拽移动、重命名、ACL 管理和删除 | 复用 `POST /api/v1/knowledge-tree`、`PATCH /api/v1/knowledge-tree/:id`、`PATCH /api/v1/knowledge-tree/:id/move`、`DELETE /api/v1/knowledge-tree/:id` |
| 后台治理 | `/console/knowledge-tree` 只负责节点治理、权限、结构调整，不再提供文档打开入口 | 控制台继续复用现有知识树查询与权限校验 |
| 目录节点 | 进入 `/site/:kbId/folder/:nodeId` 目录详情视图，展示子节点列表与快捷操作入口 | 结合 `GET /api/v1/knowledge-tree?parentId=xxx` 与 `childrenCount` 实现按需懒加载 |
| 新建文档 | 点击"新建文档"后填写名称和父级，创建成功后文档可通过 `/site/:kbId/doc/:nodeId` 直接访问 | 复用 `POST /api/v1/knowledge-tree`，请求体传 `kind:'document'`；名称无后缀时后端自动补 `.md`；后端生成文档节点容器 URI，`contentUri` 初始为 null |
| 新建目录 | 保持现有"新建节点"行为 | `POST /api/v1/knowledge-tree` 未传 `kind` 或传 `kind:'collection'` 时仍创建目录节点 |

当前实现中，知识树前端类型已暴露 `kind` / `contentUri`，`AddNodeModal` 可选择目录节点或文档节点；文档节点判断以 `kind:'document'` 为准，不能通过 `vikingUri` 字符串形态推断节点类型。

创建文档节点的写权限不能只依赖前端按钮显隐。`tenant_viewer` 可在 ACL 允许时进入已有文档的只读站点页，但不能创建新文档；`tenant_operator` 及以上才允许调用创建接口。后端 `POST /api/v1/knowledge-tree` 已使用角色守卫兜底，避免只读用户直接调用 API 创建文档节点。

当前站点与后台的入口分工已经稳定：

| 入口位置 | 当前形态 |
|------|------|
| `/site` | 知识空间首页，同时承担知识库创建、重命名、归档治理 |
| `/site/:kbId` | 站点概览 + 树治理工作区，承担目录/文档结构治理 |
| `/site/:kbId/folder/:nodeId` | 目录概览工作区，支持按目录分层管理与进入下级节点 |
| `/site/:kbId/doc/:nodeId` | 文档阅读与协作编辑页 |
| `知识库管理` 列表页 | `进入空间` 主按钮直达对应 `/site/:kbId` |
| `知识库管理` 行级二级菜单 | `查看知识树`、`重命名知识库`、`归档知识库`，避免一排主按钮过多 |

## 全链路一致性

文档内容写入 OpenViking 后，以下渠道自动生效：

| 渠道 | 说明 |
|------|------|
| 搜索 / QA | 内容在 OpenViking 中自动被索引和参与 RAG 检索 |
| WebDAV | 文档作为 OpenViking 资源树的节点，客户端可读取。写入时需检查活跃协作会话互斥 |
| MCP / Capability | 通过 vikingUri 访问资源树和元数据，通过 contentUri 访问正文内容 |
| 导入任务 | 反向兼容：外部导入的 Markdown 文档也能被编辑器加载。导入前需检查协作互斥 |

## 依赖选型

设计文档只记录选型决策，不锁定版本号。最终版本以 `package.json` 和 lockfile 为准。

后端已锁定：

| 包 | 版本 | 用途 | 兼容性约束 |
|------|------|------|------|
| `@hocuspocus/server` | `4.0.0` | 协作核心服务，生产接入使用 `Hocuspocus` 核心类 | Node.js `>=22`，需动态 `import()` |
| `crossws` | `0.4.5` | Node HTTP `upgrade` 适配器，负责把 Nest HTTP server 的升级连接转换为 WebSocket peer | 需动态 `import()` |
| `yjs` | `13.6.30` | CRDT 引擎 | 与 Hocuspocus peer dependency 对齐 |
| `y-protocols` | `1.0.7` | Y.js awareness / sync 协议支持 | 与 `yjs@13.6.30` 对齐 |

前端新增：

| 包 | 版本 | 用途 |
|------|------|------|
| `@blocknote/core` | `0.50.0` | 编辑器核心 |
| `@blocknote/react` | `0.50.0` | React 绑定，peer 支持 React 19 |
| `@blocknote/mantine` | `0.50.0` | Mantine UI 主题适配 |
| `@mantine/core` | `9.2.0` | 满足 `@blocknote/mantine` peer 依赖 |
| `@mantine/hooks` | `9.2.0` | 满足 `@blocknote/mantine` peer 依赖 |
| `@hocuspocus/provider` | `4.0.0` | Hocuspocus 官方前端协作 Provider |
| `yjs` | `13.6.30` | CRDT 引擎，与后端版本对齐 |

P4-1 已验证 `pnpm --filter web typecheck` 与 `pnpm --filter web build` 通过，当前 Next.js 16.2.4 + React 19.2.4 可解析上述依赖。

`y-websocket` 不再作为前端生产依赖。真实 Hocuspocus v4 网关必须使用 `HocuspocusProvider` 进行协议层连接和 S9 端到端验收。

当前后端协作依赖不引入新的数据库、Redis 或后台队列强依赖。Hocuspocus 持久化仍通过 `DocumentService` 的 OpenViking Atomic Swap 写入链路完成，不使用 `@hocuspocus/extension-database`。

依赖接入前必须用 lockfile 固定实际版本，并验证以下内容：

- BlockNote 相关包与当前 React / Next.js 版本兼容。
- Hocuspocus Server 可嵌入现有 NestJS HTTP 服务，不额外占用独立端口。
- Y.js、Hocuspocus 和 BlockNote 使用同一份协作状态，不在前后端各自持久化不同格式。
- 新增依赖不得引入 Redis、独立数据库或后台队列作为 P1/P2 强依赖。
- 当前根 `package.json` 声明 `packageManager: pnpm@9.15.9`，与 `pnpm-lock.yaml` 的 lockfileVersion `9.0` 对齐；CI 与生产 Docker 构建均使用 `pnpm install --frozen-lockfile`，避免依赖安装绕过锁文件。

## 参考项目

| 项目 | 参考价值 |
|------|------|
| [Docmost](https://github.com/docmost/docmost) | Hocuspocus 嵌入 NestJS 的集成模式和鉴权钩子 |
| [Outline](https://github.com/outline/outline) | 知识库产品逻辑和文档权限模型 |

## 相关文档

- [架构文档](./ARCHITECTURE.md)
- [数据库 Schema](./DATABASE_SCHEMA.md)
- [API 参考](./API_REFERENCE.md)
- [导入流水线](./IMPORT_PIPELINE.md)
- [ADR 0009: 文档协作存储设计](./adr/0009-document-collaboration-storage-design.md)
