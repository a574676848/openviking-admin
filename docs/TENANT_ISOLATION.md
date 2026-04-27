# 多租户隔离战略

`OpenViking Admin` 提供了业内领先的物理级多租户隔离方案，通过三种等级（SMALL, MEDIUM, LARGE）适配不同的安全合规需求。

![OpenViking 多维度安全隔离与合规矩阵](<./images/OpenViking 多维度安全隔离与合规矩阵.png>)

上图描述了租户身份、角色权限、资源 URI、数据库隔离和 OpenViking 算力隔离共同组成的安全边界。

## 1. SMALL 等级：字段级隔离

- **适用场景**：初创企业、低成本 SaaS。
- **物理实现**：所有租户共用 `public` Schema。通过实体类中的 `tenant_id` 字段在 Repository 层进行查询过滤。
- **代码参考**：`TenantIsolationLevel.SMALL`

## 2. MEDIUM 等级：Schema 级隔离

- **适用场景**：中大型企业、对数据主权有初步要求的场景。
- **物理实现**：每个租户拥有独立的 PostgreSQL Schema。系统通过 DDL 自动克隆 `public` 表结构，并动态执行 `SET search_path` 进行切换。
- **初始化逻辑**：`SchemaInitializerService.runSchemaDDL()`。

## 3. LARGE 等级：独立数据库隔离

- **适用场景**：金融级客户、跨地域部署、私有化合规需求。
- **物理实现**：租户数据存储在完全独立的数据库实例中。系统通过 `DynamicDataSourceService` 维护一个跨实例的动态连接池。
- **初始化行为**：创建租户时必须显式提交 `dbConfig`。系统会先检查目标数据库是否存在，不存在时自动创建，再补齐 `uuid-ossp` 扩展与核心业务表结构。
- **失败语义**：如果独立库初始化失败，租户创建请求会直接失败并回滚，不会留下 `ERROR_INITIALIZING` 的脏租户记录。

## 4. 算力隔离

除了存储隔离，系统还支持 **AI 算力的租户级解耦**。
- 租户可配置专属的 `OpenViking` 端点。
- 向量化与推理请求携带租户专属 `X-API-KEY`，在算力侧实现命名空间隔离。

---
> 下一步建议：阅读 [能力平台](./CAPABILITIES.md) 了解 HTTP、CLI、MCP 和 Skill 如何共享统一 capability 契约。
