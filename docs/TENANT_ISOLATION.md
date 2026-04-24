# 🔐 多租户隔离战略 (Tenant Isolation Strategy)

`OpenViking Admin` 提供了业内领先的物理级多租户隔离方案，通过三种等级（SMALL, MEDIUM, LARGE）适配不同的安全合规需求。

## 1. SMALL 等级：字段级隔离 (Soft Isolation)

- **适用场景**：初创企业、低成本 SaaS。
- **物理实现**：所有租户共用 `public` Schema。通过实体类中的 `tenant_id` 字段在 Repository 层进行查询过滤。
- **代码参考**：`TenantIsolationLevel.SMALL`

## 2. MEDIUM 等级：Schema 级隔离 (Physical Logical Isolation)

- **适用场景**：中大型企业、对数据主权有初步要求的场景。
- **物理实现**：每个租户拥有独立的 PostgreSQL Schema。系统通过 DDL 自动克隆 `public` 表结构，并动态执行 `SET search_path` 进行切换。
- **初始化逻辑**：`SchemaInitializerService.runSchemaDDL()`。

## 3. LARGE 等级：独立数据库隔离 (Strong Physical Isolation)

- **适用场景**：金融级客户、跨地域部署、私有化合规需求。
- **物理实现**：租户数据存储在完全独立的数据库实例中。系统通过 `DynamicDataSourceService` 维护一个跨实例的动态连接池。
- **代码精髓**：`ds.synchronize(false)` 实现了代码模型到物理数据库的一键自动映射。

## 4. 算力隔离 (Compute Isolation)

除了存储隔离，系统还支持 **AI 算力的租户级解耦**。
- 租户可配置专属的 `OpenViking` 端点。
- 向量化与推理请求携带租户专属 `X-API-KEY`，在算力侧实现命名空间隔离。

---
> 下一步建议：阅读 [MCP 协议集成手册](./MCP_GUIDE.md) 了解如何赋能 AI Agent。
