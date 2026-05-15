# ADR 0009: 文档协作存储与持久化设计

## 状态

已采纳

## 实施状态

截至 2026-05-12，P1 互斥与安全基座已落地：

- `DocumentSessionRegistry` 已作为轻量共享 provider 注册到 `CommonModule`。
- `KnowledgeTreeService`、`KnowledgeBaseService`、`TaskWorkerService` 和 `WebdavService` 已接入协作会话互斥检查。
- WebDAV 覆盖、删除和移动遇到协作冲突时返回 `423 Locked`。
- `main.ts` 已启用 NestJS shutdown hooks，为后续 Hocuspocus 优雅关闭 flush 提供生命周期基础。

P2 已完成 `DocumentContentCodec`、`DocumentService`、`DocumentController`、媒体上传安全配置、`DocumentModule` 运行时注册，以及 WebDAV PUT 与协作保存策略复核。

P3-0 Hocuspocus + NestJS HTTP server upgrade Spike 已完成。结论是：`@hocuspocus/server` 的 `Server` 类会自建 HTTP server，不适合作为现有 NestJS 进程内嵌入口；生产实现应使用 `Hocuspocus` 核心类 + `crossws/adapters/node`，把现有 NestJS HTTP server 的 `/collab` upgrade 连接交给 Hocuspocus 处理。

P3-1 后端协作依赖已完成安装并锁定版本：`@hocuspocus/server@4.0.0`、`crossws@0.4.5`、`yjs@13.6.30`、`y-protocols@1.0.7`。`@hocuspocus/server@4.0.0` 要求 Node.js `>=22`，当前本地验证环境 Node.js `v24.14.1` 满足要求，CI 与生产 Docker 构建基线已同步为 Node.js 24。

P3-2 `DocumentCollabGateway` 已完成后端实现：使用动态 ESM import 加载 Hocuspocus 和 crossws，挂载 `/collab` WebSocket upgrade，执行 JWT、租户、ACL 和角色校验，区分只读/可写连接，注册/注销 `DocumentSessionRegistry`，并通过 `DocumentContentCodec` 与 `DocumentService` 完成 Y.Doc 与 OpenViking Markdown 的双向读写。

P3-3 防抖保存与优雅关闭已完成：Hocuspocus 配置 `debounce=30000`、`maxDebounce=60000`，`DocumentCollabGateway.onModuleDestroy()` 会移除 upgrade 监听、关闭连接并调用 `flushPendingStores()`。

P3-4 协作会话与导入/WebDAV 互斥联动已完成：focused 测试使用真实 `DocumentSessionRegistry.register()` 注册可写协作会话，验证导入任务失败并提示"目标节点正在被协作编辑"，WebDAV PUT 返回 `423 Locked` 且不会继续覆盖 OpenViking 资源。

P3-5 `/collab` 路径排除全局 `/api` 前缀已完成，`main.ts` 使用 `DOCUMENT_COLLAB_ROUTE_PATH` 常量配置，避免硬编码路径。

P4-1 前端编辑器依赖已完成安装并锁定版本：`@blocknote/core@0.50.0`、`@blocknote/react@0.50.0`、`@blocknote/mantine@0.50.0`、`@mantine/core@9.2.0`、`@mantine/hooks@9.2.0`、`@hocuspocus/provider@4.0.0`、`yjs@13.6.30`。Hocuspocus 4.x 前端必须使用官方 `HocuspocusProvider`；`y-websocket` 协议不作为生产方案。

P4-2 前端编辑页路由已完成并在 P5 中退场：历史上曾以 `/console/knowledge-tree/:nodeId/edit` 作为控制台内嵌编辑页承接 P4 能力验证；在独立站点化落地后，该路由已移除，不再作为最终产品入口。

P4-3 BlockNote 编辑器组件已完成：`DocumentEditor` 调用 `GET /api/v1/editor/:nodeId/content` 获取 blocks 并作为 BlockNote `initialContent`，编辑后进入未保存状态，顶栏保存按钮触发 `PUT /api/v1/editor/:nodeId/content`，只读文档通过 `editable=false` 锁定。该 REST 保存能力是协作 Provider 接入前的编辑器基座。

P4-4 协作 Provider 已完成：前端使用 `@hocuspocus/provider@4.0.0` 的 `HocuspocusProvider`，通过元数据 `collab.path` 与 `collab.documentName` 创建连接，JWT 通过 `token` 配置传递给 Hocuspocus `onAuthenticate`。真实协议层 e2e 已覆盖两个 Provider 客户端的正文同步和 awareness 协作者状态同步。

