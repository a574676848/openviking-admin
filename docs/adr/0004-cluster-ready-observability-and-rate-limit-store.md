# ADR 0004：集群可扩展的可观测性与限流存储

## 状态

已采纳。

## 背景

能力平台已经具备统一指标、告警、限流和审计能力，但默认实现仍基于进程内状态：

- 指标只存在单实例内存中。
- 限流只在当前进程内生效。
- 外部 Prometheus 还没有标准抓取入口。

如果直接进入多实例生产部署，平台会出现两个问题：

1. Prometheus 无法用标准方式直接采集 capability 指标。
2. 不同实例之间限流计数不共享，边界会被水平扩容稀释。

## 决策

本项目采用以下设计：

1. 保留 `CapabilityMetricsService` 作为平台内部聚合入口，应用层不直接依赖 Prometheus。
2. 新增 `CapabilityPrometheusExporterService`，负责把内部指标快照渲染为 Prometheus exposition。
3. 通过 `GET /api/observability/capabilities/prometheus` 暴露标准抓取入口。
4. 抽象 `CapabilityRateLimitStore` 作为限流状态存储接口。
5. 默认使用 `InMemoryCapabilityRateLimitStore`，保证当前单实例实现可用。
6. 未来切换 Redis 或分布式 KV 时，只替换 store provider，不修改 Application 与 Domain。

## 影响

### 正向影响

- 外部 Prometheus 接入只需要新增 scrape target。
- 限流已经具备多实例扩展位。
- 洋葱架构依赖方向保持稳定。
- 可观测性与集群部署关注点被限制在 Infrastructure 层。

### 代价

- 当前默认实现仍不是分布式限流。
- Prometheus 指标入口仍需要运维层做好网络隔离与访问控制。

## 后续事项

- 生产部署时提供 Redis 版本的 `CapabilityRateLimitStore`。
- 将 Prometheus 指标入口纳入内部监控网络或 service mesh。
- 如果引入 OpenTelemetry，再新增 exporter adapter，不替换当前聚合入口。
