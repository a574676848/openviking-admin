# MCP 指南

OpenViking Admin 支持 Model Context Protocol (MCP)，让 Claude、Cursor、IDE 和其他 MCP 客户端以标准 `tools/list`、`tools/call` 方式访问企业私域知识能力。

MCP 是协议入口，不是独立业务层。MCP 暴露的工具来自统一 capability catalog，工具调用最终仍进入能力平台。

![基于 MCP 与 Rerank 的高精准检索流](<./images/基于 MCP 与 Rerank 的高精准检索流.png>)

当客户端通过 MCP 发起知识检索时，服务端会先完成会话鉴权和 capability 映射，再进入统一检索链路、权限过滤和结果返回。

## 支持的工具

| Tool | Capability | 说明 |
|------|------|------|
| `knowledge.search` | `knowledge.search` | 在租户知识域内执行语义搜索 |
| `knowledge.grep` | `knowledge.grep` | 在租户知识域内执行文本匹配 |
| `resources.list` | `resources.list` | 列出租户授权范围内的资源 |
| `resources.tree` | `resources.tree` | 获取租户资源树 |
| `knowledgeBases.list` | `knowledgeBases.list` | 列出当前租户可导入的知识库 |
| `knowledgeBases.detail` | `knowledgeBases.detail` | 查看知识库详情与导入根路径 |
| `knowledgeTree.list` | `knowledgeTree.list` | 列出知识库下可导入节点 |
| `knowledgeTree.detail` | `knowledgeTree.detail` | 查看知识树节点详情与导入路径 |
| `documents.import.create` | `documents.import.create` | 创建本地、URL 或 manifest 文档导入任务 |
| `documents.import.status` | `documents.import.status` | 查看文档导入任务进度 |
| `documents.import.list` | `documents.import.list` | 列出当前租户文档导入任务 |
| `documents.import.cancel` | `documents.import.cancel` | 取消排队中的文档导入任务 |
| `documents.import.retry` | `documents.import.retry` | 重试失败或已取消的文档导入任务 |
| `documents.import.events` | `documents.import.events` | 查看文档导入任务进度事件快照 |

## 获取凭证

MCP 客户端可以使用两类凭证：

| 凭证 | 适用场景 | 获取方式 |
|------|------|------|
| API key | Claude Desktop、Cursor、长期桌面配置 | `ova auth client-credentials --name <client> --save` 或 HTTP 换证 |
| Session key | 已登录用户发起的短期会话 | `ova auth session-exchange` 或 `POST /api/v1/auth/session/exchange` |

示例：

```bash
ova auth login --server http://localhost:6001 --username admin --password acme@123 --tenant-code acme
ova auth client-credentials --name claude-desktop --output json
ova auth session-exchange --output json
```

## Claude Desktop 配置

```json
{
  "mcpServers": {
    "openviking": {
      "command": "npx",
      "args": [
        "@anthropic-ai/mcp-remote",
        "--url",
        "http://localhost:6001/api/v1/mcp/sse?key=<ov-sk-...>"
      ]
    }
  }
}
```

使用短期 session key：

```json
{
  "mcpServers": {
    "openviking": {
      "command": "npx",
      "args": [
        "@anthropic-ai/mcp-remote",
        "--url",
        "http://localhost:6001/api/v1/mcp/sse?sessionKey=<session-key>"
      ]
    }
  }
}
```

## Cursor 配置

```json
{
  "mcpServers": {
    "openviking": {
      "url": "http://localhost:6001/api/v1/mcp/sse?key=<ov-sk-...>"
    }
  }
}
```

## 协议流转

```text
MCP 客户端
  -> GET /api/v1/mcp/sse?key=...
  -> 接收消息端点地址
  -> 向 POST /api/v1/mcp/message 发送 JSON-RPC
  -> MCP controller 映射 tools/list 或 tools/call
  -> CapabilityExecutionService 执行 capability
  -> 响应格式化为 MCP content[]
```

## 调试 SSE

```bash
curl -N "http://localhost:6001/api/v1/mcp/sse?key=<ov-sk-...>"
```

预期会返回 SSE 消息端点信息，客户端随后向该消息端点发送 JSON-RPC 请求。

## 调试 tools/list

```bash
curl -X POST "http://localhost:6001/api/v1/mcp/message?sessionId=<id>&sessionToken=<token>&key=<ov-sk-...>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list"
  }'
```

## 调试 tools/call

```bash
curl -X POST "http://localhost:6001/api/v1/mcp/message?sessionId=<id>&sessionToken=<token>&key=<ov-sk-...>" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "knowledge.search",
      "arguments": {
        "query": "如何配置多租户隔离",
        "limit": 5
      }
    }
  }'
```

## 与其他入口的关系

| 入口 | 何时使用 |
|------|------|
| HTTP | 客户端不支持 MCP，或需要网关、服务端、脚本直接集成 |
| CLI | 本地开发、CI、运维终端、Agent 宿主机已有 `ova` |
| MCP | 客户端原生支持 MCP，需要标准 tools 发现和调用 |
| Skill | Agent 平台需要可读指令，并在 HTTP/CLI 间选择 |

## 常见问题

| 问题 | 原因 | 处理 |
|------|------|------|
| SSE 连接立即断开 | API key 或 session key 无效 | 重新换证，确认凭证未被吊销 |
| `tools/list` 为空 | 服务端 capability catalog 未加载 | 检查服务启动日志和 `/api/v1/capabilities` |
| `tools/call` 返回 403 | 当前用户角色低于 capability `minimumRole` | 更换账号或调整租户角色 |
| 工具调用返回空 | 租户知识库为空或 URI scope 不匹配 | 检查知识导入状态和资源 URI |