P4-5/P4-6 实施前补充明确：图片上传与渲染必须保持正文路径和浏览器预览 URL 分离。编辑器只把 `assets/{generatedFileName}` 相对路径写入文档内容；受 JWT 保护的资产预览由前端使用 Bearer Token fetch 后生成临时 Object URL。SVG 在服务端清洗能力完成前不得作为内联图片插入编辑器。

P4-5 图片粘贴/拖拽上传已完成：前端新增 `document-assets.ts`，集中处理 `/editor/:nodeId/assets` endpoint 构造、`files` 字段上传、内联图片格式和 10MB 大小校验；`DocumentEditor` 的 REST 回退模式与协作模式均已把该上传逻辑接入 BlockNote `uploadFile`，上传时顶栏显示“图片上传中”，成功后只写入 `assets/{filename}` 相对路径。

P4-6 图片渲染与缓存已完成：`document-assets.ts` 新增 `assets/{filename}` 相对路径解析、受保护资产端点构造、Bearer Token fetch、Object URL 缓存和释放；`DocumentEditor` 的 REST 回退模式与协作模式均已把 `resolveFileUrl` 传给 BlockNote。前端不会把 JWT 放入 URL，也不会把 Blob URL 持久化到正文。

P4-7 知识树入口集成已完成：不新增专用创建 API，而是在现有 `POST /api/v1/knowledge-tree` 上扩展 `kind:'document'` 分派能力。未传 `kind` 时保持目录节点创建语义；传入 `kind:'document'` 时创建文档节点容器，`contentUri` 初始为 null，并在创建成功后跳转编辑页。创建权限由后端校验 `tenant_operator` 及以上角色，前端按钮显隐不作为唯一防线。

P5-1 至 P5-5 独立站点化已完成：前端最终入口已迁移到 `\`/site\``（知识空间首页）、`\`/site/:kbId\``（知识库空间首页）和 `\`/site/:kbId/doc/:nodeId\``（文档页），登录页支持 `next=/site/...` 回跳；控制台中的文档打开入口与 `/console/knowledge-tree/:nodeId/edit` 路由已移除。由于当前数据模型尚无稳定 `slug/siteId` 字段，首阶段站点化先使用 `kbId` 与 `nodeId` 作为稳定路由键，后续再补公开 slug 与自定义域名。

2026-05-13 评审追加目标：`/site/:kbId` 不再只是知识库空间首页，还需要承接站点内的知识树治理能力。最终用户在独立站点中应直接完成新增节点、新建文档、移动节点/文档、节点/文档重命名、ACL 管理以及删除节点/文档，不必回到后台控制台操作。

截至 2026-05-13，本轮追加目标已落地：`/site` 已支持新建知识库、重命名知识库和归档知识库；`/site/:kbId` 已支持站点内目录/文档治理；后台 `知识库管理` 页已补充“重命名知识库”行级入口并保留 `进入空间` 新标签页体验。

此外，V3 知识站点性能与视觉架构已成功落地。数据层从全量树拉取切换为动态懒加载（基于 `childrenCount` 与 `lineage` 接口实现深层路由 O(1) 解析），组件层彻底剥离传统 Admin 模板，全面接入 `ShellPanel` 与 `ShellButton`（即 Starry Sky 设计原语）。历史 `isKnowledgeSiteV2Enabled` 灰度标记与旧版遗留页面代码已全部清理。

## 背景

项目需要为知识库增加在线文档协作编辑能力，并以“独立知识站点”而不是“控制台子页”的方式交付给最终用户。设计涉及内容存储位置、协作状态持久化、读写路径选择、站点入口形态和媒体资源管理。

现有系统中，`knowledge_nodes` 表已预留 `kind:'document'` 和 `contentUri` 字段。其中 `vikingUri` 是以 `/` 结尾的资源容器目录，`contentUri` 是导入完成后由 Worker 回写的正文叶子文件 URI。导入流程的 `prepareDocumentTarget` 会在注入前递归清空整个 vikingUri 容器。`KnowledgeTreeService.update()` 将 `vikingUri`、`contentUri`、`kind` 列为 `IMMUTABLE_FIELDS`，公开 API 无法修改。

