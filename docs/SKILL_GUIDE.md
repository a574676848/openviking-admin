# Skill 集成指南

Skill 是面向 Agent 平台的轻量接入模板。它不定义新协议，也不绕过能力平台；它只负责在 Agent 运行环境中选择最合适的入口调用同一组 capability。

## 项目内置 Skill

仓库提供官方规范的项目 Skill：[`skills/openviking-admin/SKILL.md`](../skills/openviking-admin/SKILL.md)。

如果使用 `ova init` 或 `ova bootstrap`，CLI 还会把同一份 Skill 自动复制到：

- `.claude/skills/openviking-admin/SKILL.md`
- `.agents/skills/openviking-admin/SKILL.md`

并同步把 OpenViking 调用规则注入到 `AGENTS.md` 与 `CLAUDE.md`。

该 Skill 面向大模型和 Agent 宿主环境，规定使用项目能力时的入口优先级：

```text
MCP -> OVA CLI -> 配置指引
```

它要求先检查并使用 OpenViking MCP 暴露的 capability；如果 MCP 未安装或不可用，再检查 `@openviking-admin/ova-cli`；两者都不可用时，向用户说明如何配置 MCP，或如何安装 `@openviking-admin/ova-cli` 并完成登录配置。

## 适用场景

- Codex、Claude Skills 或企业自研 Agent 平台需要调用 OpenViking Admin。
- Agent 运行环境可能有本地 CLI，也可能只能发 HTTP 请求。
- Agent 需要把 `traceId` 回传到对话、日志或审计系统中。

## 设计原则

- 优先从 `GET /api/v1/capabilities` 发现能力，不硬编码过期工具名。
- 本机已安装 `ova` 时，可优先使用 CLI 获得 profile、自动刷新、`json/jsonl` 输出和诊断能力。
- 没有 CLI 或运行在受限沙箱时，直接调用 HTTP capability 接口。
- 不在 Skill 中模拟 MCP JSON-RPC；MCP 只给原生 MCP 客户端使用。
- 不在 Skill 中拼接跨租户 URI；资源范围必须来自用户身份或服务端返回。

## 推荐调用流程

```text
Agent 运行环境
  -> 先读取 AGENTS.md / CLAUDE.md 中的 OpenViking 注入块
  -> 如存在 .openviking/capabilities.json，可优先读取最新快照
  -> 读取 Skill 指令
  -> 探测 ova 是否可用
  -> 调用 GET /api/v1/capabilities 或 ova capabilities list
  -> 根据 capability id 选择 HTTP 或 CLI
  -> 调用能力
  -> 将 traceId 写入 Agent 日志
```

## HTTP 模式

```bash
curl -X POST "http://localhost:6001/api/v1/knowledge/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <capability-access-token>" \
  -H "x-request-id: agent-run-001" \
  -d '{
    "query": "多租户隔离",
    "limit": 5
  }'
```

## CLI 模式

```bash
ova knowledge search \
  --query "多租户隔离" \
  --limit 5 \
  --output json
```

CLI 模式适合有本地 profile 的 Agent 宿主机。Agent 不需要自己管理 refresh token，也不需要把长期凭证明文写在 Skill 文件中。

## 推荐 Skill 模板

```markdown
# OpenViking Knowledge Tools

使用 OpenViking Admin 的 capability 在租户授权范围内检索私域知识。

## 能力发现

1. 如果运行环境中存在 `ova`，优先执行 `ova capabilities list --output json`。
2. 如果没有 `ova`，使用宿主环境提供的凭证调用 `GET /api/v1/capabilities`。
3. capability id 必须以平台返回结果为准，不自行维护第二套工具名。

## 能力调用

- `knowledge.search`：优先执行 `ova knowledge search --output json`，不可用时回退到 `POST /api/v1/knowledge/search`。
- `knowledge.grep`：优先执行 `ova knowledge grep --output json`，不可用时回退到 `POST /api/v1/knowledge/grep`。
- `resources.list`：优先执行 `ova resources list --output json`，不可用时回退到 `GET /api/v1/resources`。
- `resources.tree`：优先执行 `ova resources tree --output json`，不可用时回退到 `GET /api/v1/resources/tree`。
- `knowledgeBases.list`：优先执行 `ova kb list --output json`，不可用时回退到 `GET /api/v1/knowledge-bases`。
- `knowledgeBases.detail`：优先执行 `ova kb detail --id <kbId> --output json`，不可用时回退到 `GET /api/v1/knowledge-bases/:id`。
- `knowledgeTree.list`：优先执行 `ova tree list --kb <kbId> --output json`，不可用时回退到 `GET /api/v1/knowledge-bases/:id/tree`。
- `knowledgeTree.detail`：优先执行 `ova tree detail --id <nodeId> --output json`，不可用时回退到 `GET /api/v1/knowledge-tree/:id`。
- `documents.import.create`：优先执行 `ova documents import <url> --kb <kbId> --output json`，不可用时回退到 `POST /api/v1/import-tasks/documents`。
- `documents.import.status`：优先执行 `ova documents import status --task <taskId> --output json`，不可用时回退到 `GET /api/v1/import-tasks/:id`。
- `documents.import.list`：优先执行 `ova documents import list --output json`，不可用时回退到 `GET /api/v1/import-tasks`。
- `documents.import.cancel`：优先执行 `ova documents import cancel --task <taskId> --output json`，不可用时回退到 `POST /api/v1/import-tasks/:id/cancel`。
- `documents.import.retry`：优先执行 `ova documents import retry --task <taskId> --output json`，不可用时回退到 `POST /api/v1/import-tasks/:id/retry`。
- `documents.import.events`：优先执行 `ova documents import status --watch --task <taskId> --output json`，不可用时回退到 `GET /api/v1/import-tasks/:id/events`。

始终保留响应中的 `traceId`。
```

## 凭证建议

| 场景 | 推荐凭证 |
|------|------|
| Agent 与用户会话绑定 | SSO/JWT 换取 capability access token |
| 短会话桌面端 | session key |
| 长期自动化 Agent | 可吊销 API key |
| 本地开发 Agent | `ova auth login` 管理 profile |

## 不推荐做法

- 不要在 Skill 中保存用户密码。
- 不要把 MCP SSE URL 当作普通 HTTP capability 接口使用。
- 不要在 Skill 中重新定义平台未返回的工具名。
- 不要绕过 `/api/v1/capabilities` 自行维护过期能力列表。
