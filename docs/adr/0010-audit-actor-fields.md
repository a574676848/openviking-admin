# ADR 0010: 知识资产操作人字段设计

本文档记录"知识库、知识树、文档处理中心增加创建人、更新人"的架构决策与影响范围分析。目标是让控制台、API、CLI 和 capability 使用同一套操作人元数据，明确每条知识资产或处理任务由谁创建、由谁最后更新。

## 目标

- 知识库列表、详情、创建、更新和归档能够返回 `createdBy`、`updatedBy`。
- 知识树节点列表、详情、创建、更新、移动、正文保存、导入回写能够返回 `createdBy`、`updatedBy`。
- 文档处理中心的导入任务列表、详情、创建、重试、取消能够返回 `createdBy`、`updatedBy`；删除失败任务为物理删除，不保留可展示的更新人。
- 现有 `createdAt`、`updatedAt` 继续作为时间维度，新增字段只承担操作人维度。
- 历史数据允许为空，不阻断线上迁移；新写入数据必须完整记录操作人。

## 结论

推荐在业务表中直接增加操作人快照字段：

| 表 | 新增字段 | 用途 |
|----|----------|------|
| `knowledge_bases` | `created_by_id`、`created_by_name`、`updated_by_id`、`updated_by_name` | 知识库创建人与最后更新人 |
| `knowledge_nodes` | `created_by_id`、`created_by_name`、`updated_by_id`、`updated_by_name` | 知识树节点、文档叶子和在线编辑更新人 |
| `import_tasks` | `created_by_id`、`created_by_name`、`updated_by_id`、`updated_by_name` | 文档处理中心导入任务创建人与状态操作人 |

不建议只依赖 `audit_logs` 反查。审计日志适合追踪行为链路，但列表页和详情页需要稳定、低成本展示；每次查询都扫描审计日志会放大分页、排序和租户隔离复杂度。

不建议使用数据库外键强约束到 `users`。当前系统存在 Small、Medium、Large 多租户隔离，知识库、知识树、导入任务会随租户隔离策略进入不同数据域，而用户数据仍承担平台登录和租户账号管理职责。跨库外键不可用，用户删除或改名也不应破坏知识资产历史归属。因此使用 `id + name` 快照，必要时由应用层补充当前用户信息。

实施时不要求前端或外部调用方传入创建人、更新人。JWT HTTP 入口统一取 `JwtAuthGuard` 解析后的 `req.user`；WebDAV 和 capability 入口取 principal 中由 token、API key 或 capability credential 解析出的用户信息。入参为空时以服务端解析身份为准。

## 字段语义

| 字段 | 类型 | 是否可空 | 说明 |
|------|------|----------|------|
| `created_by_id` | `UUID` 或 `VARCHAR(64)` | 是 | 创建操作对应的用户 ID；历史数据、系统任务或 capability API key 场景可为空 |
| `created_by_name` | `VARCHAR(64)` | 是 | 创建时的用户名快照，用于用户改名、删除后的历史展示 |
| `updated_by_id` | `UUID` 或 `VARCHAR(64)` | 是 | 最后一次业务更新对应的用户 ID |
| `updated_by_name` | `VARCHAR(64)` | 是 | 最后一次业务更新时的用户名快照 |

字段类型建议与现有 `AuthenticatedRequest.user.id` 保持一致。当前 `users.id` 是 UUID，但 WebDAV capability principal 和部分系统任务没有稳定用户 UUID，因此实现时可以选择 `VARCHAR(64)` 保持兼容；如果明确仅记录 JWT 用户，则可以使用 `UUID`。

## 后端影响范围

### 数据模型与仓储

需要修改以下模型、实体和映射：