现有 Admin 封装中，写入 OpenViking 的已验证路径为：先 `uploadTempFile` 到 `/api/v1/resources/temp_upload` 获取 `temp_file_id`，再 `POST /api/v1/resources` 注入。不存在直接 PUT 到指定 URI 的封装方法。

当前代码基线中，`KnowledgeTreeService.syncContentUri()` 已存在，可作为内部 `contentUri` 回写入口。WebDAV 覆盖写入也已采用“注入新正文叶子 → 切换 `contentUri` → 异步删除旧叶子”的 Atomic Swap 模式，不再依赖导入任务覆盖已有文件。

## 决策

1. 文档内容底层存储使用 OpenViking，不在 PostgreSQL 新建 `documents` 或 `document_versions` 表。
2. 协作保存采用原子交换（Atomic Swap）以保证零丢失：先 `temp_upload`，再 `POST /api/v1/resources` 注入带时间戳的新叶子文件，接着回写 `contentUri`，最后异步删除旧叶子。由 `DocumentService` 直接调用 `OVClientService`，不走 `importTaskService`。导入链路的 `prepareDocumentTarget` 会递归清空容器导致附件丢失，必须绕过。
3. 首次协作保存后，通过 `/api/v1/fs/tree` 查询容器叶子文件，回写 `contentUri`。复用 `KnowledgeTreeService.syncContentUri()` 作为内部入口，绕过公开 `update()` 的 `IMMUTABLE_FIELDS` 保护。Worker 的 `contentUri` 回写必须保持租户数据源上下文，不得为了统一入口破坏 MEDIUM schema 或 LARGE 独立库写入语义。
4. 文档中的图片等媒体资源存储在容器的 `assets/` 子目录下。
5. 媒体上传使用独立配置（`DOCUMENT_ASSET_UPLOAD_CONFIG`），不复用 `LOCAL_IMPORT_UPLOAD_CONFIG`。后者的 `ALLOWED_EXTENSIONS` 不包含图片格式。
6. 协作引擎采用 Y.js + Hocuspocus，嵌入现有 NestJS 进程。接入方式为 `Hocuspocus` 核心类 + `crossws/adapters/node` 监听现有 HTTP server 的 `upgrade` 事件，不启动 Hocuspocus 独立 HTTP server。Y.js CRDT 状态为运行时中间态，按防抖规则（debounce=30s, maxDebounce=60s）持久化到 OpenViking。
7. 权限分两个维度：ACL 控制节点可见性，角色级别控制写入能力（对齐 WebDAV 的 `tenant_operator` 最低写入要求）。
8. 前端最终路由采用独立站点形态：`/site` 作为知识空间首页，`/site/:kbId` 作为知识库空间首页，`/site/:kbId/doc/:nodeId` 作为文档页；后端 API 继续使用 `/api/v1/editor` 前缀。控制台不再保留文档编辑页路由或文档打开入口。
9. 活跃协作会话与导入/WebDAV 写入互斥。抽出 `DocumentSessionRegistry` 轻量 provider 放在 `CommonModule`，以 `Map<nodeId, Map<connectionId, SessionInfo>>` 记录节点连接，并通过 `Map<kbId, Set<nodeId>>` 快速判断知识库级活跃会话。导入与 WebDAV PUT 只需阻塞可写会话；节点删除、移动、子树删除和知识库删除必须阻塞目标范围内的任意活跃会话。
10. WebDAV 覆盖行为对齐：WebDAV PUT 从创建本地导入任务并递归清空容器的策略，迁移为直接调用 OVClient 替换 `contentUri` 叶子文件，以防止客户端保存覆盖时丢失 `assets/` 下的媒体资源。
11. NestJS 进程必须启用 shutdown hooks，并在 `DocumentCollabGateway.onModuleDestroy()` 中关闭连接与 `flushPendingStores()`。否则 SIGTERM 场景不能承诺待保存内容被刷入 OpenViking。
12. Markdown 是 OpenViking 侧唯一长期正文格式；BlockNote JSON 和 Y.js Doc 都是编辑器/协作层中间态。所有 REST 保存与 Hocuspocus 保存必须复用同一套格式转换组件，避免两个入口产生不同 Markdown。
13. 前端协作模式只允许一条活动写入通道：`BlockNote → Y.Doc → HocuspocusProvider → Hocuspocus → DocumentService`。当 `HocuspocusProvider` 已连接时，页面不得并行调用 REST `PUT /api/v1/editor/:nodeId/content` 写正文，避免被 `DocumentSessionRegistry` 的可写协作会话互斥规则判定为 `423 Locked`。REST 写正文保留为非协作回退、测试夹具或后续显式恢复工具。
14. 前端 `HocuspocusProvider` 必须使用后端元数据返回的 `collab.path` 和 `collab.documentName`。`collab.path` 只用于构造 `url`，`collab.documentName` 只作为 `name` 传入 Provider；协作 fragment 名固定为 `document-store`，必须与后端 `DOCUMENT_YJS_FRAGMENT_NAME` 保持一致。JWT 通过 Provider 的 `token` 配置传入，日志和错误信息不得输出完整 token。
15. 图片正文路径与浏览器预览 URL 必须分离：Markdown、BlockNote blocks 和 Y.Doc 中只保存 `assets/{generatedFileName}` 相对路径；P4 前端渲染时用带 Bearer Token 的 fetch 访问 `/api/v1/editor/:nodeId/assets/{filename}` 并生成 Object URL，不能把 JWT 写入 URL，也不能把 Blob URL 持久化到正文。当前资产目录按单文件名扁平化处理，不支持多级子路径语义。
16. SVG 策略分层处理：后端上传 API 可接受 `.svg` 作为附件并在读取代理中强制下载和 `nosniff`，但编辑器内联图片上传只允许 PNG、JPG/JPEG、GIF、WebP。只有完成服务端 SVG 清洗、补齐安全测试并重新评审缓存策略后，才允许 SVG 作为内联图片渲染。
17. 知识树文档入口复用现有节点创建语义：`POST /api/v1/knowledge-tree` 增加 `kind:'collection' | 'document'` 入参，缺省为 `collection` 以保持兼容；`kind:'document'` 时调用已有文档节点创建分支生成容器 URI，名称无后缀时自动补齐默认 Markdown 后缀 `.md`，并保持 `contentUri=null`。已有文档节点的最终打开方式固定为 `/site/:kbId/doc/:nodeId`；目录节点在独立站点中作为左侧树导航项展示。创建文档节点需要 `tenant_operator` 及以上角色，查看已有文档仍允许 `tenant_viewer` 在 ACL 可见时以只读模式进入。
18. 独立站点首阶段不依赖 `knowledge_nodes.path` 生成公开路由。`path` 表示可变的树路径，适合展示与面包屑，不适合充当持久 URL 主键；站点首阶段必须使用稳定的 `kbId` 和 `nodeId` 作为路由键，避免节点重命名或移动后链接失效。
19. 独立站点与控制台采用“同域双壳”模式：控制台负责知识库治理、权限配置、导入运维；站点壳负责文档浏览与协作。二者复用同一套会话和 JWT，但站点必须拥有独立布局、独立登录跳转语义、独立导航与分享入口，对齐飞书知识库/钉钉知识库的空间化使用方式。
20. `site/[kbId]/page.tsx` 需要支持站点内知识树治理能力：新增目录节点、新建文档、拖拽移动节点/文档、节点/文档重命名、ACL 保存、删除节点/文档。该页复用现有知识树与 ACL API，不新增第二套节点模型。
21. `site/[kbId]/page.tsx` 的知识树治理界面必须使用站点专用组件与交互，不得直接复用后台 `console/knowledge-tree` 页面组件。原因是站点场景是“空间内治理 + 使用”混合态，信息密度、布局节奏和操作心智都不同于后台治理台。
22. `site/page.tsx` 需要支持知识库治理入口：新建知识库、重命名知识库、归档知识库，并继续作为 `/site` 空间首页承接最近访问和进入空间导航。站点首页治理复用现有知识库 API，不再把“请去后台操作”作为主路径。
23. 后台 `知识库管理` 页保留“进入空间”主按钮，并在二级菜单中补充“重命名知识库”。后台列表不再堆叠过多一级按钮，低频治理动作统一收纳到菜单中。

