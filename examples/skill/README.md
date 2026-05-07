# Skill 示例

本目录展示 Agent Skill 如何接入 OpenViking Admin。Skill 不定义新协议，只在 MCP、`ova` CLI 和配置指引之间选择可用入口。

## 推荐策略

1. 先检查 MCP tools 是否已经可用。
2. 如仓库已执行 `ova init` 或 `ova bootstrap`，优先读取 `.openviking/capabilities.json`。
3. 然后运行 `ova capabilities list --output json` 发现最新 capability。
4. MCP 不可用时，按 capability id 选择 CLI 或 HTTP 回退。
5. 将响应中的 `traceId` 写入 Agent 日志或最终回答。

## 推荐初始化

```bash
ova bootstrap --path <repo>
```

该命令会为 Skill 准备：

- repo-local Skill 文件
- `AGENTS.md` / `CLAUDE.md` 注入块
- `.openviking/capabilities.json` capability 快照

## 本地 CLI 调用

```bash
ova knowledge search --query "多租户隔离" --limit 5 --output json
ova knowledge grep --pattern "tenant_scope" --uri "viking://acme/wiki"
ova resources list --uri "viking://acme"
ova resources tree --uri "viking://acme" --depth 2 --output json
ova kb list --output json
ova kb detail --id <kbId> --output json
ova tree list --kb <kbId> --output json
ova tree detail --id <nodeId> --output json
ova documents import "https://example.com/product.pdf" --kb <kbId> --type url --output json
ova documents import status --task <taskId> --watch --output json
ova documents import list --output json
ova documents import cancel --task <taskId> --output json
ova documents import retry --task <taskId> --output json
```

## HTTP 回退调用

```bash
curl -X POST "http://localhost:6001/api/v1/knowledge/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <capability-access-token>" \
  -d '{
    "query": "多租户隔离",
    "limit": 5
  }'
```

```bash
curl -X POST "http://localhost:6001/api/v1/knowledge/grep" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <capability-access-token>" \
  -d '{
    "pattern": "tenant_scope",
    "uri": "viking://acme/wiki"
  }'

curl "http://localhost:6001/api/v1/resources?uri=viking%3A%2F%2Facme" \
  -H "Authorization: Bearer <capability-access-token>"

curl "http://localhost:6001/api/v1/resources/tree?uri=viking%3A%2F%2Facme&depth=2" \
  -H "Authorization: Bearer <capability-access-token>"

curl "http://localhost:6001/api/v1/knowledge-bases?limit=20" \
  -H "Authorization: Bearer <capability-access-token>"

curl "http://localhost:6001/api/v1/knowledge-bases/:id/tree" \
  -H "Authorization: Bearer <capability-access-token>"

curl -X POST "http://localhost:6001/api/v1/import-tasks/documents" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <capability-access-token>" \
  -d '{
    "sourceType": "url",
    "knowledgeBaseId": "<kbId>",
    "sourceUrl": "https://example.com/product.pdf"
  }'

curl "http://localhost:6001/api/v1/import-tasks?limit=20" \
  -H "Authorization: Bearer <capability-access-token>"

curl "http://localhost:6001/api/v1/import-tasks/:id" \
  -H "Authorization: Bearer <capability-access-token>"

curl -X POST "http://localhost:6001/api/v1/import-tasks/:id/cancel" \
  -H "Authorization: Bearer <capability-access-token>"

curl -X POST "http://localhost:6001/api/v1/import-tasks/:id/retry" \
  -H "Authorization: Bearer <capability-access-token>"

curl "http://localhost:6001/api/v1/import-tasks/:id/events" \
  -H "Authorization: Bearer <capability-access-token>"
```

## 当前 capability 摘要

下面这张表只作为当前仓库的能力摘要，便于阅读和 smoke check；真正的单一事实源仍然是 capability registry，以及 `ova capabilities list --output json` / `.openviking/capabilities.json` 的实时结果。

| Capability | CLI | HTTP |
|------|------|------|
| `knowledge.search` | `ova knowledge search` | `POST /api/v1/knowledge/search` |
| `knowledge.grep` | `ova knowledge grep` | `POST /api/v1/knowledge/grep` |
| `resources.list` | `ova resources list` | `GET /api/v1/resources` |
| `resources.tree` | `ova resources tree` | `GET /api/v1/resources/tree` |
| `knowledgeBases.list` | `ova kb list` | `GET /api/v1/knowledge-bases` |
| `knowledgeBases.detail` | `ova kb detail` | `GET /api/v1/knowledge-bases/:id` |
| `knowledgeTree.list` | `ova tree list` | `GET /api/v1/knowledge-bases/:id/tree` |
| `knowledgeTree.detail` | `ova tree detail` | `GET /api/v1/knowledge-tree/:id` |
| `documents.import.create` | `ova documents import` | `POST /api/v1/import-tasks/documents` |
| `documents.import.status` | `ova documents import status` | `GET /api/v1/import-tasks/:id` |
| `documents.import.list` | `ova documents import list` | `GET /api/v1/import-tasks` |
| `documents.import.cancel` | `ova documents import cancel` | `POST /api/v1/import-tasks/:id/cancel` |
| `documents.import.retry` | `ova documents import retry` | `POST /api/v1/import-tasks/:id/retry` |
| `documents.import.events` | `ova documents import status --watch` | `GET /api/v1/import-tasks/:id/events` |

## 关于 capability 映射刷新

推荐做法是：

1. 读取 `.openviking/capabilities.json` 当前快照。
2. 必要时再调用 `ova capabilities list --output json` 或 `GET /api/v1/capabilities` 刷新。
3. 只根据实时返回的 capability id 选择 MCP / CLI / HTTP 入口。