| 模块 | 文件 | 修改点 |
|------|------|--------|
| 知识库 | `apps/server/src/knowledge-base/entities/knowledge-base.entity.ts` | 新增四个列 |
| 知识库 | `apps/server/src/knowledge-base/domain/knowledge-base.model.ts` | 模型新增四个字段 |
| 知识库 | `apps/server/src/knowledge-base/infrastructure/repositories/knowledge-base.repository.ts` | `toModel`、`toEntityInput` 映射新增字段 |
| 知识树 | `apps/server/src/knowledge-tree/entities/knowledge-node.entity.ts` | 新增四个列 |
| 知识树 | `apps/server/src/knowledge-tree/domain/knowledge-node.model.ts` | 模型新增四个字段 |
| 知识树 | `apps/server/src/knowledge-tree/infrastructure/repositories/knowledge-node.repository.impl.ts` | `toModel`、`toEntityInput` 映射新增字段 |
| 文档处理中心 | `apps/server/src/import-task/entities/import-task.entity.ts` | 新增四个列 |
| 文档处理中心 | `apps/server/src/import-task/domain/import-task.model.ts` | 模型新增四个字段 |
| 文档处理中心 | `apps/server/src/import-task/infrastructure/repositories/import-task.repository.ts` | `toModel`、`toEntityInput` 映射新增字段 |

### 写入链路

需要把当前请求用户显式传入 Application Service，避免 Domain 或 Repository 依赖 Web 请求对象。

| 场景 | 当前入口 | 建议变更 |
|------|----------|----------|
| 创建知识库 | `KnowledgeBaseController.create` -> `KnowledgeBaseService.create` | 传入 `{ id, username }`，创建时同时写 `createdBy` 和 `updatedBy` |
| 更新知识库 | `KnowledgeBaseController.update` -> `KnowledgeBaseService.update` | 更新业务字段时写 `updatedBy` |
| 归档/删除知识库 | `KnowledgeBaseController.remove` -> `KnowledgeBaseService.remove` | 如果仍物理删除，不需要保留更新人；如果未来改为软归档，应写 `updatedBy` |
| 创建知识树节点 | `KnowledgeTreeController.create` -> `KnowledgeTreeService.create/createFile` | 创建时同时写 `createdBy` 和 `updatedBy` |
| 更新/移动知识树节点 | `KnowledgeTreeController.update/move` -> `KnowledgeTreeService.update` | 写 `updatedBy` |
| 文档正文保存 | `DocumentController.saveContent` -> `DocumentService.saveContent` -> `KnowledgeTreeService.syncContentUri/touch` | 保存成功后写知识节点 `updatedBy`，代表文档叶子的最后编辑人 |
| 资产上传 | `DocumentController.uploadAssets` -> `DocumentService.uploadAsset` | 可写知识节点 `updatedBy`，代表文档资源变更人 |
| 创建导入任务 | `ImportTaskController.create/createDocumentImport/createLocalUpload` -> `ImportTaskService.create/createLocalUpload` | 创建时同时写 `createdBy` 和 `updatedBy` |
| 重试/取消任务 | `ImportTaskController.retry/cancel` -> `ImportTaskService` | 状态变更时写 `updatedBy`；删除失败任务为物理删除，不保留可展示的更新人 |
| Worker 状态推进 | `TaskWorkerService.processTask/recoverZombieTasks` | 不覆盖人工 `updatedBy`；如需标识系统更新，使用常量 `SYSTEM_ACTOR` 写入 `updatedByName = 'system'` |
| WebDAV 创建/覆盖/移动 | `WebdavService` -> `KnowledgeBaseService`、`KnowledgeTreeService`、`ImportTaskService` | capability principal 只有 `username` 时允许 `id` 为空、`name` 写 principal.username |
| Capability 导入入口 | `KnowledgeCapabilityGateway` -> 服务层 | 从 principal 中提取用户快照，缺失时按 capability principal 处理 |

### API 契约

建议统一返回嵌套对象，避免前端直接依赖列名：

```json
{
  "createdBy": {
    "id": "user-1",
    "username": "alice"
  },
  "updatedBy": {
    "id": "user-2",
    "username": "bob"
  }
}
```

列表和详情都返回同样结构。历史数据没有操作人时返回 `null`：

```json
{
  "createdBy": null,
  "updatedBy": null
}
```

