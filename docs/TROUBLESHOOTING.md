# 故障排查指南

本文档汇总常见问题及其解决方案。

---

## 启动问题

### 1. 后端启动失败: `ECONNREFUSED 127.0.0.1:5432`

**原因**: PostgreSQL 未启动或连接信息错误。

**解决**:
```bash
# 检查 PostgreSQL 是否运行
pg_isready -h localhost -p 5432

# 确认 .env 中的连接信息正确
cat apps/server/.env | grep DB_
```

### 2. 后端启动失败: `relation "users" does not exist`

**原因**: 数据库迁移未执行。

**解决**:
```bash
cd apps/server
pnpm typeorm migration:run -d src/data-source.ts
```

### 3. 前端启动失败: `Port 6002 is already in use`

**原因**: 端口被占用。

**解决**:
```bash
# 查找占用端口的进程 (Windows)
netstat -ano | findstr :6002

# 查找占用端口的进程 (Linux/Mac)
lsof -i :6002

# 或者修改前端端口
# apps/web/.env.local 中添加:
# PORT=3001
```

### 4. `pnpm install` 失败: `ERR_PNPM_WORKSPACE_CONFIG`

**原因**: pnpm-workspace.yaml 配置问题。

**解决**:
```bash
# 确认 pnpm 版本 >= 8
pnpm --version

# 清理缓存重试
pnpm store prune
pnpm install
```

---

## 认证问题

### 5. 登录后 401: `Invalid token`

**原因**: JWT_SECRET 前后端不一致或 Token 过期。

**解决**:
- 确认后端 `.env` 中 `JWT_SECRET` 未修改后重启
- Token 2 小时过期，重新登录获取新 Token
- 检查浏览器 Network 面板确认 `Authorization` Header 格式为 `Bearer <token>`

### 6. SSO 回调失败: `error=invalid_code`

**原因**: SSO Provider 返回的授权码无效或已过期。

**解决**:
- 检查集成配置中 `appId` / `appSecret` 是否正确
- 确认回调 URL 与 SSO Provider 中配置一致
- 确认对应租户下存在已启用的 SSO 集成配置

### 7. SSO 登录后用户不存在

**原因**: JIT Provisioning 失败。

**解决**:
- 检查 `SSOPortalService` 日志，确认 `syncUser()` 是否执行
- 确认租户下存在对应类型的激活集成配置 (`active: true`)
- 检查 `sso_id` 字段是否已添加到数据库 (需执行 `FixSchemaInconsistencies` 迁移)

---

## 数据库问题

### 8. 创建租户时报错: `permission denied to create schema`

**原因**: PostgreSQL 用户缺少 `CREATE` 权限。

**解决**:
```sql
GRANT CREATE ON DATABASE openviking_admin TO postgres;
```

### 9. MEDIUM 隔离等级租户查询为空

**原因**: Schema 未正确初始化。

**解决**:
```sql
-- 检查租户 Schema 是否存在
SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%';

-- 手动触发 Schema 初始化 (通过代码调用)
-- SchemaInitializerService.runSchemaDDL(tenantId)
```

### 10. 数据库连接池耗尽

**原因**: LARGE 租户过多或 QueryRunner 未释放。

**解决**:
- 检查 `TenantCleanupInterceptor` 是否正常注册
- 监控 `GET /api/v1/system/health` 中的 `dbPool` 指标
- LARGE 租户连接池默认最大 10 连接，可在 `DynamicDataSourceService` 中调整

---

## OpenViking 引擎问题

### 11. 检索返回 500: `OpenViking connection failed`

**原因**: OV 引擎未启动或地址不可达。

**解决**:
```bash
# 检查 OV 引擎是否运行
curl http://localhost:1933/api/v1/health

# 确认 .env 中 OV_BASE_URL 和 OV_API_KEY 正确
cat apps/server/.env | grep OV_
```

### 12. 导入任务一直处于 pending 状态

**原因**: TaskWorker 未启动或 OV 引擎不可达。

