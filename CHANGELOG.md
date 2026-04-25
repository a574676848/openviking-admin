# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- 新增 `capabilities` 模块，收口统一 capability contract、execution、authorization、discovery、credential exchange
- 新增平铺 HTTP 接口：`/api/capabilities`、`/api/knowledge/search`、`/api/knowledge/grep`、`/api/resources`、`/api/resources/tree`
- 新增 capability 换证接口：`/api/auth/token/exchange`、`/api/auth/session/exchange`、`/api/auth/client-credentials`
- 新增登录态刷新接口：`/api/auth/refresh`
- 新增凭证发现接口：`/api/auth/credential-options`
- 新增 `ov` CLI 命令树
- 新增 capability 观测快照接口：`/api/observability/capabilities`
- 新增 Prometheus 导出接口：`/api/observability/capabilities/prometheus`
- 新增 capability 架构、CLI、skill、认证、可观测性、ADR 与 examples 文档
- 新增 HTTP e2e、CLI integration、MCP protocol integration 测试
- 新增 capability authorization、audit persistence、skill smoke 与跨租户隔离测试
- 新增统一 HTTP 错误 envelope 与错误码映射测试
- 新增 cluster-ready observability / rate limit store ADR

### Changed

- 架构中心从“扩展 MCP”调整为 “Capability-First”
- MCP adapter 改为复用统一 capability catalog 与 execution service
- CLI 与 skill 改为调用平铺 capability，而非通用 tool runner
- README、API 参考、MCP 指南、Server 文档全部按新架构重写
- 清理迁移后未再使用的 MCP key 仓储孤儿代码，并将 MCP 文档重命名为 `MCP_ADAPTER_GUIDE.md`
- 将 `UserMcpKey` 重命名为 `CapabilityKey`，并补 capability key / MCP session key 迁移与文档收口
- CLI 改为缓存 `accessToken + refreshToken` 并在过期前自动刷新登录态
- 控制台支持显式签发 capability access token、session key 与 apiKey
- capability contract 增加 `minimumRole`，资源浏览能力默认至少要求 `tenant_operator`
- capability 平台新增进程内 metrics、P95/P99 快照与四维 rate limit / quota
- HTTP adapter 移除未上线前遗留的 `x-mcp-key` 兼容头，统一收口到 `x-capability-key`
- `x-request-id` 现可在换证、能力执行与 OV 下游请求间透传，观测快照新增 alerts 计算
- rate limit 状态存储已抽象为可替换 store，默认实现仍为内存版

### Security

- capability 调用统一要求租户上下文
- 新增 capability access token / session key / apiKey 分层模型
- 新增 `refreshToken` 分层与生命周期边界
- apiKey 调用统一收敛到租户资源域
- 对租户范围外 URI 改为显式拒绝，不再静默降级

### Docs

- 完成新一轮 capability platform 文档体系重构

### Validation

- `npm test -- --runInBand` in `apps/server`
- `npm run test:e2e -- --runInBand` in `apps/server`
- `npm run build` in `apps/server`
