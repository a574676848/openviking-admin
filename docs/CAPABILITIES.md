# 能力平台

能力平台是 OpenViking Admin 对外开放知识能力的统一应用层。它先定义能力契约，再把同一组能力投影到 HTTP、CLI、MCP 和 Skill 四种入口。

![基于 MCP 与 Rerank 的高精准检索流](<./images/基于 MCP 与 Rerank 的高精准检索流.png>)

图中的 MCP 只是四种入口之一。HTTP、CLI、MCP 和 Skill 都应进入同一套能力契约、授权和执行链路。

## 设计目标

- 对外能力平铺，客户端按自身运行环境选择入口。
- 业务规则只定义一次，避免 HTTP、CLI、MCP、Skill 各自维护一套能力模型。
- 所有入口统一认证、授权、审计、限流、日志追踪和错误语义。
- 新能力必须先进入 capability catalog，再由 adapter 投影出去。

当前 `knowledge.search` 已复用管理侧 `SearchService.find()`：HTTP、CLI、MCP 和 Skill 四种入口会共享同一套节点 ACL 过滤、`scope ∩ allowedUris` 收敛、Rerank 策略与 `search_logs` 统计口径，因此 dashboard、历史搜索和 capability 检索的命中统计保持一致。

## 当前能力

| 能力                      | 说明                                   | HTTP                                              | CLI                                   | MCP 工具                  | 最低角色          |
| ------------------------- | -------------------------------------- | ------------------------------------------------- | ------------------------------------- | ------------------------- | ----------------- |
| `knowledge.search`        | 在租户知识域内执行语义搜索             | `POST /api/v1/knowledge/search`                   | `ova knowledge search`                | `knowledge.search`        | `tenant_viewer`   |
| `knowledge.grep`          | 在租户知识域内执行文本匹配             | `POST /api/v1/knowledge/grep`                     | `ova knowledge grep`                  | `knowledge.grep`          | `tenant_viewer`   |
| `resources.list`          | 列出租户授权范围内的资源               | `GET /api/v1/resources`                           | `ova resources list`                  | `resources.list`          | `tenant_operator` |
| `resources.tree`          | 获取租户资源树                         | `GET /api/v1/resources/tree`                      | `ova resources tree`                  | `resources.tree`          | `tenant_operator` |
| `knowledgeBases.list`     | 列出当前租户未归档的可导入知识库       | `GET /api/v1/capability/knowledge-bases`          | `ova kb list`                         | `knowledgeBases.list`     | `tenant_viewer`   |
| `knowledgeBases.detail`   | 查看未归档知识库详情与导入根路径       | `GET /api/v1/capability/knowledge-bases/:id`      | `ova kb detail`                       | `knowledgeBases.detail`   | `tenant_viewer`   |
| `knowledgeTree.list`      | 列出未归档知识库下可作为导入目标的节点 | `GET /api/v1/capability/knowledge-bases/:id/tree` | `ova tree list`                       | `knowledgeTree.list`      | `tenant_viewer`   |
| `knowledgeTree.detail`    | 查看知识树节点详情与导入路径           | `GET /api/v1/capability/knowledge-tree/:id`       | `ova tree detail`                     | `knowledgeTree.detail`    | `tenant_viewer`   |
| `documents.import.create` | 创建本地、URL 或 manifest 文档导入任务 | `POST /api/v1/capability/import-tasks/documents`；本地文件上传：`POST /api/v1/capability/import-tasks/local-upload` | `ova documents import` | `documents.import.create` | `tenant_operator` |
| `documents.import.status` | 查看文档导入任务进度                   | `GET /api/v1/capability/import-tasks/:id`         | `ova documents import status`         | `documents.import.status` | `tenant_viewer`   |
| `documents.import.list`   | 列出当前租户文档导入任务               | `GET /api/v1/capability/import-tasks`             | `ova documents import list`           | `documents.import.list`   | `tenant_viewer`   |
| `documents.import.cancel` | 取消排队中的文档导入任务               | `POST /api/v1/capability/import-tasks/:id/cancel` | `ova documents import cancel`         | `documents.import.cancel` | `tenant_operator` |
| `documents.import.retry`  | 重试失败或已取消的文档导入任务         | `POST /api/v1/capability/import-tasks/:id/retry`  | `ova documents import retry`          | `documents.import.retry`  | `tenant_operator` |
| `documents.import.events` | 查看文档导入任务进度事件快照           | `GET /api/v1/capability/import-tasks/:id/events`  | `ova documents import status --watch` | `documents.import.events` | `tenant_viewer`   |
| `documents.index.status`  | 查看文档草稿与索引同步状态             | `GET /api/v1/capability/documents/:id/index`      | `ova documents index status`          | `documents.index.status`  | `tenant_viewer`   |
| `documents.index.rebuild` | 使用最新草稿重建文档索引               | `POST /api/v1/capability/documents/:id/index/rebuild` | `ova documents index rebuild`     | `documents.index.rebuild` | `tenant_operator` |
| `documents.draft.grep`    | 对 Admin 侧文档草稿正文执行文本匹配    | `POST /api/v1/capability/documents/:id/draft/grep`   | `ova documents draft grep`        | `documents.draft.grep`    | `tenant_viewer`   |