如果为了减少改动量，也可以第一阶段直接返回平铺字段 `createdById`、`createdByName`、`updatedById`、`updatedByName`。但长期契约建议使用嵌套对象，前端展示语义更清晰。

## 前端影响范围

| 页面 | 文件 | 修改点 |
|------|------|--------|
| 知识库 | `apps/web/app/console/knowledge-bases/page.tsx` | `KnowledgeBase` 类型增加操作人；表格增加“创建人”“更新人”列或在时间列下方展示 |
| 知识树 | `apps/web/app/console/knowledge-tree/knowledge-tree.types.ts` | `KnowledgeNode` 类型增加操作人 |
| 知识树 | `apps/web/app/console/knowledge-tree/knowledge-tree-browser.tsx` | 节点列表或树节点详情展示创建人、更新人 |
| 知识树 | `apps/web/app/console/knowledge-tree/knowledge-tree-inspector.tsx` | 右侧详情面板展示操作人 |
| 文档处理中心 | `apps/web/app/console/documents/documents.types.ts` | `ImportTask` 类型增加操作人 |
| 文档处理中心 | `apps/web/app/console/documents/page.tsx`、`documents-sections.tsx` | 任务列表展示创建人、更新人 |
| 知识站点文档页 | `apps/web/app/site/[kbId]/doc/[nodeId]/page.tsx` | 如需面向终端用户展示文档维护信息，可读取知识节点 `updatedBy` |

前端展示建议：

- 列表页空间有限时，优先展示“更新人”，在详情或 tooltip 中补充“创建人”。
- 历史数据为空时显示 `-`，不要显示 `null` 或用户 ID。
- 若 `username` 缺失但 `id` 存在，降级显示用户 ID。

## 数据迁移方案

新增迁移建议分两步：

1. 对三张表新增 nullable 字段，避免锁表和历史数据补齐阻塞上线。
2. 可选地基于 `audit_logs` 回填部分历史创建人与更新人，但回填失败不影响主流程。

示例迁移：

```sql
ALTER TABLE "knowledge_bases"
  ADD COLUMN IF NOT EXISTS "created_by_id" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "created_by_name" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "updated_by_id" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "updated_by_name" VARCHAR(64);

ALTER TABLE "knowledge_nodes"
  ADD COLUMN IF NOT EXISTS "created_by_id" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "created_by_name" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "updated_by_id" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "updated_by_name" VARCHAR(64);

ALTER TABLE "import_tasks"
  ADD COLUMN IF NOT EXISTS "created_by_id" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "created_by_name" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "updated_by_id" VARCHAR(64),
  ADD COLUMN IF NOT EXISTS "updated_by_name" VARCHAR(64);
```

索引不建议第一阶段新增。操作人字段主要用于展示，不是核心过滤条件；如果后续产品需要“按创建人筛选知识库/任务”，再补 `(tenant_id, created_by_id)` 或 `(tenant_id, updated_by_id)` 索引。

## 架构边界

- Domain Model 只接收纯数据字段，不引用 `Request`、JWT、Nest Guard 或 TypeORM 装饰器。
- Controller 负责从 `AuthenticatedRequest.user` 或 capability principal 提取操作人。
- Application Service 负责把操作人写入业务变更。
- Repository 只做实体和模型映射，不自行读取当前登录态。
- Worker 和系统任务使用统一常量表示系统操作人，避免散落硬编码字符串。

建议新增共享类型：

```ts
export interface AuditActorSnapshot {
  id: string | null;
  username: string | null;
}
```

该类型可放在 `apps/server/src/common/audit-actor.types.ts`，由知识库、知识树、导入任务、WebDAV 和 capability 复用。

## GitNexus 影响分析

已对核心服务做上游影响分析，风险均为 MEDIUM：

