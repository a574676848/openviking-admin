# OpenViking Admin 示例

本目录提供当前公开接入方式的最小可运行样例。所有样例默认服务地址为 `http://localhost:6001`。

## 准备

启动后端服务：

```bash
cd apps/server
pnpm start:dev
```

如果使用仓内 CLI：

```bash
npm run ova -- doctor
```

如果使用全局 CLI：

```bash
npm install -g @openviking-admin/ova-cli
ova doctor
```

## 目录

| 目录 | 说明 |
|------|------|
| `cli` | 使用 `ova` 登录、发现能力、调用搜索、签发 API key 和诊断 |
| `http` | 使用 curl 登录、换证和调用 capability HTTP 接口 |
| `mcp` | MCP 客户端配置和 JSON-RPC 调试请求 |
| `skill` | Agent Skill 指令模板和接入约束 |

## 凭证选择

| 场景 | 推荐方式 |
|------|------|
| 人类本地调试 | `ova auth login` |
| CI 或自动化脚本 | `ova auth client-credentials --name <name> --save` |
| 后端服务集成 | HTTP 登录或 SSO 后调用 `/api/auth/token/exchange` |
| Claude Desktop / Cursor | API key 或 session key |
| Agent Skill | 优先 `ova`，不可用时回退 HTTP |
