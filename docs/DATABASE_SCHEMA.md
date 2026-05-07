# 数据库 Schema 参考

本文档提供完整的数据库表结构、索引、关系和迁移信息。

---

## 扩展

```sql
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
```

所有表使用 `uuid_generate_v4()` 作为 UUID 主键默认值。

---

## 表结构

### users

用户表，存储所有平台用户。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | UUID | PK, NOT NULL | `uuid_generate_v4()` | 主键 |
| `username` | VARCHAR(64) | NOT NULL | — | 登录用户名；平台账号要求全局唯一，租户账号要求租户内唯一 |
| `password_hash` | VARCHAR(255) | NOT NULL | — | bcrypt 哈希 |
| `role` | VARCHAR(30) | NOT NULL | `'tenant_viewer'` | `super_admin` / `tenant_admin` / `tenant_operator` / `tenant_viewer` |
| `tenant_id` | VARCHAR(64) | NULLABLE | — | 所属租户标识，超管为 NULL |
| `active` | BOOLEAN | NOT NULL | `true` | 是否激活 |
| `sso_id` | VARCHAR(128) | NULLABLE | — | SSO 唯一标识 |
| `provider` | VARCHAR(32) | NULLABLE | — | `feishu` / `dingtalk` / `oidc` / `ldap` |
| `created_at` | TIMESTAMP | NOT NULL | `now()` | 创建时间 |
| `updated_at` | TIMESTAMP | NOT NULL | `now()` | 更新时间 |

唯一性约束说明：

- 平台账号（`tenant_id IS NULL`）使用部分唯一索引 `uq_users_platform_username`，保证平台用户名全局唯一。
- 租户账号（`tenant_id IS NOT NULL`）使用部分唯一索引 `uq_users_tenant_username`，保证同一租户内用户名唯一，不同租户可重复使用同名账号。

---

### tenants

租户表，定义租户配置和隔离策略。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | UUID | PK, NOT NULL | `uuid_generate_v4()` | 主键 |
| `tenant_id` | VARCHAR(64) | UNIQUE, NOT NULL | — | 租户唯一标识 |
| `display_name` | VARCHAR(128) | NOT NULL | — | 显示名称 |
| `status` | VARCHAR(20) | NOT NULL | `'active'` | `active` / `disabled` |
| `isolation_level` | VARCHAR(20) | NOT NULL | `'small'` | `small` / `medium` / `large` |
| `db_config` | JSONB | NULLABLE | — | 独立数据库配置 (仅 large) |
| `ov_config` | JSONB | NULLABLE | — | 租户级 OpenViking 配置覆盖 |
| `viking_account` | VARCHAR(128) | NULLABLE | — | OpenViking 账户映射 |
| `quota` | JSONB | NULLABLE | — | `{ maxDocs, maxVectors }` |
| `description` | TEXT | NULLABLE | — | 描述 |
| `created_at` | TIMESTAMP | NOT NULL | `now()` | 创建时间 |
| `updated_at` | TIMESTAMP | NOT NULL | `now()` | 更新时间 |

---

### knowledge_bases

知识库表，每个租户可创建多个知识库。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | UUID | PK, NOT NULL | `uuid_generate_v4()` | 主键 |
| `name` | VARCHAR(100) | NOT NULL | — | 知识库名称 |
| `description` | TEXT | NULLABLE | — | 描述 |
| `tenant_id` | VARCHAR(64) | NOT NULL | — | 所属租户 |
| `status` | VARCHAR(20) | NOT NULL | `'active'` | `active` / `building` / `archived` |
| `viking_uri` | VARCHAR(512) | NULLABLE | — | OpenViking URI |
| `doc_count` | INTEGER | NOT NULL | `0` | 文档数量，读取知识库接口时会按根目录文件数回写 |
| `vector_count` | INTEGER | NOT NULL | `0` | 向量数量，读取知识库接口时会按根目录总向量数回写 |
| `created_at` | TIMESTAMP | NOT NULL | `now()` | 创建时间 |
| `updated_at` | TIMESTAMP | NOT NULL | `now()` | 更新时间 |

**索引**: `idx_kb_tenant` ON `(tenant_id)`

---

### knowledge_nodes