## WebDAV 说明

WebDAV 入口是外部客户端同步 adapter，不是 capability 本体，因此不会出现在 capability catalog 中。它复用 capability API key 进行 Basic Auth，路径租户和 `username` 均支持租户记录 UUID 或租户唯一标识，二者必须解析到同一租户，`password` 使用 capability API key。目录浏览走 `PROPFIND`，文档叶子 `GET` 复用 `DocumentService.loadContent()`，会优先返回最新草稿；没有草稿时才回退到节点 `contentUri` 或文档容器内已有正文叶子。写入侧当前支持 `MKCOL` 创建目录、`PUT` 新建或覆盖受支持文件、`DELETE` 删除知识库、叶子文件或空目录，以及 `MOVE` 重命名知识库，或在同一知识库内重命名、移动文件与目录；`PUT` 新建和覆盖文件都会直接保存草稿并标记索引过期，不再派生本地导入任务。`MOVE` 只调整 Admin 侧知识树元数据，不修改稳定资源容器 URI。

## 能力契约

每个能力契约都是四种入口的单一事实源，当前由 `CapabilityCatalogService` 提供。

```json
{
  "id": "knowledge.search",
  "version": "v1",
  "displayName": "Knowledge Search",
  "description": "在租户知识域内执行语义搜索",
  "inputSchema": {
    "type": "object",
    "properties": {
      "query": { "type": "string" },
      "limit": { "type": "number" },
      "scoreThreshold": { "type": "number" }
    },
    "required": ["query"]
  },
  "outputSchema": {
    "type": "object",
    "properties": {
      "items": { "type": "array" }
    }
  },
  "permissionRequirement": "tenant",
  "minimumRole": "tenant_viewer",
  "auditLevel": "standard",
  "http": {
    "method": "POST",
    "path": "/api/v1/knowledge/search"
  },
  "cli": {
    "command": "ova knowledge search"
  }
}
```

## 四种入口的职责

| 入口  | 适用客户端                                      | 职责边界                                                             |
| ----- | ----------------------------------------------- | -------------------------------------------------------------------- |
| HTTP  | 后端系统、网关、自动化脚本、无本地 CLI 的 Agent | 直接暴露 RESTful capability 接口                                     |
| CLI   | 开发者机器、CI、运维终端、Agent 宿主机          | 提供本地 profile、自动刷新、结构化输出和诊断命令                     |
| MCP   | Claude、Cursor、IDE 等原生 MCP 客户端           | 把 capability catalog 投影为 `tools/list`，把调用映射为 `tools/call` |
| Skill | Codex、Claude Skills、企业 Agent 平台           | 编排 HTTP 或 CLI，不定义新协议，不模拟 MCP                           |

## 认证与凭证

Capability 调用最终都会解析为统一 `Principal`。

| 凭证                    | 常见入口              | 说明                                    |
| ----------------------- | --------------------- | --------------------------------------- |
| JWT access token        | Web、HTTP、CLI 登录态 | 用户身份凭证，可通过 refresh token 续期 |
| Capability access token | HTTP、Skill、服务调用 | 已登录用户换取的能力调用 token          |
| Session key             | MCP、短会话 Agent     | 短期会话凭证，适合桌面或临时会话        |
| API key                 | CLI、MCP、自动化任务  | 可吊销机器凭证，适合长期配置            |

