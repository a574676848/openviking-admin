# 🤖 MCP 协议集成手册 (MCP Guide)

`OpenViking Admin` 原生支持 **Model Context Protocol (MCP)**，允许 AI 客户端（如 Claude, Cursor）安全地访问企业的私域知识库。

---

## 1. 核心工具集 (Tools)

系统通过 `McpService` 暴露了以下工具：

| 工具名 | 说明 | 输入参数 | 返回 |
|--------|------|----------|------|
| `search_knowledge` | 执行带权限隔离的语义检索 | `{ query, topK?, scope? }` | 检索结果数组 |
| `grep_knowledge` | 执行正则表达式文本匹配 | `{ pattern, uri? }` | 匹配结果 |
| `list_resources` | 浏览租户授权范围内的目录结构 | `{ uri? }` | 目录列表 |
| `tree_resources` | 生成知识资产的树状视图 | `{ uri? }` | 树状结构 |

---

## 2. 安全保障：URI 强制锁定

所有的 MCP 调用均通过 `viking://resources/tenants/{tenantId}/` 协议头进行资源寻址。
即使 AI 代理发起请求，其查询范围也被代码逻辑死死锁在所属租户的物理空间内，从根本上杜绝了跨租户信息越权。

---

## 3. 接入配置

### 3.1 生成 MCP API Key

在 OpenViking Admin 前端 (`/console/mcp`) 或通过 API 生成 Key：

```bash
POST /api/mcp/keys
{
  "name": "Claude Desktop"
}
```

返回：
```json
{
  "id": "uuid",
  "name": "Claude Desktop",
  "apiKey": "ov-sk-xxxxxxxxxxxxxxxx",
  "createdAt": "2024-01-15T08:30:00.000Z"
}
```

### 3.2 配置 AI 客户端

#### Claude Desktop

编辑 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "openviking": {
      "command": "npx",
      "args": ["@anthropic-ai/mcp-remote", "--url", "http://localhost:6001/api/mcp/sse?key=ov-sk-xxxxxxxxxxxxxxxx"]
    }
  }
}
```

#### Cursor

在 Cursor 设置中添加 MCP Server：

```json
{
  "mcpServers": {
    "openviking": {
      "url": "http://localhost:6001/api/mcp/sse?key=ov-sk-xxxxxxxxxxxxxxxx"
    }
  }
}
```

---

## 4. 调试步骤

### 4.1 测试 SSE 连接

```bash
curl -N "http://localhost:6001/api/mcp/sse?key=ov-sk-xxxxxxxxxxxxxxxx"
```

预期输出：
```
event: endpoint
data: http://localhost:6001/api/mcp/message?sessionId=xxx&key=ov-sk-xxx
```

### 4.2 测试 JSON-RPC 调用

```bash
curl -X POST "http://localhost:6001/api/mcp/message?sessionId=xxx&key=ov-sk-xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "search_knowledge",
      "arguments": {
        "query": "如何配置多租户隔离",
        "topK": 5
      }
    }
  }'
```

### 4.3 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| SSE 连接立即断开 | API Key 无效 | 检查 Key 是否存在且未被删除 |
| 工具调用返回空 | 租户知识库为空 | 确认租户下有可用的知识库和文档 |
| 401 Unauthorized | Key 参数缺失或格式错误 | 确认 `?key=` 查询参数正确 |
| 500 Internal Error | OV 引擎不可达 | 检查 `OV_BASE_URL` 和 `OV_API_KEY` |

### 4.4 查看 MCP Key 使用情况

```bash
GET /api/mcp/keys
```

返回所有 Key 及其 `lastUsedAt` 字段，可识别未使用或异常的 Key。

---

## 5. 安全注意事项

- MCP API Key 与用户和租户绑定，不可跨租户使用
- Key 格式为 `ov-sk-<random>`，不可预测
- 建议定期轮换 Key，废弃不再使用的 Key
- 不要在客户端代码中硬编码 Key，应通过环境变量或配置文件注入

---

> 下一步建议：阅读 [开发者指南](./DEVELOPMENT.md) 开始共同构建。