知识节点表，树形结构组织知识。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | UUID | PK, NOT NULL | `uuid_generate_v4()` | 主键 |
| `tenant_id` | VARCHAR(64) | NULLABLE | — | 所属租户 |
| `kb_id` | UUID | NOT NULL | — | 所属知识库 |
| `parent_id` | UUID | NULLABLE | — | 父节点 (自引用) |
| `name` | VARCHAR(200) | NOT NULL | — | 节点名称 |
| `path` | TEXT | NULLABLE | — | 路径 |
| `sort_order` | INTEGER | NOT NULL | `0` | 排序顺序 |
| `acl` | JSONB | NULLABLE | — | `{ roles, users, isPublic }` |
| `viking_uri` | VARCHAR(512) | NULLABLE | — | OpenViking URI |
| `created_at` | TIMESTAMP | NOT NULL | `now()` | 创建时间 |
| `updated_at` | TIMESTAMP | NOT NULL | `now()` | 更新时间 |

**索引**: `idx_kn_kb` ON `(kb_id)`, `idx_kn_parent` ON `(parent_id)`

---

### import_tasks

导入任务表，跟踪文档导入进度。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | UUID | PK, NOT NULL | `uuid_generate_v4()` | 主键 |
| `tenant_id` | VARCHAR(64) | NULLABLE | — | 所属租户 |
| `integration_id` | VARCHAR(255) | NULLABLE | — | 关联的集成凭证 |
| `kb_id` | UUID | NOT NULL | — | 所属知识库 |
| `source_type` | VARCHAR(20) | NOT NULL | — | `url` / `git` / `local` / `manifest` / `feishu` / `dingtalk` |
| `source_url` | VARCHAR(2048) | NULLABLE | — | 来源 URL |
| `target_uri` | VARCHAR(2048) | NOT NULL | — | 目标 URI |
| `status` | VARCHAR(20) | NOT NULL | `'pending'` | `pending` / `running` / `done` / `failed` |
| `node_count` | INTEGER | NOT NULL | `0` | 节点数量 |
| `vector_count` | INTEGER | NOT NULL | `0` | 向量数量 |
| `error_msg` | TEXT | NULLABLE | — | 错误信息 |
| `created_at` | TIMESTAMP | NOT NULL | `now()` | 创建时间 |
| `updated_at` | TIMESTAMP | NOT NULL | `now()` | 更新时间 |

**索引**: `idx_import_task_kb` ON `(kb_id)`

---

### search_logs

检索日志表，记录所有检索请求。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | UUID | PK, NOT NULL | `uuid_generate_v4()` | 主键 |
| `tenant_id` | VARCHAR(64) | NULLABLE | — | 所属租户 |
| `query` | TEXT | NOT NULL | — | 搜索查询 |
| `scope` | VARCHAR(2048) | NULLABLE | — | 搜索范围 |
| `result_count` | INTEGER | NOT NULL | `0` | 结果数量 |
| `score_max` | FLOAT | NOT NULL | `0` | 最高分数 |
| `latency_ms` | INTEGER | NOT NULL | `0` | 延迟 (毫秒) |
| `feedback` | VARCHAR(20) | NULLABLE | — | `helpful` / `unhelpful` |
| `feedback_note` | TEXT | NULLABLE | — | 反馈备注 |
| `meta` | JSONB | NULLABLE | — | 额外元数据 |
| `created_at` | TIMESTAMP | NOT NULL | `now()` | 创建时间 |

**索引**: `idx_search_log_tenant` ON `(tenant_id)`

---

### audit_logs

审计日志表，记录所有关键操作。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | UUID | PK, NOT NULL | `uuid_generate_v4()` | 主键 |
| `tenant_id` | VARCHAR(64) | NULLABLE | — | 所属租户 |
| `user_id` | UUID | NULLABLE | — | 操作用户 |
| `username` | VARCHAR(255) | NULLABLE | — | 操作用户名 |
| `action` | VARCHAR(100) | NOT NULL | — | 操作类型 |
| `target` | VARCHAR(512) | NULLABLE | — | 操作目标 |
| `meta` | JSONB | NULLABLE | — | 额外元数据 |
| `ip` | VARCHAR(255) | NULLABLE | — | IP 地址 |
| `success` | BOOLEAN | NOT NULL | `true` | 是否成功 |
| `created_at` | TIMESTAMP | NOT NULL | `now()` | 创建时间 |

**索引**: `idx_audit_log_tenant` ON `(tenant_id)`, 复合索引 `(user_id, created_at)`, `(action, created_at)`, `(tenant_id, created_at)`

**action 枚举值**: `login` / `logout` / `create_kb` / `delete_kb` / `import` / `reindex` / `search` / `settings_change` / `user_create` / `user_delete`

