# Skill 示例

本目录展示 Agent Skill 如何接入 OpenViking Admin。Skill 不定义新协议，只在 HTTP 和 `ova` CLI 之间选择可用入口。

## 推荐策略

1. 探测 `ova` 是否可用。
2. 可用时运行 `ova capabilities list --output json` 发现能力。
3. 不可用时调用 `GET /api/v1/capabilities`。
4. 按 capability id 调用对应 HTTP 接口或 CLI 命令。
5. 将响应中的 `traceId` 写入 Agent 日志或最终回答。

## 本地 CLI 调用

```bash
ova knowledge search --query "多租户隔离" --limit 5 --output json
ova knowledge grep --pattern "tenant_scope" --uri "viking://acme/wiki"
ova resources list --uri "viking://acme"
ova resources tree --uri "viking://acme" --depth 2 --output json
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
```

## 当前 capability 映射

| Capability | CLI | HTTP |
|------|------|------|
| `knowledge.search` | `ova knowledge search` | `POST /api/v1/knowledge/search` |
| `knowledge.grep` | `ova knowledge grep` | `POST /api/v1/knowledge/grep` |
| `resources.list` | `ova resources list` | `GET /api/v1/resources` |
| `resources.tree` | `ova resources tree` | `GET /api/v1/resources/tree` |