## 取舍

- 优点：零新数据库表，零新中间件依赖（P1/P2）。文档写入 OpenViking 后搜索、QA、WebDAV、MCP 全链路自动生效。附件随文档节点递归删除自动清理。
- 成本：
  - 协作保存绕过导入链路，需要 `DocumentService` 独立实现原子交换（`temp_upload` + 注入新叶子 + `contentUri` 切换 + 删旧叶子）。
  - `syncContentUri` 已存在，但 Worker 现有直接 repository 调用仍需梳理，迁移时必须保留租户仓储上下文。
  - 新增 `DocumentSessionRegistry` 共享 provider，Worker、WebDAV、KnowledgeTree 和 KnowledgeBase 均需注入并调用。
  - 进程崩溃（非优雅关闭）时，连续编辑场景最大丢失窗口为 `maxDebounce`（60 秒）。优雅关闭（SIGTERM）时，只有在 NestJS 启用 shutdown hooks 后，`flushPendingStores()` 才能将丢失降为 0。
  - P1/P2 协作入口限制为单实例。
  - Hocuspocus 4.x 对运行时有 Node.js `>=22` 要求，部署环境必须与该约束对齐。
  - Hocuspocus 4.x 与 crossws 是 ESM 优先包，当前 server 的 Jest/CommonJS 运行时不能静态 import；`DocumentCollabGateway` 需要动态 `import()` 加载协作依赖。
  - 协作模式下顶栏状态只能承诺"已同步到协作服务"，不能把 `HocuspocusProvider` 的 `synced=true` 等同于"已持久化到 OpenViking"。OpenViking 持久化仍受 Hocuspocus 防抖规则控制。
  - 图片预览需要前端维护 Object URL 生命周期，复杂度高于直接 `<img src>`；但该方案避免在 URL、日志、浏览器历史和 Markdown 中泄露 JWT，同时保持 OpenViking 正文内容可移植。
  - 知识树入口集成需要小幅触达现有 `KnowledgeTreeController` / DTO / 前端知识树类型。风险点是不能破坏未传 `kind` 的现有目录创建行为，也不能只用前端显隐替代后端角色校验。
  - 独立站点首阶段没有 `slug/siteId`，URL 可读性会弱于飞书/钉钉正式产品；这是为保证稳定落地而接受的阶段性折中。
  - 当前根 `package.json` 的 `packageManager` 已统一为 `pnpm@9.15.9`，与 `pnpm-lock.yaml` 的 lockfileVersion `9.0` 对齐；CI 与生产 Docker 构建均使用 `pnpm install --frozen-lockfile`，避免锁文件被低版本工具误判或绕过。