---

### system_configs

系统配置表，key-value 存储。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `key` | VARCHAR(128) | PK, NOT NULL | — | 配置键 |
| `value` | TEXT | NOT NULL | — | 配置值 |
| `description` | TEXT | NULLABLE | — | 描述 |
| `updated_at` | TIMESTAMP | NOT NULL | `now()` | 更新时间 |

---

### integrations

集成配置表，存储第三方平台凭证。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | UUID | PK, NOT NULL | `uuid_generate_v4()` | 主键 |
| `tenant_id` | VARCHAR(255) | NOT NULL | — | 所属租户 |
| `name` | VARCHAR(64) | NOT NULL | — | 集成名称 |
| `type` | VARCHAR(32) | NOT NULL | — | `github` / `gitlab` / `webdav` / `feishu` / `dingtalk` / `oidc` / `ldap` |
| `credentials` | JSONB | NOT NULL | `'{}'` | 凭证信息 (AES-256-CBC 加密) |
| `config` | JSONB | NULLABLE | — | 配置 |
| `active` | BOOLEAN | NOT NULL | `true` | 是否激活 |
| `created_at` | TIMESTAMP | NOT NULL | `now()` | 创建时间 |
| `updated_at` | TIMESTAMP | NOT NULL | `now()` | 更新时间 |

---

### capability_keys

Capability Key 表。

| 列名 | 类型 | 约束 | 默认值 | 说明 |
|------|------|------|--------|------|
| `id` | UUID | PK, NOT NULL | `uuid_generate_v4()` | 主键 |
| `name` | VARCHAR(100) | NOT NULL | — | 密钥名称 |
| `api_key` | VARCHAR(255) | UNIQUE, NOT NULL | — | API Key (`ov-sk-xxx`) |
| `user_id` | VARCHAR(255) | NOT NULL | — | 用户 ID |
| `tenant_id` | VARCHAR(255) | NOT NULL | — | 租户 ID |
| `last_used_at` | TIMESTAMP | NULLABLE | — | 最后使用时间 |
| `created_at` | TIMESTAMP | NOT NULL | `now()` | 创建时间 |
| `updated_at` | TIMESTAMP | NOT NULL | `now()` | 更新时间 |

---

## 实体关系图

```
tenants (1) ────< (N) users
tenants (1) ────< (N) knowledge_bases
tenants (1) ────< (N) integrations
tenants (1) ────< (N) search_logs
tenants (1) ────< (N) audit_logs
tenants (1) ────< (N) import_tasks
tenants (1) ────< (N) capability_keys

knowledge_bases (1) ────< (N) knowledge_nodes
knowledge_bases (1) ────< (N) import_tasks

knowledge_nodes 自引用 (parent_id → id)

integrations (1) ────< (N) import_tasks

users (1) ────< (N) audit_logs
users (1) ────< (N) capability_keys
```

---

## 迁移历史

| 迁移文件 | 时间戳 | 操作 |
|----------|--------|------|
| `InitSchema` | 1745000000000 | 创建 users, knowledge_bases, import_tasks, search_logs, audit_logs + 初始管理员 |
| `AddMissingTables` | 1745100000000 | 创建 tenants, knowledge_nodes, system_configs |
| `FixSchemaInconsistencies` | 1745200000000 | 添加 SSO 字段 (sso_id, provider)、隔离等级字段、修复列类型 |
| `ScopeUsernamesPerTenant` | 1746400000000 | 将 users.username 调整为平台全局唯一 + 租户内唯一 |

---

## 已知不一致

> **注意**: Entity 定义与迁移 DDL 存在以下差异，生产环境建议补充正式迁移修复。

1. **audit_logs**: Entity 定义了 `username`, `target`, `meta`, `ip`, `success` 列，但 InitSchema 迁移中对应列为 `resource`, `detail`，且缺少 `ip`, `success`, `username`
2. **search_logs**: Entity 定义了 `feedback`, `feedback_note`, `meta` 列，InitSchema 中不存在
3. **import_tasks**: Entity 定义了 `tenant_id`, `integration_id` 列，InitSchema 中不存在
4. **knowledge_nodes**: Entity 中 `acl` 为 `jsonb`，AddMissingTables 中定义为 `VARCHAR(255)`
5. **integrations** 和 **capability_keys**: 旧版本曾依赖 TypeORM `synchronize: true` 自动建表，当前已补 capability key 迁移