推荐流程见 [认证与凭证](./AUTH_AND_CREDENTIALS.md)。

## 权限边界

- `knowledge.*` 最低角色为 `tenant_viewer`，只允许在租户内检索。
- `knowledge.search`、`knowledge.grep`、`resources.*`、`knowledgeBases.*`、`knowledgeTree.*` 均会在最低角色校验通过后继续套用知识节点 ACL；租户内用户也不能借 capability 越过 `knowledge_nodes.acl` 读取受限节点或资源范围。
- `resources.*` 最低角色为 `tenant_operator`，避免低权限用户枚举资源结构。
- `knowledgeBases.*` 与 `knowledgeTree.*` 是文档导入前置选择能力，只开放只读查询，不承担知识空间管理职责；归档知识库不会出现在列表中，详情与树查询会按不存在处理。
- `documents.import.status`、`documents.import.list` 与 `documents.import.events` 对 `tenant_viewer` 开放；创建、取消和重试导入任务需要 `tenant_operator`。
- `documents.import.status`、`documents.import.list`、`documents.import.events`、`documents.import.cancel` 与 `documents.import.retry` 在角色校验通过后，也会继续按目标知识库/节点 ACL 收敛；用户只能查看和操作自己可见范围内的导入任务。
- `documents.import.create` capability 只支持 `local`、`url`、`manifest` 三类来源；本地文件使用 capability 命名空间下的 multipart 上传入口，因此 CLI、HTTP 和 MCP 派生的业务操作员凭证都能保持同一套授权语义。飞书、钉钉、Git 等需要集成凭证的来源走导入任务 API 或控制台集成流程。WebDAV 仍用于外部客户端访问知识资源，不作为导入来源。
- WebDAV 覆盖和在线协作编辑只保存最新草稿并标记索引过期；`documents.index.rebuild` 才会触发 OpenViking 正文写入与索引刷新。
- `documents.index.status`、`documents.index.rebuild`、`documents.draft.grep` 以及控制台 `/api/v1/editor/:nodeId*` 文档读写入口都会先检查文档节点 ACL，再决定是否返回草稿、索引状态或执行重建。
- WebDAV 入口当前按 `tenant -> knowledge base -> knowledge tree node` 映射，叶子节点按文件资源输出；`MKCOL`、`PUT`、`DELETE` 和 `MOVE` 至少需要 `tenant_operator` 权限。
- Adapter 不允许覆盖能力契约中的 `minimumRole`。
- 租户外 URI 必须显式拒绝，不做静默收敛后继续执行。
- 下游 OpenViking 访问范围必须由服务端租户 scope 推导，不能直接信任客户端传入 URI。

## 响应与追踪

HTTP、CLI、MCP 和 Skill 都应保留或透传以下追踪信息：

| 字段             | 说明                                      |
| ---------------- | ----------------------------------------- |
| `traceId`        | 服务端为一次 capability 调用生成的追踪 ID |
| `requestId`      | 客户端传入或服务端生成的请求 ID           |
| `channel`        | `http`、`cli`、`mcp` 或 `skill`           |
| `clientType`     | 调用方类型                                |
| `credentialType` | 解析出的凭证类型                          |
| `capability`     | 当前 capability id                        |

## 新增能力的流程

1. 在 Domain 中定义输入、输出和 capability id。
2. 在 Application 层补充 contract、授权规则和执行编排。
3. 在 Infrastructure 层实现对 OpenViking 或其他下游服务的访问。
4. 在 HTTP adapter 中暴露 RESTful 接口。
5. 在 CLI 中增加同名命令，并支持 `text`、`json`、`jsonl` 输出。
6. 确认 MCP `tools/list` 能从 catalog 自动发现该能力。
7. 更新 Skill 模板和 `examples/`。
8. 为授权、输入校验、成功调用、失败调用和追踪字段补测试。

## 生产扩展位

- `GET /api/v1/observability/capabilities/prometheus` 已预留 Prometheus 指标抓取入口。
- `CapabilityRateLimitStore` 已抽象，可替换为 Redis 或分布式 KV 以支持多实例。
- 指标聚合与 exporter 分离，后续可接 OpenTelemetry Collector。
- CredentialStore 已在 CLI 内抽象，后续可接系统 keychain。
