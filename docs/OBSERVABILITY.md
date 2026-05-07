# 可观测性

OpenViking Admin 的 capability 调用链路提供统一追踪、审计、指标和 Prometheus 接入准备。目标是让 HTTP、CLI、MCP 和 Skill 四种入口都能用同一组字段定位问题。

## 追踪字段

| 字段 | 说明 |
|------|------|
| `traceId` | 服务端生成的端到端追踪 ID |
| `spanId` | 单次内部调用片段 ID |
| `requestId` | 客户端传入或服务端生成的请求 ID |
| `tenantId` | 租户 ID |
| `userId` | 用户 ID |
| `channel` | `http`、`cli`、`mcp` 或 `skill` |
| `clientType` | 客户端类型 |
| `credentialType` | 当前使用的凭证类型 |
| `capability` | capability id |

客户端可以通过 `x-request-id` 传入自己的请求 ID。服务端会在换证、能力执行和 OpenViking 下游请求之间透传相关追踪字段。

## 审计事件

能力平台会记录以下事件：

| 事件 | 说明 |
|------|------|
| `credential.exchange.success` | 换证成功 |
| `capability.success` | 能力调用成功 |
| `capability.failure` | 能力执行失败 |
| `capability.rejected` | 鉴权、权限、限流或输入校验拒绝 |

审计日志应保留 `traceId`、`requestId`、用户、租户、入口、凭证类型和 capability id。

## 指标

平台维护进程内指标快照：

- capability 调用量。
- capability 成功率和失败率。
- token exchange 成功率。
- capability 延迟样本和 P95 / P99。
- tenant、user、clientType、capability 四维固定窗口限流状态。
- 认证失败、能力失败、OpenViking 超时风险、租户流量尖峰等告警。

## HTTP 观测接口

### GET /api/v1/observability/capabilities

返回当前进程内观测快照。需要 JWT。

### GET /api/v1/observability/capabilities/prometheus

返回 Prometheus exposition 格式指标，可作为外部 Prometheus 的抓取目标。

## Prometheus 接入准备

服务端已经将指标聚合和 exporter 解耦。生产环境接入 Prometheus 时建议：

- 在内网暴露 Prometheus 抓取入口。
- 为抓取入口配置认证、网络 ACL 或 service mesh policy。
- 在 Prometheus 中按 `tenantId`、`capability`、`channel` 聚合调用量和错误率。
- 基于 5xx、429、P99 延迟和 OpenViking timeout 配置告警。

## 集群扩展准备

当前 rate limit 状态通过 `CapabilityRateLimitStore` 抽象。单实例可使用内存实现，多实例部署时应替换为 Redis 或分布式 KV，确保限流窗口在实例之间共享。

指标 exporter 可继续演进到 OpenTelemetry Collector、APM 或独立 exporter，不需要改变 capability adapter。

## 排障流程

收到问题时优先收集：

| 信息 | 来源 |
|------|------|
| `traceId` | API 响应、CLI 输出、MCP 响应、Agent 日志 |
| `requestId` | 客户端日志或请求 header |
| capability id | `/api/v1/capabilities` 或 CLI 命令 |
| 调用入口 | HTTP、CLI、MCP、Skill |
| 凭证类型 | API 响应 meta、服务端日志 |

### WebDAV 访问日志

- 所有请求都会输出摘要访问日志，事件名为 `http.request`，包含 `requestId`、`traceId`、方法、路径、状态码、租户和用户等基础字段。
- WebDAV 请求在失败时会额外输出 `http.request.webdav`，用于排查 Obsidian、Remotely Save、Finder、WebDAV 客户端等失败场景。该日志会补充脱敏后的请求头、响应头、租户路径和解码后的资源路径。
- `Authorization`、`Cookie`、`Set-Cookie`、`x-api-key` 等敏感头会被自动脱敏，不会原样写入日志。
- 若需要观察成功链路上的完整 WebDAV 方法序列，可设置环境变量 `WEBDAV_ACCESS_LOG_VERBOSE=true`，让所有 WebDAV 请求都输出 `http.request.webdav` 明细日志。

然后查看：

```bash
curl -H "Authorization: Bearer <jwt>" \
  "http://localhost:6001/api/v1/observability/capabilities"

curl -H "Authorization: Bearer <jwt>" \
  "http://localhost:6001/api/v1/observability/capabilities/prometheus"
```
