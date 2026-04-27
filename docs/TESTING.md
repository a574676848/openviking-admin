# 测试指南

本文档描述项目的测试策略、测试框架和编写测试的最佳实践。

---

## 测试框架

| 框架 | 用途 | 说明 |
|------|------|------|
| Jest | 单元测试 + E2E | NestJS 默认测试框架 |
| Supertest | HTTP 端点测试 | E2E 测试中模拟 HTTP 请求 |
| TypeORM TestConnection | 数据库测试 | 使用内存数据库或测试 Schema |

---

## 当前测试覆盖

| 测试文件 | 覆盖模块 | 状态 |
|----------|----------|------|
| `app.controller.spec.ts` | AppController | 基础测试 |
| `auth.service.spec.ts` | AuthService | 基础测试 |
| `tenant.service.spec.ts` | TenantService | 基础测试 |

> **注意**: 当前测试覆盖率极低。绝大多数 Service、Controller、Repository、Guard、Interceptor、SSO Provider、Integrator Strategy 均无单元测试。前端无任何测试文件。

---

## 运行测试

```bash
cd apps/server

pnpm test          # 运行所有单元测试
pnpm test:watch    # 监听模式
pnpm test:cov      # 生成覆盖率报告
pnpm test:e2e      # 运行 E2E 测试
pnpm test -- -t "AuthService"  # 运行特定测试
```

---

## 测试策略

### 1. 单元测试

测试单个 Service/Provider/Strategy 的逻辑，不依赖真实数据库。

**示例: 测试 AuthService 登录逻辑**

```typescript
describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<UsersService>;
  let auditService: jest.Mocked<AuditService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UsersService,
          useValue: { findOneByUsername: jest.fn(), create: jest.fn() },
        },
        {
          provide: AuditService,
          useValue: { logAction: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    usersService = module.get(UsersService);
    auditService = module.get(AuditService);
  });

  it('should reject login with wrong password', async () => {
    usersService.findOneByUsername.mockResolvedValue({
      id: 'uuid',
      username: 'admin',
      passwordHash: '$2a$10$hashed',
      role: 'tenant_viewer',
      tenantId: 'default',
      active: true,
    });

    jest.spyOn(require('bcryptjs'), 'compare').mockResolvedValue(false);

    await expect(service.login('admin', 'wrong', 'default', '127.0.0.1'))
      .rejects.toThrow();
  });
});
```

### 2. 多租户测试

测试 TenantGuard 和动态数据源在不同隔离等级下的行为。

**关键测试点**:
- SMALL 等级: 验证 `search_path TO public` 设置
- MEDIUM 等级: 验证 `search_path TO tenant_{id}` 设置
- LARGE 等级: 验证独立 DataSource 创建和连接
- Cleanup Interceptor: 验证 QueryRunner 在异常情况下也能释放

```typescript
describe('TenantGuard', () => {
  it('should set search_path for MEDIUM isolation', async () => {
    // 模拟租户配置为 medium
    // 验证 QueryRunner.query('SET search_path TO tenant_acme') 被调用
  });

  it('should create independent DataSource for LARGE isolation', async () => {
    // 模拟租户配置为 large
    // 验证 DynamicDataSourceService.getOrCreateDataSource 被调用
  });

  it('should release QueryRunner on error', async () => {
    // 模拟 Service 抛出异常
    // 验证 TenantCleanupInterceptor 的 finalize 仍执行 release
  });
});
```

### 3. SSO Provider 测试

测试各 Provider 的认证流程和 JIT Provisioning。

**关键测试点**:
- OIDC Provider: 验证标准 OAuth2 authorization_code 流程
- 飞书/钉钉 Provider: 验证 Token 获取和用户信息提取
- LDAP Provider: 验证 Bind 验证流程
- JIT Provisioning: 验证首次登录自动创建用户

### 4. 检索测试

测试二阶段检索流程。

**关键测试点**:
- Stage 1: 验证 OV 客户端调用和参数传递
- Stage 2: 验证 Rerank 调用 (含超时处理)
- ACL 过滤: 验证基于节点 ACL 的 URI 过滤
- 日志记录: 验证搜索日志正确写入

### 5. E2E 测试

测试完整的 HTTP 请求链路。

```typescript
describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('POST /api/v1/auth/login - should return access token', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'default@123', tenantCode: 'default' })
      .expect(201)
      .expect((res) => {
        expect(res.body.accessToken).toBeDefined();
        expect(res.body.user.username).toBe('admin');
      });
  });

  it('POST /api/v1/auth/login - should reject wrong password', () => {
    return request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'wrong', tenantCode: 'default' })
      .expect(401);
  });
});
```

---

## 前端测试 (待实现)

前端暂未配置测试框架。建议采用以下方案：

### 推荐方案

| 工具 | 用途 | 说明 |
|------|------|------|
| Vitest | 单元测试 | 与 Next.js 兼容性更好 |
| Testing Library | 组件测试 | 测试 React 组件渲染和交互 |
| Playwright | E2E 测试 | 浏览器自动化测试 |

### 建议优先测试的组件

1. **AppProvider**: 全局状态管理 (user, theme, login/logout)
2. **VikingWatcher**: 鼠标跟随和密码闭眼逻辑
3. **DataTable**: 通用表格组件的排序、过滤、分页
4. **FormModal**: 表单验证和提交逻辑
5. **apiClient**: Token 附加和 401 处理

---

## 测试覆盖率目标

| 层级 | 目标覆盖率 | 优先级 |
|------|-----------|--------|
| Service 层 | 80%+ | 高 |
| Controller 层 | 70%+ | 高 |
| Guard/Interceptor | 90%+ | 高 (安全关键) |
| Repository 层 | 60%+ | 中 |
| SSO Provider | 80%+ | 高 |
| 前端组件 | 50%+ | 中 |

---

## CI 集成 (建议)

```yaml
# .github/workflows/test.yml (示例)
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_PASSWORD: test
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install
      - run: pnpm test:cov
        working-directory: apps/server
        env:
          DB_HOST: localhost
          DB_PORT: 5432
          DB_USER: postgres
          DB_PASS: test
          DB_NAME: openviking_admin_test
          JWT_SECRET: test-secret
```
