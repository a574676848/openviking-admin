# 知识库管理集成测试报告

- 执行日期：2026-05-24
- 目标：撰写知识库管理测试用例，并执行知识库管理相关集成测试。
- 项目/模块：`E:\zbg\openviking-knowdge` / 知识库管理。
- 上下文来源：OpenViking 历史记忆、本地源码、`docs/API_REFERENCE.md`、`docs/DOCUMENT_COLLABORATION.md`、既有 Jest/e2e 测试。
- 用户用例映射：用户未提供外部用例；本轮按“知识库管理”目标反向映射到源码、文档和已有测试。
- 跨服务/多项目范围：Admin API、Capability/MCP/CLI、Web 控制台、KnowledgeTree、ImportTask、DocumentSessionRegistry、OVClient/OpenViking 资源接口。
- 技术栈识别：pnpm workspace；server 为 NestJS + Jest + Supertest；web 为 Next.js + Playwright/Vitest。
- QA/QC 验收视角：重点验证租户隔离、ACL 收敛、知识库 CRUD、审计、OpenViking 资源删除结果、Capability 命名空间、真实浏览器 UI 主流程、跨服务未验证依赖。

## 真实环境

- Web 地址：`https://intra-t-op-knowledge-app.exexm.com/`
- API Base URL：`https://intra-t-op-knowledge-app.exexm.com/api/v1`
- 租户：`dev`
- 账号：`admin / ******`
- 登录结果：`tenant_admin`，租户 ID `3a433169-7eae-4da3-9b6f-9b35d8b0176f`
- 授权边界：用户确认“都允许”，本轮允许创建、重命名、删除临时知识库。
- 数据边界：使用 `AI测试-知识库管理-<yyyyMMdd-HHmmss>` 临时知识库，脚本结束必须删除。
- 澄清复用依据：`test-governance/reports/clarifications.md`

## 源码与用例映射

| 范围 | 源码/文档依据 | 用例 |
| --- | --- | --- |
| 管理侧知识库 API | `apps/server/src/knowledge-base/knowledge-base.controller.ts`、`apps/server/src/knowledge-base/knowledge-base.service.ts` | KB-MGMT-001、KB-MGMT-003、KB-MGMT-005、KB-MGMT-007 |
| Capability 知识库能力 | `apps/server/src/capabilities/infrastructure/knowledge-capability.gateway.ts`、`apps/server/src/capabilities/application/capability-registry.ts` | KB-MGMT-010 |
| 控制台知识库管理 UI | `apps/web/app/console/knowledge-bases/page.tsx`、`apps/web/app/console/knowledge-bases/new/page.tsx` | KB-MGMT-005、KB-MGMT-013 |
| 知识库树与 ACL | `apps/server/src/knowledge-tree/knowledge-tree.service.ts`、`KnowledgeNodeAclService` | KB-MGMT-001、KB-MGMT-002 |
| OpenViking 资源清理 | `KnowledgeBaseService.remove()`、`OVClientService.request()` | KB-MGMT-007 |

## 真实环境执行结果

执行方式：PowerShell 直接调用真实 Admin API。登录字段使用 `tenantCode=dev`、`username=admin`，响应 token 从 `data.accessToken` 读取。

