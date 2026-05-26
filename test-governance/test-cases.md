# 知识库管理测试用例矩阵

## 范围说明

本轮覆盖知识库管理的管理侧 API、Capability/MCP/CLI 能力入口、前端治理入口和跨服务依赖。用户已补充真实环境、租户、账号与写入授权；已执行真实环境知识库 API 集成链路，并保留 WebDAV、导入任务、真实浏览器 UI、配额和跨租户专项数据为未覆盖风险。

## 源码与文档映射

| 范围 | 源码/文档依据 | 已有测试 |
| --- | --- | --- |
| 管理侧知识库 API | `apps/server/src/knowledge-base/knowledge-base.controller.ts`、`apps/server/src/knowledge-base/knowledge-base.service.ts`、`docs/API_REFERENCE.md#知识库接口` | `apps/server/src/knowledge-base/knowledge-base.controller.spec.ts`、`apps/server/src/knowledge-base/knowledge-base.service.spec.ts` |
| Capability / MCP / CLI 知识库能力 | `apps/server/src/capabilities/capabilities.controller.ts`、`apps/server/src/capabilities/infrastructure/knowledge-capability.gateway.ts`、`docs/API_REFERENCE.md#文档导入相关-capability` | `apps/server/src/capabilities/infrastructure/knowledge-capability.gateway.spec.ts`、`apps/server/test/capability-platform.e2e-spec.ts` |
| 前端知识库管理 | `apps/web/app/console/knowledge-bases/page.tsx`、`apps/web/e2e/console-flows.spec.ts` | `apps/web/e2e/console-flows.spec.ts` |
| 跨服务删除与资源清理 | `KnowledgeBaseService.remove()`、`KnowledgeTreeService.remove()`、`OVClientService.request()`、`DocumentSessionRegistry.hasActiveSessionInKb()`、`docs/DOCUMENT_COLLABORATION.md` | `apps/server/src/knowledge-base/knowledge-base.service.spec.ts`、`apps/server/src/common/document-session-registry.spec.ts` |
| 导入目标与知识库树 | `apps/server/src/import-task/import-task.service.ts`、`apps/server/src/knowledge-tree/knowledge-tree.service.ts`、`docs/API_REFERENCE.md#导入任务接口` | `apps/server/src/import-task/import-task.service.spec.ts`、`apps/server/src/knowledge-tree/knowledge-tree.service.spec.ts` |

## 用例矩阵