## 后续影响

- 后端 `document/` REST 基座已新增并注册到 `AppModule`；Hocuspocus WebSocket Gateway 与协作互斥联动已在 P3 落地。
- `KnowledgeTreeService` 已复用现有 `syncContentUri()` 内部方法；`remove/update` 等树层级操作已检查子树活跃会话。
- `KnowledgeBaseService` 已在删除知识库前检查知识库级活跃会话。
- `CommonModule` 已新增 `DocumentSessionRegistry` provider，支持多连接、多模式和知识库范围跟踪。
- `TaskWorkerService` 和 `WebdavService` 已注入上述 provider 进行互斥检查。WebDAV PUT 已按叶子替换策略对齐，并已补齐协作会话锁。
- `main.ts` 已启用 NestJS shutdown hooks，`DocumentCollabGateway.onModuleDestroy()` 已接入连接关闭和 `flushPendingStores()`，用于覆盖 SIGTERM 优雅关闭。
- 后端协作依赖已写入 `apps/server/package.json` 和 `pnpm-lock.yaml`，NestJS HTTP server `upgrade` 接入验证已通过，`DocumentCollabGateway` 已完成动态 ESM 加载、鉴权、会话管理、Y.Doc 读写、防抖保存和优雅关闭 flush。
- 前端当前已具备独立站点形态：`DocumentEditor` 已挂入 `/site/:kbId/doc/:nodeId` 文档页，站点壳已补齐左侧树导航、站点首页、独立登录回跳和最近打开。控制台不再承担文档编辑入口。
- 站点首页已补齐知识库治理能力：用户可直接在 `/site` 新建、重命名、归档知识库；`/site/:kbId` 已补齐目录/文档创建、移动、重命名、ACL 和删除治理。
- 后台 `知识库管理` 页已补充“重命名知识库”行级菜单入口，并继续保留“进入空间”新标签页入口。
- 媒体上传独立配置：后端允许 png/jpg/jpeg/gif/webp/svg 格式，SVG 读取强制下载；前端内联图片上传先限制为 png/jpg/jpeg/gif/webp。
- 资产预览不能直接依赖普通 `<img src>` 访问受保护 API。P4-6 已补齐相对路径解析、Bearer Token fetch、Object URL 释放和失败占位测试；后续只能在重新评审后切换为 Cookie 鉴权或短期签名 URL。
- 多实例协作需引入 Redis 共享层或 sticky session，不在 P1/P2 范围内。