| 步骤 | 结果 | 证据摘要 |
| --- | --- | --- |
| 登录真实租户 | 通过 | `role=tenant_admin`，`tenantId=3a433169-7eae-4da3-9b6f-9b35d8b0176f` |
| 分页查询知识库 | 通过 | `GET /knowledge-bases/paged?page=1&pageSize=5` 返回 `total=1`、`pageSize=5` |
| 创建临时知识库 | 通过 | 创建 `AI测试-知识库管理-20260524-114900`，ID `1d5d429c-d5b3-4069-a9a2-3ca167e4d16e` |
| 查询知识库详情 | 通过 | `GET /knowledge-bases/:id` 返回同一 ID 和名称 |
| 查询知识库树 | 通过 | `GET /knowledge-bases/:id/tree` 返回空树，符合新建知识库状态 |
| 重命名知识库 | 通过 | `PATCH /knowledge-bases/:id` 后名称为 `AI测试-知识库管理-20260524-114900-已重命名` |
| Capability 知识库列表 | 通过 | `GET /capability/knowledge-bases` 返回 `count=2` |
| Capability 知识库详情 | 通过 | `GET /capability/knowledge-bases/:id` 返回 `data.item`，ID 与临时知识库一致 |
| 按名称检索重命名结果 | 通过 | `q=AI测试-知识库管理-20260524-114900-已重命名` 命中 1 条 |
| 删除临时知识库 | 通过 | `DELETE /knowledge-bases/:id` 返回成功 |
| 删除后详情不可见 | 通过 | 再次查询详情返回 404 |

## 清理确认

- 临时知识库 ID：`1d5d429c-d5b3-4069-a9a2-3ca167e4d16e`
- 临时知识库名称：`AI测试-知识库管理-20260524-114900`
- 重命名后名称：`AI测试-知识库管理-20260524-114900-已重命名`
- 清理状态：已删除。
- 删除后校验：`GET /knowledge-bases/1d5d429c-d5b3-4069-a9a2-3ca167e4d16e` 返回 404。

## 真实浏览器 UI 验证

执行方式：Kimi WebBridge 控制用户真实浏览器访问 `https://intra-t-op-knowledge-app.exexm.com/`，复用真实租户 `dev` 和账号 `admin / ******`。

### 第一轮（2026-05-24 12:07 CST）

| 步骤 | 结果 | 证据摘要 |
| --- | --- | --- |
| Kimi WebBridge 健康检查 | 通过 | daemon `v1.9.11` running，extension `1.9.7` connected |
| 登录后台管理 | 通过 | `/login` 填写租户、账号、密码后进入 `/console/dashboard` |
| 打开知识库管理 | 通过 | `/console/knowledge-bases` 显示”知识库管理”和真实列表 |
| 新建知识库 | 通过 | UI 点击”新建知识库”并提交，网络 `POST /api/v1/knowledge-bases` 返回 201 |
| 列表展示新增数据 | 通过 | 列表数量从 1 变为 2，新增 `AI测试-UI知识库-20260524-120719` |
| 重命名知识库 | 通过 | UI 打开”更多操作/重命名知识库”，网络 `PATCH /api/v1/knowledge-bases/76f9a186-7ccd-45ad-a2f8-9a8b5ac010be` 返回 200 |
| 按名称检索 | 通过 | 搜索 `AI测试-UI知识库-20260524-120719-已重命名` 后列表显示 1 条 |
| 归档知识库 | 通过 | UI 点击”归档知识库”并确认，网络 `PATCH /api/v1/knowledge-bases/76f9a186-7ccd-45ad-a2f8-9a8b5ac010be` 返回 200 |
| 归档后列表隐藏 | 通过 | 搜索同名知识库显示”暂无匹配知识库”，截图见 `test-governance/evidence/screenshots/2026-05-24-kb-ui-archived.png` |
| 临时数据清理 | 通过 | API 删除 `76f9a186-7ccd-45ad-a2f8-9a8b5ac010be`，删除后详情返回 404 |

### 第二轮（2026-05-24 12:35 CST）