| ID | 标题 | 类型 | 优先级 | 依据 | 前置条件 | 步骤 | 预期结果 | 自动化方式 | 证据 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| KB-MGMT-001 | 租户视角分页查询知识库列表 | integration | P0 | `GET /api/v1/knowledge-bases/paged`、`KnowledgeBaseController.findPaged` | 真实租户、JWT、至少 1 个可见知识库 | 使用租户账号请求分页接口，传入 `page`、`pageSize`、可选 `q` | 返回当前租户 ACL 可见知识库，包含 `items/total/page/pageSize/pages` | 已真实环境验证 | 2026-05-24 真实租户 `dev` 分页查询通过，见 `reports/2026-05-24-knowledge-base-integration.md` |
| KB-MGMT-002 | 知识库列表按 ACL 收敛 | integration | P0 | `filterVisibleKnowledgeBases()`、`KnowledgeNodeAclService.filterReadableNodes`、API 文档 ACL 说明 | 同租户下存在可见和不可见知识节点 | 用只读或受限用户查询列表/分页/详情/tree | 不可见知识库不出现在列表，详情和树查询拒绝越权 | 已自动化 | `findAll 应过滤掉当前用户无 ACL 可见节点的知识库` |
| KB-MGMT-003 | 创建知识库写入租户边界与审计 | integration | P0 | `POST /api/v1/knowledge-bases`、`KnowledgeBaseService.create`、`AuditService.log` | 真实租户、`tenant_admin` 或 `tenant_operator`，可写测试命名空间 | 创建测试知识库并查询列表 | 知识库归属当前租户，审计包含创建人和 requestId | 已真实环境验证 | 创建临时知识库 `AI测试-知识库管理-20260524-114900` 成功并完成清理 |
| KB-MGMT-004 | 创建知识库达到租户配额时拒绝 | integration | P1 | `tenant.quota.maxDocs`、`KnowledgeBaseService.create` | 配置了 `maxDocs` 的真实租户或模拟租户 | 在达到配额后继续创建知识库 | 返回权限/配额错误，不新增知识库 | 建议自动化 | 当前未直接覆盖，需补充服务测试或真实租户验证 |
| KB-MGMT-005 | 重命名知识库并保留空间入口 | integration/ui | P0 | `PATCH /api/v1/knowledge-bases/:id`、`apps/web/app/console/knowledge-bases/page.tsx` | 真实可写知识库 | 修改名称后刷新列表和空间入口 | 列表展示新名称，`vikingUri` 不因重命名变化 | 已真实环境验证 | 真实 API 重命名和 Kimi WebBridge 真实浏览器重命名均通过 |
| KB-MGMT-006 | 归档知识库后从列表隐藏 | integration | P0 | `status=archived`、`KnowledgeBaseService.findAll/findOne` | 真实可归档测试知识库 | 将知识库状态改为 `archived` 后查询列表和详情 | 列表过滤归档项，详情按不存在处理 | 已自动化 | `读取知识库列表时应过滤归档项`、`读取单个知识库时若已归档应返回不存在` |
| KB-MGMT-007 | 删除知识库先清理 OpenViking 根资源再删 Admin 元数据 | integration | P0 | `KnowledgeBaseService.remove`、`OVClientService.request`、`KnowledgeTreeService.remove` | 真实可删除测试知识库，允许调用 OpenViking 删除 | 删除知识库 | 先递归删除根 `vikingUri`，再删除根节点和知识库元数据；OpenViking 404 视为幂等成功 | 已真实环境验证 | 临时知识库删除成功，删除后详情返回 404；内部删除顺序由服务单测覆盖 |
| KB-MGMT-008 | 活跃协作会话阻止知识库删除 | integration | P0 | `DocumentSessionRegistry.hasActiveSessionInKb`、`docs/DOCUMENT_COLLABORATION.md` | 目标知识库下存在活跃协作会话 | 删除知识库 | 返回 423 Locked，不调用 OpenViking 删除和本地删除 | 已自动化 | `删除知识库前应阻止活跃协作会话所在的知识库` |
| KB-MGMT-009 | Capability 删除知识库执行 ACL 校验并记录审计 | integration | P0 | `knowledgeBases.delete`、`KnowledgeCapabilityGateway.deleteKnowledgeBase` | `tenant_operator` capability principal，目标知识库 ACL 可见 | 通过 capability 删除知识库 | 执行 ACL 校验，调用服务删除，审计记录 channel/trace/requestId | 已自动化 | `删除知识库时应执行 ACL 校验并记录审计` |
| KB-MGMT-010 | Capability 知识库列表和详情避开业务路由 | e2e | P0 | `/api/v1/capability/knowledge-bases`、`/api/v1/capability/knowledge-bases/:id`、`CapabilitiesController` | 真实 JWT、API Key 或 capability token | 查询能力命名空间列表和详情 | 执行 `knowledgeBases.list/detail`，不冲突管理侧业务路由 | 已真实环境验证 | JWT 真实环境查询 Capability 列表和详情通过；API Key 专项仍由 `capability-platform.e2e-spec.ts` 覆盖 |
| KB-MGMT-011 | 导入任务选择目标知识库并受 ACL 收敛 | integration | P1 | `documents.import.*`、`ImportTaskService`、`KnowledgeCapabilityGateway` | 真实目标知识库、导入来源、ACL 可见 | 创建导入任务并查询状态/事件 | 任务绑定目标知识库，列表和状态按 ACL 过滤 | 已部分自动化 | `创建文档导入任务时应透传来源展示名`；真实导入需补充可导入来源和清理边界 |
| KB-MGMT-012 | WebDAV 根目录下创建/重命名/删除知识库 | integration | P1 | `docs/API_REFERENCE.md#WebDAV 入口`、`WebdavService` | WebDAV Basic 凭证、可写租户、测试知识库命名边界 | 使用 MKCOL/MOVE/DELETE 操作租户根知识库目录 | 创建、重命名、删除映射到知识库治理，写入审计 | 建议自动化 | 需真实 WebDAV 环境和可写数据边界 |
| KB-MGMT-013 | 控制台知识库管理主流程 | ui/integration | P1 | `apps/web/app/console/knowledge-bases/page.tsx`、`console-flows.spec.ts` | Web 控制台 URL、真实租户账号、可写测试知识库 | 登录后新建、重命名、归档知识库，并用 API 清理临时数据 | 页面状态、接口响应和提示一致，无越权或控制台错误 | 已真实环境验证 | Kimi WebBridge 真实浏览器验证通过；截图 `evidence/screenshots/2026-05-24-kb-ui-archived.png` |
| KB-MGMT-014 | 跨租户访问知识库被拒绝 | integration | P0 | `KnowledgeBaseService.findOne/update/remove` | 至少两个租户或模拟跨租户数据 | 使用租户 A 访问租户 B 知识库 | 读取、更新、删除均返回不存在或拒绝 | 已自动化 | `跨租户查询/更新/删除知识库时应拒绝访问` |

## 本轮排除范围

- 未执行 WebDAV 真实客户端验证，原因是本轮未获得 WebDAV Basic 专用凭证或 API Key 路径。
- 未执行真实导入任务，原因是本轮未提供可导入来源和清理边界。
- 已执行前端真实浏览器 UI 验收；描述 textarea 填充因 Kimi WebBridge 扩展返回 `fill: Uncaught` 未纳入本轮 UI 断言。
- 未执行配额上限和跨租户真实专项，原因是需要配额受限租户或第二租户数据。
- 未执行全量 `pnpm test`、全量 e2e、全量 web e2e；本轮按知识库管理影响面裁剪最小验证集。
