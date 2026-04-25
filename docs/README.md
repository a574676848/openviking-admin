# OpenViking Admin 文档中心

这里是 OpenViking Admin 的项目文档入口。文档按“先理解项目，再完成接入，最后查参考和运维材料”的路径组织。

## 阅读路径

### 第一次了解项目

1. 先读 [项目 README](../README.md)，了解项目定位、架构图和快速开始。
2. 再读 [架构文档](./ARCHITECTURE.md)，理解洋葱架构、租户隔离和能力平台边界。
3. 如果要本地启动，继续读 [部署指南](./DEPLOYMENT.md) 和 [配置参考](./CONFIGURATION.md)。

### 接入 OpenViking Admin

1. [能力平台](./CAPABILITIES.md)：理解 capability 是什么，以及 HTTP、CLI、MCP、Skill 如何共享同一套契约。
2. [认证与凭证](./AUTH_AND_CREDENTIALS.md)：选择 JWT、capability token、session key 或 API key。
3. [API 参考](./API_REFERENCE.md)：查看 HTTP 端点、响应格式和错误语义。
4. [CLI 指南](./CLI_GUIDE.md)：使用 `ova` 完成登录、换证、搜索和诊断。
5. [MCP 指南](./MCP_GUIDE.md)：配置 Claude、Cursor、IDE 等 MCP 客户端。
6. [Skill 集成指南](./SKILL_GUIDE.md)：为 Agent 平台编写 HTTP/CLI 调用模板。

### 参与开发

1. [开发者指南](./DEVELOPMENT.md)
2. [测试指南](./TESTING.md)
3. [数据库 Schema](./DATABASE_SCHEMA.md)
4. [安全策略](./SECURITY.md)
5. [可观测性](./OBSERVABILITY.md)

## 文档分类

| 类型 | 文档 | 说明 |
|------|------|------|
| 项目入口 | [项目 README](../README.md) | 项目定位、架构图、快速开始、致谢和许可证 |
| 概念 | [架构文档](./ARCHITECTURE.md) | 洋葱架构、关键模块、调用链路和扩展原则 |
| 概念 | [能力平台](./CAPABILITIES.md) | capability 契约、权限边界和四入口投影 |
| 指南 | [部署指南](./DEPLOYMENT.md) | 本地、Docker、Nginx 和生产部署 |
| 指南 | [开发者指南](./DEVELOPMENT.md) | 本地开发、代码规范和提交流程 |
| 指南 | [CLI 指南](./CLI_GUIDE.md) | `ova` 安装、登录、换证和命令 |
| 指南 | [MCP 指南](./MCP_GUIDE.md) | MCP 客户端配置、会话建立和调试 |
| 指南 | [Skill 集成指南](./SKILL_GUIDE.md) | Agent Skill 的 HTTP/CLI 调用模式 |
| 参考 | [API 参考](./API_REFERENCE.md) | HTTP 端点、认证方式、响应格式和错误码 |
| 参考 | [配置参考](./CONFIGURATION.md) | 环境变量和系统配置项 |
| 参考 | [数据库 Schema](./DATABASE_SCHEMA.md) | 表结构、关系和迁移说明 |
| 运维 | [可观测性](./OBSERVABILITY.md) | trace、指标、告警和 Prometheus 接入 |
| 运维 | [安全策略](./SECURITY.md) | 威胁模型、权限边界和生产安全建议 |
| 运维 | [故障排查](./TROUBLESHOOTING.md) | 常见问题、诊断命令和修复建议 |

## 图片资产

`docs/images` 中的图片用于 README 和架构说明，分别对应项目全景、安全隔离、检索链路和知识加工流水线。

| 图片 | 用途 |
|------|------|
| `OpenViking 企业 AI 知识中台架构全景图.png` | 展示系统从 SSO、管理平台到 OpenViking 引擎的整体结构 |
| `OpenViking 多维度安全隔离与合规矩阵.png` | 展示 Small、Medium、Large 多租户隔离和合规边界 |
| `基于 MCP 与 Rerank 的高精准检索流.png` | 展示 AI 客户端、MCP、检索和重排序链路 |
| `企业数字资产自动化加工流水线.png` | 展示多源导入、加工、索引和知识资产沉淀流程 |

## 示例代码

当前可运行样例集中在 [examples](../examples)：

| 目录 | 说明 |
|------|------|
| `examples/http` | 使用 curl 登录、换证和调用 capability |
| `examples/cli` | 使用 `ova` 登录、搜索、签发凭证和诊断 |
| `examples/mcp` | MCP 客户端配置和 JSON-RPC 调试 |
| `examples/skill` | Agent Skill 模板和接入约束 |