| 步骤 | 结果 | 证据摘要 |
| --- | --- | --- |
| Kimi WebBridge 健康检查 | 通过 | daemon `v1.9.11` running，extension `1.9.7` connected |
| 登录后台管理 | 通过 | `/login` 填写租户 dev、账号 admin，登录后进入 `/console/dashboard` |
| 打开知识库管理 | 通过 | `/console/knowledge-bases` 显示知识库管理页面和列表 |
| 新建知识库 | 通过 | 点击”新建知识库”，填写名称 `AI测试-知识库管理-20260524-123500` 后提交，POST 返回 201 |
| 列表展示新增数据 | 通过 | 列表中出现新建知识库，名称与创建一致 |
| 重命名知识库 | 通过 | 点击”更多操作/重命名知识库”，输入新名称 `AI测试-知识库管理-20260524-123500-已重命名` 后 Enter 提交 |
| 按名称检索 | 通过 | 搜索 `AI测试-知识库管理-20260524-123500-已重命名`，列表显示 1 条匹配结果 |
| 归档知识库 | 通过 | 点击”归档知识库”并确认”归档知识库”按钮，PATCH 返回 200 |
| 归档后列表隐藏 | 通过 | 搜索框保留 `AI测试-知识库管理-20260524`，列表显示”暂无匹配知识库”，符合 KB-MGMT-006 预期。截图见 `test-governance/evidence/screenshots/2026-05-24-kb-ui-archived.png` |
| API 清理 | 通过 | DELETE `/knowledge-bases/6a9e16a0-c205-444c-abab-099f53b9f93e` 返回成功 |
| 删除后详情不可见 | 通过 | GET 返回 404 `{“code”:”CAPABILITY_NOT_FOUND”,”message”:”知识库 6a9e16a0-... 不存在或无权访问”}` |

UI 验证观察：

- 新建页面的描述 textarea 在 Kimi WebBridge `fill` 时返回 `fill: Uncaught`，本轮未把”详细描述”作为 UI 断言项。
- 控制台 UI 只有”归档知识库”，没有直接删除入口；清理闭环通过真实 Admin API 删除归档后的临时知识库完成。
- 第二轮验证中，”更多操作”下拉菜单中的 `@e` 引用在第一次 `click` 失败（”No node with given id found”），需要先重新 `click` 展开按钮再操作下拉项。这是 Kimi WebBridge 的已知行为：弹出层关闭后 `@e` ref 失效。
- 第二轮将重命名提交方式从”点击 `@e` ref”改为”evaluate Enter key”，更稳定。

## 本地既有自动化回归

上一次治理记录中已通过以下项目内测试；本轮报告保留为源码层补充证据，真实环境结论以上述 API 执行为准。

```powershell
pnpm --filter server run test -- knowledge-base/knowledge-base.service.spec.ts knowledge-base/knowledge-base.controller.spec.ts capabilities/infrastructure/knowledge-capability.gateway.spec.ts
```

```text
Test Suites: 3 passed, 3 total
Tests:       22 passed, 22 total
```

```powershell
pnpm --filter server run test:e2e -- capability-platform.e2e-spec.ts
```

```text
Test Suites: 1 passed, 1 total
Tests:       11 passed, 11 total
```

## 结论

- 知识库管理真实环境 API 集成链路通过：登录、分页、创建、详情、树查询、重命名、Capability 列表、Capability 详情、名称检索、删除和删除后不可见均已验证。
- 控制台知识库管理真实浏览器主流程通过：登录、新建、列表展示、重命名、搜索、归档和归档后隐藏均已验证。
- 临时测试数据已完成清理，未遗留本轮创建的知识库。
- Capability 详情真实响应为 `data.item` 包装结构，测试脚本和后续断言应按该结构解析。

## 未覆盖与风险

- WebDAV 根目录知识库治理未执行：缺少 WebDAV Basic 专用凭证或 API Key 路径，不能声明 KB-MGMT-012 通过。
- 真实导入任务未执行：缺少可导入来源和任务清理边界，不能声明 KB-MGMT-011 真实通过。
- UI 描述字段未断言：Kimi WebBridge 对 textarea 填充返回扩展异常，需后续用人工输入或扩展修复后补测。
- 配额上限未执行：需要配置了 `maxDocs` 的真实租户或专项测试租户。
- 跨租户真实验证未执行：需要第二租户和受控测试数据。
