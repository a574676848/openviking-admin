import { NotFoundException } from '@nestjs/common';
import { CapabilityCredentialService } from './capability-credential.service';

describe('CapabilityCredentialService', () => {
  function createService(options?: {
    resolvedOvConfig?: Record<string, string | null>;
    keyTenantId?: string;
    tenantCode?: string;
  }) {
    const keyTenantId = options?.keyTenantId ?? 'tenant-record-1';
    const tenantCode = options?.tenantCode ?? 'tenant-1';
    const keyRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'key-1',
        apiKey: 'ov-sk-test',
        userId: 'user-1',
        tenantId: keyTenantId,
        expiresAt: null,
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        username: '张三',
        tenantId: keyTenantId,
        role: 'tenant_admin',
      }),
    };
    const tenantRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: keyTenantId,
        tenantId: tenantCode,
      }),
    };
    const jwtService = {
      verify: jest.fn().mockReturnValue({
        sub: 'user-1',
        username: '张三',
        tenantId: keyTenantId,
        role: 'tenant_admin',
      }),
    };
    const ovConfigResolver = {
      resolve: jest.fn().mockResolvedValue(
        options?.resolvedOvConfig ?? {
          baseUrl: 'http://ov.env',
          apiKey: 'env-key',
          account: 'env-account',
          user: 'env-user',
          rerankEndpoint: null,
          rerankApiKey: null,
          rerankModel: null,
        },
      ),
    };

    return {
      service: new CapabilityCredentialService(
        keyRepo as never,
        userRepo as never,
        tenantRepo as never,
        jwtService as never,
        ovConfigResolver as never,
      ),
      keyRepo,
      tenantRepo,
      ovConfigResolver,
    };
  }

  it('解析 API Key 时应复用统一 OV 配置回退链路并归一化租户编码', async () => {
    const { service, keyRepo, tenantRepo, ovConfigResolver } = createService();

    await expect(
      service.resolvePrincipalFromApiKey('ov-sk-test', 'service'),
    ).resolves.toMatchObject({
      userId: 'user-1',
      username: '张三',
      tenantId: 'tenant-1',
      role: 'tenant_admin',
      ovConfig: {
        baseUrl: 'http://ov.env',
        apiKey: 'env-key',
        account: 'env-account',
        user: 'env-user',
      },
    });

    expect(ovConfigResolver.resolve).toHaveBeenCalledWith('tenant-record-1');
    expect(tenantRepo.findOne).toHaveBeenCalledWith({
      where: [{ tenantId: 'tenant-record-1' }],
    });
    expect(keyRepo.update).toHaveBeenCalledWith('key-1', {
      lastUsedAt: expect.any(Date),
    });
  });

  it('解析 JWT 时应把租户记录主键转换为业务租户编码', async () => {
    const { service } = createService({
      keyTenantId: 'c931072d-3c7f-4290-af54-27cf7eaf6f77',
      tenantCode: 'rag',
    });

    await expect(
      service.resolvePrincipalFromJwt('jwt-token', 'service'),
    ).resolves.toMatchObject({
      tenantId: 'rag',
      role: 'tenant_admin',
    });
  });

  it('统一 OV 配置缺少必要字段时应阻断凭据解析', async () => {
    const { service } = createService({
      resolvedOvConfig: {
        baseUrl: 'http://ov.env',
        apiKey: null,
        account: 'env-account',
        user: null,
        rerankEndpoint: null,
        rerankApiKey: null,
        rerankModel: null,
      },
    });

    await expect(
      service.resolvePrincipalFromApiKey('ov-sk-test', 'service'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
