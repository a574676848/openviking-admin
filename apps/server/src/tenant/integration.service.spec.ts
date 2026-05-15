import { IntegrationService } from './integration.service';
import type { IntegrationModel } from './domain/integration.model';

const MASKED_SECRET_PLACEHOLDER = '********';

describe('IntegrationService', () => {
  const repo = {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const encryption = {
    encrypt: jest.fn((value: string) => `encrypted:${value}`),
    decrypt: jest.fn((value: string) => value.replace(/^encrypted:/, '')),
  };
  let service: IntegrationService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new IntegrationService(repo, encryption as never);
  });

  function createIntegration(
    overrides: Partial<IntegrationModel> = {},
  ): IntegrationModel {
    return {
      id: 'integration-1',
      tenantId: 'rag',
      name: 'gitlab',
      type: 'gitlab' as never,
      credentials: {
        token: 'encrypted:old-token',
        username: 'baogen.zhang',
        baseUrl: 'https://git.exexm.com',
      },
      config: null,
      active: true,
      createdAt: new Date('2026-05-12T00:00:00.000Z'),
      updatedAt: new Date('2026-05-12T00:00:00.000Z'),
      ...overrides,
    };
  }

  it('更新集成时应保留脱敏占位符对应的原密文', async () => {
    repo.findOne.mockResolvedValue(createIntegration());
    repo.save.mockImplementation(async (value) => value);

    await service.update(
      'integration-1',
      {
        name: 'gitlab',
        type: 'gitlab',
        credentials: {
          token: MASKED_SECRET_PLACEHOLDER,
          username: 'zhang.baogen',
          baseUrl: 'https://git.exexm.com',
        },
      },
      'rag',
    );

    expect(encryption.encrypt).not.toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: {
          token: 'encrypted:old-token',
          username: 'zhang.baogen',
          baseUrl: 'https://git.exexm.com',
        },
      }),
    );
  });

  it('更新集成时应加密新提交的敏感凭证', async () => {
    repo.findOne.mockResolvedValue(createIntegration());
    repo.save.mockImplementation(async (value) => value);

    await service.update(
      'integration-1',
      {
        name: 'gitlab',
        type: 'gitlab',
        credentials: {
          token: 'new-token',
          username: 'baogen.zhang',
        },
      },
      'rag',
    );

    expect(encryption.encrypt).toHaveBeenCalledWith('new-token');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: {
          token: 'encrypted:new-token',
          username: 'baogen.zhang',
        },
      }),
    );
  });

  it('脱敏输出不应修改原始凭证对象', () => {
    const item = createIntegration();

    const masked = service.mask(item);

    expect(masked.credentials.token).toBe(MASKED_SECRET_PLACEHOLDER);
    expect(item.credentials.token).toBe('encrypted:old-token');
  });
});