| 目标符号 | 直接影响 | 总影响 | 风险 | 主要直接依赖 |
|----------|----------|--------|------|--------------|
| `KnowledgeBaseService` | 6 | 25 | MEDIUM | `webdav.service.ts`、`knowledge-base.controller.ts`、`knowledge-capability.gateway.ts`、服务测试 |
| `KnowledgeTreeService` | 12 | 38 | MEDIUM | `webdav.service.ts`、`knowledge-tree.controller.ts`、`knowledge-base.service.ts`、`document.service.ts`、`document-collab.gateway.ts`、`knowledge-capability.gateway.ts` |
| `DocumentService` | 6 | 9 | MEDIUM | `document.controller.ts`、`document-collab.gateway.ts`、服务测试 |
| `ImportTaskService` | 6 | 23 | MEDIUM | `webdav.service.ts`、`import-task.controller.ts`、`knowledge-capability.gateway.ts`、服务测试 |

没有 HIGH 或 CRITICAL 风险，但 `KnowledgeTreeService` 的直接依赖最多，建议优先补齐测试再改实现。

## 测试计划

后端测试：

- `knowledge-base.controller.spec.ts`：创建、更新时服务层收到操作人；响应包含操作人。
- `knowledge-base.service.spec.ts`：创建时同时设置创建人和更新人；更新时只刷新更新人。
- `knowledge-tree.controller.spec.ts`：创建、更新、移动节点传递操作人。
- `knowledge-tree.service.spec.ts`：`create`、`createFile`、`update`、`syncContentUri` 的操作人行为。
- `document.controller.spec.ts`：保存正文、上传资产传递操作人。
- `document.service.spec.ts`：保存正文后更新知识节点 `updatedBy`。
- `import-task.controller.spec.ts`：创建、重试、取消任务传递操作人；删除失败任务维持物理删除语义。
- `import-task.service.spec.ts`：创建任务和人工状态变更写入操作人；Worker 状态推进不误覆盖人工操作人。
- `webdav.service.spec.ts`：WebDAV 创建知识库、创建节点、覆盖文档、移动节点时写入 principal 用户名。
- `knowledge-capability.gateway.spec.ts`：capability 创建导入任务时写入 principal 快照。

前端测试：

- `knowledge-bases/page.spec.tsx`：列表展示创建人和更新人，空值显示 `-`。
- `knowledge-tree/page.spec.tsx` 或相关组件测试：详情面板展示操作人。
- `documents/page.spec.tsx`：文档处理中心任务展示操作人。

文档同步：

- 更新 `docs/DATABASE_SCHEMA.md` 三张表字段。
- 更新 `docs/API_REFERENCE.md` 知识库、知识树、文档处理中心响应示例。
- 如 capability 输出也新增字段，更新 `docs/CAPABILITIES.md`。

## 分阶段落地建议

### 第一阶段：只补元数据链路

1. 新增三张表 nullable 操作人字段和迁移。
2. 更新实体、Domain Model、Repository 映射。
3. Controller 提取操作人，Service 写入操作人。
4. API 返回字段，前端列表和详情展示。
5. 补后端单元测试和前端展示测试。

### 第二阶段：补系统入口和历史兼容

1. WebDAV、capability、Worker 统一使用 `AuditActorSnapshot`。
2. 可选基于审计日志做历史回填脚本。
3. 根据产品筛选需求决定是否增加操作人索引。

### 第三阶段：产品体验增强

1. 列表页支持按创建人或更新人筛选。
2. 详情页展示“最近由谁在何时更新”。
3. 审计日志跳转联动，展示完整变更历史。

## 验收标准

- 新建知识库后，列表和详情能看到创建人与更新人均为当前用户。
- 重命名知识库后，创建人不变，更新人变为当前用户。
- 新建知识树目录或文档节点后，列表和详情能看到创建人与更新人。
- 移动、重命名、编辑文档正文后，知识节点更新人变为当前用户。
- 新建文档导入任务后，文档处理中心能看到任务创建人。
- 重试或取消任务后，任务更新人变为当前用户；删除失败任务为物理删除，不保留展示记录。
- 历史数据不报错，操作人为空时前端展示 `-`。
- WebDAV 和 capability 入口不会因为缺少 JWT 用户 ID 报错。
