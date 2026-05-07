---
name: openviking-admin
description: 使用 OpenViking Admin 操作 OpenViking 知识与记忆能力的标准 Skill。凡是用户要检索知识、检索记忆、查看资源树、查询知识库或知识树、上传/导入文档、更新知识或记忆、查看导入进度、调用 OpenViking capability，或让大模型基于本项目处理知识资产时，都应优先使用本 Skill。它规定先检查并使用项目 MCP 能力；MCP 不可用时再使用 @openviking-admin/ova-cli；两者都不可用时，提示用户配置 MCP 或安装并配置 OVA CLI。
---

# OpenViking Admin

本 Skill 指导 Agent 使用 OpenViking Admin 操作 OpenViking 的知识与记忆能力。目标是让模型优先复用项目已经暴露的能力入口，而不是绕过能力平台、臆造接口或直接操作数据库。

## 入口优先级

按以下顺序选择入口：

```text
MCP -> OVA CLI -> 配置指引
```

不要把 HTTP 当作本 Skill 的默认兜底。HTTP 是平台能力的一等入口，但本 Skill 的职责是让大模型优先使用更适合 Agent 的 MCP，其次使用本地 CLI；只有在具体运行环境明确提供 HTTP 凭证和端点时，才可参考项目文档使用 HTTP。

## 适用任务

当用户要求以下操作时使用本 Skill：

- 检索或 grep 租户知识与记忆。
- 查看资源列表或资源树。
- 查看知识库列表、知识库详情。
- 查看知识树节点列表、节点详情。
- 上传、导入或更新知识/记忆相关文档。
- 创建文档导入任务、查看导入进度、取消或重试导入任务。
- 发现 capability catalog。
- 为其他 Agent/Skill 规划 OpenViking Admin 接入方式。

## 第一步：检查 MCP 是否可用

优先判断当前运行环境是否已经配置 OpenViking MCP。

可用迹象包括：

- 工具列表中存在 OpenViking MCP 暴露的工具，例如：
  - `knowledge.search`
  - `knowledge.grep`
  - `resources.list`
  - `resources.tree`
  - `knowledgeBases.list`
  - `knowledgeBases.detail`
  - `knowledgeTree.list`
  - `knowledgeTree.detail`
  - `documents.import.create`
  - `documents.import.status`
- 当前 MCP 客户端可通过 `tools/list` 看到上述 capability。
- 用户明确说明已经配置 OpenViking MCP server。

如果 MCP 可用，直接使用 MCP tool 调用对应 capability。调用后在结果中保留 `traceId`，便于排障。

### MCP 调用选择

| 用户意图 | 首选 MCP tool |
| -------- | ------------- |
| 语义搜索 | `knowledge.search` |
| 文本匹配 | `knowledge.grep` |
| 资源列表 | `resources.list` |
| 资源树 | `resources.tree` |
| 知识库列表 | `knowledgeBases.list` |
| 知识库详情 | `knowledgeBases.detail` |
| 知识树列表 | `knowledgeTree.list` |
| 知识树详情 | `knowledgeTree.detail` |
| 创建文档导入 | `documents.import.create` |
| 查看导入进度 | `documents.import.status` 或 `documents.import.events` |
| 导入任务列表 | `documents.import.list` |
| 取消导入 | `documents.import.cancel` |
| 重试导入 | `documents.import.retry` |

文档导入来源仅使用 `local`、`url`、`manifest`。WebDAV 不作为导入来源。

## 第二步：MCP 不可用时检查 OVA CLI

如果没有可用 MCP，再检查是否能使用 `@openviking-admin/ova-cli`。

优先尝试以下命令之一：

```bash
ova doctor --output json
ova capabilities list --output json
```

在仓库开发环境中也可以使用：

```bash
npm run ova -- doctor --output json
npm run ova -- capabilities list --output json
```

如果 CLI 可用，使用 `ova` 调用能力，并优先使用 `--output json` 或 `--output jsonl`，方便 Agent 解析。

### OVA CLI 调用选择

| 用户意图 | CLI 命令 |
| -------- | -------- |
| 语义搜索 | `ova knowledge search --query <query> --output json` |
| 文本匹配 | `ova knowledge grep --pattern <pattern> --output json` |
| 资源列表 | `ova resources list --output json` |
| 资源树 | `ova resources tree --depth 2 --output json` |
| 知识库列表 | `ova kb list --output json` |
| 知识库详情 | `ova kb detail --id <kbId> --output json` |
| 知识树列表 | `ova tree list --kb <kbId> --output json` |
| 知识树详情 | `ova tree detail --id <nodeId> --output json` |
| 创建文档导入 | `ova documents import <url> --kb <kbId> --type url --output json` |
| 查看导入进度 | `ova documents import status --task <taskId> --output json` |
| 查看进度事件 | `ova documents import status --watch --task <taskId> --output json` |
| 导入任务列表 | `ova documents import list --output json` |
| 取消导入 | `ova documents import cancel --task <taskId> --output json` |
| 重试导入 | `ova documents import retry --task <taskId> --output json` |

## 第三步：MCP 和 CLI 都不可用时给出配置指引

如果 MCP 与 CLI 都不可用，不要假装已经完成操作。应明确告诉用户当前缺少可用入口，并给出两条可选配置路径。

### 配置 MCP

用户需要先从 OpenViking Admin 控制台创建或获取 capability API key，然后在 MCP 客户端中配置服务。

Claude Desktop / MCP remote 示例：

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

也可以使用短期 session key：

```text
http://localhost:6001/api/v1/mcp/sse?sessionKey=<session-key>
```

### 安装并配置 OVA CLI

全局安装：

```bash
npm install -g @openviking-admin/ova-cli
```

登录并生成本地 profile：

```bash
ova auth login \
  --server http://localhost:6001 \
  --username <username> \
  --password <password> \
  --tenant-code <tenantCode>
```

也可以只配置服务地址，再由用户登录：

```bash
ova config set --server http://localhost:6001
ova auth login --username <username> --password <password> --tenant-code <tenantCode>
```

仓库开发环境可使用：

```bash
npm run ova -- auth login \
  --server http://localhost:6001 \
  --username <username> \
  --password <password> \
  --tenant-code <tenantCode>
```

如果运行环境需要环境变量，建议提供：

```env
OPENVIKING_ADMIN_BASE_URL=http://localhost:6001
OPENVIKING_TENANT_CODE=<tenantCode>
OPENVIKING_CAPABILITY_KEY=<ov-sk-...>
```

不要要求用户把密码写入长期环境变量。密码只用于交互登录或短期初始化。

## 响应规范

执行能力调用后，回复用户时包含：

- 使用了哪个入口：`MCP` 或 `OVA CLI`。
- 调用了哪个 capability 或命令。
- 关键结果摘要。
- `traceId`，如果响应中存在。

当无法执行时，回复应包含：

- 当前缺少 MCP 和 CLI 的判断。
- 推荐优先配置 MCP 的原因。
- OVA CLI 安装和登录命令。
- 用户下一步需要提供的最小信息，例如 server 地址、tenantCode 或 API key。

## 边界

- 不要绕过 capability 平台直接访问数据库。
- 不要编造不存在的 capability、CLI 命令或 MCP 工具。
- 不要把 MCP SSE URL 当作普通业务 HTTP 接口调用。
- 不要在回复中暴露完整 API key、JWT、session key 或用户密码。
- 不要把 WebDAV 当作文档导入来源。