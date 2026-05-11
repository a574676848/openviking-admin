import { NotFoundException } from '@nestjs/common';
import { CapabilityCredentialService } from './capability-credential.service';

describe('CapabilityCredentialService', () => {
  function createService(options?: {
    resolvedOvConfig?: Record<string, string | null>;
  }) {
    const keyRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'key-1',
        apiKey: 'ov-sk-test',
        userId: 'user-1',
        tenantId: 'tenant-1',
        expiresAt: null,
      }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const userRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'user-1',
        username: '张三',
        tenantId: 'tenant-1',
        role: 'tenant_admin',
      }),
    };
    const jwtService = {
      verify: jest.fn(),
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
        jwtService as never,
        ovConfigResolver as never,
      ),
      keyRepo,
      ovConfigResolver,
    };
  }

  it('解析 API Key 时应复用统一 OV 配置回退链路', async () => {
    const { service, keyRepo, ovConfigResolver } = createService();

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

    expect(ovConfigResolver.resolve).toHaveBeenCalledWith('tenant-1');
    expect(keyRepo.update).toHaveBeenCalledWith('key-1', {
      lastUsedAt: expect.any(Date),
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
