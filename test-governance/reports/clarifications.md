# 澄清记录

## 2026-05-24 知识库管理集成测试

已掌握信息：

- 项目路径：`E:\zbg\openviking-knowdge`
- 本轮目标：撰写知识库管理测试用例，并执行知识库管理相关集成测试。
- 可复用测试入口：
  - `pnpm --filter server run test -- knowledge-base/knowledge-base.service.spec.ts knowledge-base/knowledge-base.controller.spec.ts capabilities/infrastructure/knowledge-capability.gateway.spec.ts`
  - `pnpm --filter server run test:e2e -- capability-platform.e2e-spec.ts`

已澄清信息：

- 真实服务地址：`https://intra-t-op-knowledge-app.exexm.com/`
- Admin API Base URL：`https://intra-t-op-knowledge-app.exexm.com/api/v1`
- 真实租户：`dev`
- 真实账号：`admin / ******`
- 登录字段：`POST /api/v1/auth/login` 使用 `tenantCode=dev`、`username=admin`。
- 登录结果：`tenant_admin`，租户 ID `3a433169-7eae-4da3-9b6f-9b35d8b0176f`。
- 操作授权：用户已说明“都允许”，本轮允许创建、重命名、删除临时知识库。
- 测试数据边界：使用 `AI测试-知识库管理-<yyyyMMdd-HHmmss>` 命名的临时知识库，脚本结束必须删除。
- 登录密码：`dev@123`，用户于 2026-05-24 直接提供。
- OpenViking 连接边界：允许走知识库删除链路；WebDAV Basic 凭证、导入来源和 UI 浏览器验证仍需在对应场景补充。

复用规则：

- 用户补充后，本文件作为本项目后续知识库管理测试的澄清依据。
- 除非服务地址、租户、账号、权限、数据写入边界或 OpenViking 连接发生变化，不再重复澄清。
- 没有真实环境数据时，所有测试流程必须阻断并显式通知用户补充；不得用 mock、dry-run、离线用例或本地单测替代真实验证结论。
