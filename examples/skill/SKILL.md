# OpenViking Knowledge Tools

使用 OpenViking Admin 的 capability 在租户授权范围内检索私域知识。

## 能力发现

1. 如果运行环境中存在 `ova`，优先执行 `ova capabilities list --output json`。
2. 如果没有 `ova`，使用宿主环境提供的凭证调用 `GET /api/capabilities`。
3. capability id 必须以平台返回结果为准，不自行维护第二套工具名。

## 能力调用

- `knowledge.search`：优先执行 `ova knowledge search --output json`，不可用时回退到 `POST /api/knowledge/search`。
- `knowledge.grep`：优先执行 `ova knowledge grep --output json`，不可用时回退到 `POST /api/knowledge/grep`。
- `resources.list`：优先执行 `ova resources list --output json`，不可用时回退到 `GET /api/resources`。
- `resources.tree`：优先执行 `ova resources tree --output json`，不可用时回退到 `GET /api/resources/tree`。

## 追踪要求

始终保留响应中的 `traceId`。如果最终回答给用户，应在需要排障时附上 `traceId`；如果写入执行日志，应把 `traceId` 和 capability id 一起记录。

## 边界

不要在 Skill 内模拟 MCP JSON-RPC。MCP 只给原生支持该协议的客户端使用。

不要在 Skill 内硬编码用户密码、长期 token 或租户外 URI。凭证应由宿主环境注入，资源范围应由服务端身份和租户上下文决定。
