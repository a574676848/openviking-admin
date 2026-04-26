# ADR 0007: Capability Registry 作为单一事实源

## 状态

已采纳

## 背景

Capability catalog、HTTP 路由、CLI 命令、MCP tool 和文档示例过去依赖多处硬编码同步，容易在新增能力或调整路径时出现漂移。

## 决策

- 维护统一的 capability registry，集中声明 id、version、http path、cli command 和 schema。
- Catalog 展示、执行分发、契约检查脚本优先从 registry 获取信息。
- 文档检查与 CI 校验 registry 和 README/API_REFERENCE/CLI 的一致性。

## 取舍

- 优点：新增能力时改动面收敛，契约校验可以自动化。
- 成本：注册表需要保持足够克制，避免重新演变成新的巨型文件。

## 后续影响

- 后续应继续把 MCP tool 投影和 schema 校验也纳入 registry 驱动。
- CLI 拆分时要继续复用同一份 registry 信息。
