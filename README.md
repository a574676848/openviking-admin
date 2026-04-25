# OpenViking Admin

> 下一代企业级私域 AI 认知中枢 (Private AI Knowledge OS)。

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Maintainer](https://img.shields.io/badge/Maintainer-%40a574676848-orange.svg)](https://github.com/a574676848)
[![Node.js Version](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/Database-PostgreSQL-blue.svg)](https://www.postgresql.org/)

OpenViking Admin 是基于 OpenViking 核心能力构建的企业级私域 AI 知识管理平台，面向需要数据安全、租户隔离、检索精度和 AI Agent 接入能力的组织。它把企业散落在文档、知识库、代码仓库和业务系统中的私域知识，沉淀为可治理、可审计、可被安全调用的知识底座。

本项目在 OpenViking 的语义索引与算力引擎能力之上，补齐企业管理侧的租户、用户、知识导入、权限、审计、SSO、MCP、CLI、HTTP API 和 Skill 接入能力。

## 为什么需要它

企业接入大模型时，真正难点通常不在“能不能问”，而在以下几个问题：

- 私域知识能否被稳定导入、索引和更新。
- 不同租户、组织、角色之间的数据边界是否足够清晰。
- AI Agent 调用知识能力时，是否能被审计、限流和追踪。
- 开发者、运维、业务系统、桌面 AI 客户端是否能用各自熟悉的方式接入。
- 当检索结果异常时，是否能用 `traceId` 还原完整调用链路。

OpenViking Admin 的设计目标，是把这些问题作为平台能力解决，而不是让每个客户端重复实现。

## 架构全景

![OpenViking 企业 AI 知识中台架构全景图](<./docs/images/OpenViking 企业 AI 知识中台架构全景图.png>)

系统采用前后端分离和洋葱架构。Web 控制台负责租户、用户、知识库、导入任务和系统配置；后端服务负责身份、权限、能力编排、OpenViking 调用、审计和观测；OpenViking 引擎负责底层语义索引、资源检索和知识处理。

### 多维度隔离

![OpenViking 多维度安全隔离与合规矩阵](<./docs/images/OpenViking 多维度安全隔离与合规矩阵.png>)

项目支持 Small、Medium、Large 三级租户隔离：字段级隔离、Schema 级隔离和独立数据库隔离。能力调用还会叠加角色权限、租户上下文和 `viking://` URI scope，避免 AI Agent 或集成客户端越权访问租户外数据。

### 高精准检索

![基于 MCP 与 Rerank 的高精准检索流](<./docs/images/基于 MCP 与 Rerank 的高精准检索流.png>)

检索链路面向企业知识问答场景设计：先基于 OpenViking 做语义召回和资源定位，再结合权限过滤、文本匹配、重排序和调用追踪，尽量减少“查不到、查错库、无法追责”的问题。

### 自动化加工流水线

![企业数字资产自动化加工流水线](<./docs/images/企业数字资产自动化加工流水线.png>)

导入任务负责连接飞书、钉钉、GitHub/GitLab 等来源，把非结构化内容转化为可检索、可权限控制、可被 Agent 调用的知识资产。

## 核心能力

### 企业管理平台

| 能力 | 说明 |
|------|------|
| 租户管理 | 支持不同隔离等级、租户配置和配额 |
| 用户与角色 | 支持超管、租户管理员、操作员、只读用户 |
| 知识库与知识树 | 管理企业知识结构、ACL 和资源 URI |
| 导入任务 | 支持多源知识导入、任务同步和后台处理 |
| SSO 集成 | 支持飞书、钉钉、OIDC、LDAP 等企业登录方式 |
| 审计与观测 | 记录登录、换证、能力调用、失败和拒绝事件 |

### 能力平台

同一组知识能力通过四种平级入口开放，客户端按自身环境选择接入方式。

| 入口 | 适合场景 | 说明 |
|------|------|------|
| HTTP | 后端系统、网关、脚本、无本地 CLI 的 Agent | 直接调用 RESTful capability 接口 |
| CLI | 开发者、本地运维、CI、Agent 宿主机 | 使用独立 `ova` 命令行，支持 profile 和自动刷新 |
| MCP | Claude、Cursor、IDE 等 MCP 客户端 | 标准 `tools/list` 和 `tools/call` |
| Skill | Codex、Claude Skills、自研 Agent 平台 | 轻量编排 HTTP 或 CLI，不发明新协议 |

当前首批开放能力：

| Capability | HTTP | CLI | MCP Tool |
|------|------|------|------|
| `knowledge.search` | `POST /api/knowledge/search` | `ova knowledge search` | `knowledge.search` |
| `knowledge.grep` | `POST /api/knowledge/grep` | `ova knowledge grep` | `knowledge.grep` |
| `resources.list` | `GET /api/resources` | `ova resources list` | `resources.list` |
| `resources.tree` | `GET /api/resources/tree` | `ova resources tree` | `resources.tree` |

## 快速开始

### 环境要求

| 依赖 | 最低版本 | 说明 |
|------|----------|------|
| Node.js | 20 | 运行时环境 |
| pnpm | 8 | 包管理器 |
| PostgreSQL | 14 | 数据库，需要 `uuid-ossp` 扩展 |
| OpenViking | 当前稳定版 | 语义检索与资源索引引擎 |

### 安装依赖

```bash
git clone https://github.com/a574676848/openviking-admin.git
cd openviking-admin
pnpm install
```

### 初始化数据库

```sql
CREATE DATABASE openviking_admin;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
GRANT CREATE ON DATABASE openviking_admin TO postgres;
```

### 启动后端

```bash
cd apps/server
cp .env.example .env
pnpm typeorm migration:run -d src/data-source.ts
node seed-admin.js
pnpm start:dev
```

后端默认地址：`http://localhost:6001/api`。

### 启动 Web 控制台

```bash
cd apps/web
pnpm dev
```

Web 控制台默认地址：`http://localhost:6002`。

更多部署方式见 [部署指南](./docs/DEPLOYMENT.md)。

## 四种接入示例

### HTTP

```bash
curl -X POST "http://localhost:6001/api/knowledge/search" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jwt-or-capability-token>" \
  -d '{
    "query": "多租户隔离",
    "limit": 5,
    "scoreThreshold": 0.5
  }'
```

### CLI

```bash
npm run ova -- auth login --server http://localhost:6001 --username admin --password admin123 --tenant-code acme
npm run ova -- capabilities list
npm run ova -- knowledge search --query "多租户隔离" --limit 5
```

生产或客户端机器上建议安装独立 CLI：

```bash
npm install -g @openviking-admin/ova-cli
ova doctor
```

### MCP

```json
{
  "mcpServers": {
    "openviking": {
      "command": "npx",
      "args": [
        "@anthropic-ai/mcp-remote",
        "--url",
        "http://localhost:6001/api/mcp/sse?key=<ov-sk-...>"
      ]
    }
  }
}
```

### Skill

Skill 不定义新协议，只负责在 Agent 运行环境中发现 capability，并选择 HTTP 或 `ova` CLI 作为调用入口。详见 [Skill 集成指南](./docs/SKILL_GUIDE.md)。

## 文档导航

| 文档 | 说明 |
|------|------|
| [文档首页](./docs/README.md) | 文档组织、阅读路径和图片资产 |
| [架构文档](./docs/ARCHITECTURE.md) | 洋葱架构、核心链路、能力平台分层 |
| [能力平台](./docs/CAPABILITIES.md) | capability 契约、权限、四入口映射和扩展规则 |
| [API 参考](./docs/API_REFERENCE.md) | HTTP 端点、认证方式、响应格式和错误语义 |
| [CLI 指南](./docs/CLI_GUIDE.md) | `ova` 安装、登录、profile、换证和命令参考 |
| [MCP 指南](./docs/MCP_GUIDE.md) | MCP 客户端配置、工具调用和调试 |
| [Skill 集成指南](./docs/SKILL_GUIDE.md) | Agent Skill 集成模式和模板约束 |
| [认证与凭证](./docs/AUTH_AND_CREDENTIALS.md) | 登录、SSO、refresh token 和 capability 凭证 |
| [部署指南](./docs/DEPLOYMENT.md) | 本地、Docker、Nginx 和生产部署 |
| [安全策略](./docs/SECURITY.md) | 威胁模型、权限边界和生产安全建议 |
| [可观测性](./docs/OBSERVABILITY.md) | 指标、追踪、审计和 Prometheus 接入准备 |
| [测试指南](./docs/TESTING.md) | 单元测试、E2E 和覆盖率策略 |
| [故障排查](./docs/TROUBLESHOOTING.md) | 常见问题、诊断命令和修复建议 |

## 示例代码

`examples/` 提供当前四种入口的最小可运行样例：

| 目录 | 说明 |
|------|------|
| [examples/http](./examples/http) | curl 登录、换证、能力调用 |
| [examples/cli](./examples/cli) | `ova` 登录、搜索、签发 key、诊断 |
| [examples/mcp](./examples/mcp) | Claude Desktop / MCP remote 配置与 JSON-RPC 调试 |
| [examples/skill](./examples/skill) | Skill 模板和 HTTP/CLI 回退策略 |

## 贡献

欢迎提交 Issue、PR、文档改进和接入示例。开始贡献前建议先阅读：

- [开发者指南](./docs/DEVELOPMENT.md)
- [测试指南](./docs/TESTING.md)
- [行为准则](./CODE_OF_CONDUCT.md)

## 致谢

本项目深度致谢 [OpenViking](https://github.com/openviking) 官方项目。OpenViking 提供了优秀的语义索引、资源检索与 AI 知识引擎基础能力，OpenViking Admin 在此基础上补齐企业级管理、权限、审计、SSO、MCP、CLI、HTTP 和 Skill 接入能力。

也感谢 Model Context Protocol、NestJS、TypeORM、PostgreSQL 以及开源社区中的相关项目，为本项目的协议接入、工程结构和基础设施提供了可复用的生态基础。

## 开源协议

本项目遵循 [GNU General Public License v3.0](./LICENSE)。

简要说明：

1. 如果你分发修改后的版本，需要按 GPL v3 要求提供对应源代码。
2. GPL v3 不禁止商业使用，你可以基于本项目提供部署、运维、支持或私有化交付服务。
3. 协议包含专利授权和反规避条款，有助于保护使用者的开源权利。
4. 软件按“原样”提供，不附带任何明示或默示担保。

请以仓库根目录的 [LICENSE](./LICENSE) 文件为准。

## 联系与支持

- 维护者: [@a574676848](https://github.com/a574676848)
- 邮箱: devnexus.chat@gmail.com
- 问题反馈: [Issue Tracker](https://github.com/a574676848/openviking-admin/issues)