**解决**:
- 检查后端日志，确认 `TaskWorkerService` 是否启动
- TaskWorker 在模块初始化时启动，定时轮询 `pending` 任务
- 确认 OV 引擎 `/api/v1/resources` 端点可访问

### 13. 平台文档导入返回 422: `extra_forbidden`

**原因**: OpenViking 资源接口只接受 `path` 或 `temp_file_id` 等标准字段。如果旧 Worker 将飞书、钉钉 Token 或 `config` 透传给 `/api/v1/resources`，OpenViking 会拒绝未知字段。

**解决**:
- 确认 Worker 使用 Admin 侧平台文档解析流程
- 飞书文档应先读取 `raw_content`，再通过 `/api/v1/resources/temp_upload` 注入
- 钉钉文档应通过应用 Token、`operatorId` 和文档块接口读取内容，再通过 `temp_upload` 注入
- 网页 URL 不需要 `temp_upload`，直接由 OpenViking 原生 URL 抓取能力处理

### 14. 平台文档导入后节点或向量数量暂时为 0

**原因**: 平台文档使用 `wait=false` 注入，OpenViking 接收资源后会继续在后台处理语义化队列。

**解决**:
- 等待 OpenViking 后台队列处理完成
- 调用 `GET /api/v1/import-tasks/:id/sync` 同步最新 `nodeCount` 和 `vectorCount`
- 如需排查资源是否已落盘，优先检查 `/api/v1/fs/tree?uri=<targetUri>`

### 15. Rerank 超时

**原因**: Rerank 服务响应慢或未配置。

**解决**:
- 检查 `system_configs` 表中 `rerank.endpoint`、`rerank.api_key` 与 `rerank.model` 配置
- 确认 `rerank.endpoint` 指向可用的完整重排地址，推荐格式为 `http://host:port/v1/rerank`
- 默认超时 1500ms，由服务端网关控制，超时会自动回退到 Stage 1 结果
- 如果不需要 Rerank，设置 `search.rerank_enabled` 为 `false`

---

## 前端问题

### 16. 前端页面空白

**原因**: 后端 API 不可达或构建产物问题。

**解决**:
- 检查浏览器 Console 是否有 API 请求报错
- 确认 `apps/web/.env.local` 中 `BACKEND_URL` 指向正确的后端地址
- 开发模式下 `next.config.ts` 的 rewrite 代理自动转发 `/api/v1/*` 到后端

### 17. 主题切换不生效

**原因**: `next-themes` 配置问题或 localStorage 缓存。

**解决**:
- 清除浏览器 localStorage 中 `theme` 键
- 检查 `ThemeSwitcher` 组件是否正确调用 `setTheme()`

---

## MCP 问题

### 18. MCP SSE 连接断开

**原因**: 网络不稳定或反向代理未配置 SSE 支持。

**解决**:
- 如果使用 Nginx，确保 `/api/v1/mcp/sse` 配置了 `proxy_buffering off` 和 `chunked_transfer_encoding off` (见 `DEPLOYMENT.md`)
- 检查 API key 或 session key 是否有效
- 确认 Capability Key 未过期且未被删除

### 19. MCP 工具调用返回空结果

**原因**: 租户 Scope 未正确注入或知识库为空。

**解决**:
- 确认 Capability Key 绑定的租户下有可用的知识库
- 检查知识树节点是否已关联 `viking_uri`
- 通过 `GET /api/v1/system/dashboard` 确认知识库文档数 > 0

---

## 日志排查

### 查看后端日志

```bash
# 开发模式 (自动输出到终端)
cd apps/server && pnpm start:dev

# 生产模式 (建议配置日志文件)
cd apps/server && pnpm start:prod > server.log 2>&1
```

### 查看审计日志

通过 API 查询：
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:6001/api/v1/audit?pageSize=10&dateFrom=2024-01-01"
```

### 查看搜索日志

通过 API 查询无结果搜索：
```bash
curl -H "Authorization: Bearer <token>" \
  "http://localhost:6001/api/v1/search/analysis"
```
