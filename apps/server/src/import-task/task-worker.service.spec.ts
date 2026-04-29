import { TaskWorkerService } from './task-worker.service';
import { ImportTask } from './entities/import-task.entity';
import { Integration } from '../tenant/entities/integration.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import {
  IntegrationType,
  TaskStatus,
  TenantIsolationLevel,
  TenantStatus,
} from '../common/constants/system.enum';
import type { ImportTaskModel } from './domain/import-task.model';

describe('TaskWorkerService', () => {
  const createTask = (
    id: string,
    tenantId: string,
    status: TaskStatus = TaskStatus.PENDING,
  ): ImportTask =>
    ({
      id,
      tenantId,
      integrationId: 'integration-1',
      kbId: 'kb-1',
      sourceType: 'feishu',
      sourceUrl: 'https://feishu.example/doc',
      targetUri: `viking://resources/${tenantId}/kb-1/imports/feishu/`,
      status,
      nodeCount: 0,
      vectorCount: 0,
      errorMsg: null,
      createdAt: new Date('2026-04-29T00:00:00.000Z'),
      updatedAt: new Date('2026-04-29T00:00:00.000Z'),
    }) as ImportTask;

  const createTenant = (
    tenantId: string,
    isolationLevel: TenantIsolationLevel,
    dbConfig: Tenant['dbConfig'] = null,
  ): Tenant =>
    ({
      id: `${tenantId}-record`,
      tenantId,
      displayName: tenantId,
      status: TenantStatus.ACTIVE,
      isolationLevel,
      dbConfig,
      vikingAccount: null,
      quota: null,
      ovConfig: null,
      description: null,
      createdAt: new Date('2026-04-29T00:00:00.000Z'),
      updatedAt: new Date('2026-04-29T00:00:00.000Z'),
      deletedAt: null,
    }) as unknown as Tenant;

  function createService(options: {
    defaultDataSource: Record<string, unknown>;
    dynamicDS?: Record<string, unknown>;
    settings?: Record<string, unknown>;
    encryption?: Record<string, unknown>;
    ovClient?: Record<string, unknown>;
    feishu?: Record<string, unknown>;
    dingtalk?: Record<string, unknown>;
    git?: Record<string, unknown>;
  }) {
    return new TaskWorkerService(
      options.defaultDataSource as never,
      (options.dynamicDS ?? { getTenantDataSource: jest.fn() }) as never,
      (options.settings ?? { resolveOVConfig: jest.fn() }) as never,
      (options.encryption ?? { decrypt: jest.fn((value) => value) }) as never,
      (options.ovClient ?? { request: jest.fn() }) as never,
      (options.feishu ?? { supports: jest.fn(), resolveConfig: jest.fn() }) as never,
      (options.dingtalk ?? { supports: jest.fn() }) as never,
      (options.git ?? { supports: jest.fn() }) as never,
    );
  }

  it('轮询时应分别扫描 SMALL 公共库、MEDIUM schema 和 LARGE 独立库', async () => {
    const smallTenant = createTenant('small-a', TenantIsolationLevel.SMALL);
    const mediumTenant = createTenant('test3', TenantIsolationLevel.MEDIUM);
    const largeTenant = createTenant('large-a', TenantIsolationLevel.LARGE, {
      host: '127.0.0.1',
      port: 5432,
      username: 'postgres',
      password: 'secret',
      database: 'tenant_large_a',
    });
    const tenantRepo = {
      find: jest.fn().mockResolvedValue([smallTenant, mediumTenant, largeTenant]),
    };
    const publicTaskRepo = {
      find: jest.fn().mockResolvedValue([createTask('small-task', 'small-a')]),
    };
    const publicIntegrationRepo = {};
    const mediumTaskRepo = {
      find: jest.fn().mockResolvedValue([createTask('medium-task', 'test3')]),
    };
    const mediumIntegrationRepo = {};
    const mediumQueryRunner = {
      isReleased: false,
      connect: jest.fn(),
      query: jest.fn(),
      release: jest.fn(),
      manager: {
        getRepository: jest.fn((entity) =>
          entity === ImportTask ? mediumTaskRepo : mediumIntegrationRepo,
        ),
      },
    };
    const largeTaskRepo = {
      find: jest.fn().mockResolvedValue([createTask('large-task', 'large-a')]),
    };
    const largeDataSource = {
      getRepository: jest.fn((entity) =>
        entity === ImportTask ? largeTaskRepo : {},
      ),
    };
    const defaultDataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === Tenant) return tenantRepo;
        if (entity === ImportTask) return publicTaskRepo;
        if (entity === Integration) return publicIntegrationRepo;
        throw new Error('unexpected repository');
      }),
      createQueryRunner: jest.fn(() => mediumQueryRunner),
    };
    const dynamicDS = {
      getTenantDataSource: jest.fn().mockResolvedValue(largeDataSource),
    };
    const service = createService({ defaultDataSource, dynamicDS });

    const tasks = await (
      service as unknown as {
        findTasksByStatus(status: TaskStatus): Promise<ImportTaskModel[]>;
      }
    ).findTasksByStatus(TaskStatus.PENDING);

    expect(tasks.map((task) => task.id)).toEqual([
      'small-task',
      'medium-task',
      'large-task',
    ]);
    expect(publicTaskRepo.find).toHaveBeenCalledWith({
      where: { tenantId: 'small-a', status: TaskStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
    expect(mediumQueryRunner.query).toHaveBeenCalledWith(
      'SET search_path TO "tenant_test3", public',
    );
    expect(mediumTaskRepo.find).toHaveBeenCalledWith({
      where: { tenantId: 'test3', status: TaskStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
    expect(mediumQueryRunner.release).toHaveBeenCalledTimes(1);
    expect(dynamicDS.getTenantDataSource).toHaveBeenCalledWith(
      'large-a',
      largeTenant.dbConfig,
    );
    expect(largeTaskRepo.find).toHaveBeenCalledWith({
      where: { tenantId: 'large-a', status: TaskStatus.PENDING },
      order: { createdAt: 'ASC' },
    });
  });

  it('处理任务时应在租户库内更新任务并读取集成凭证', async () => {
    const largeTenant = createTenant('large-a', TenantIsolationLevel.LARGE, {
      host: '127.0.0.1',
      port: 5432,
      username: 'postgres',
      password: 'secret',
      database: 'tenant_large_a',
    });
    const task = createTask('large-task', 'large-a');
    const tenantRepo = {
      findOne: jest.fn().mockResolvedValue(largeTenant),
    };
    const taskRepo = {
      update: jest.fn(),
    };
    const integrationRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'integration-1',
        tenantId: 'large-a',
        name: '飞书',
        type: IntegrationType.FEISHU,
        credentials: { appSecret: 'encrypted-secret' },
        config: { folderToken: 'folder-1' },
        active: true,
        createdAt: new Date('2026-04-29T00:00:00.000Z'),
        updatedAt: new Date('2026-04-29T00:00:00.000Z'),
      }),
    };
    const defaultDataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === Tenant) return tenantRepo;
        throw new Error('unexpected repository');
      }),
    };
    const largeDataSource = {
      getRepository: jest.fn((entity) =>
        entity === ImportTask ? taskRepo : integrationRepo,
      ),
    };
    const dynamicDS = {
      getTenantDataSource: jest.fn().mockResolvedValue(largeDataSource),
    };
    const settings = {
      resolveOVConfig: jest.fn().mockResolvedValue({
        baseUrl: 'http://ov.local',
        apiKey: 'ov-key',
        account: 'large-a',
      }),
    };
    const encryption = {
      decrypt: jest.fn((value: string) => `plain-${value}`),
    };
    const ovClient = {
      request: jest.fn().mockResolvedValue({ ok: true }),
    };
    const feishu = {
      supports: jest.fn((type) => type === IntegrationType.FEISHU),
      resolveConfig: jest.fn().mockResolvedValue({
        path: 'feishu://resolved',
        config: { appSecret: 'plain-encrypted-secret' },
      }),
    };
    const service = createService({
      defaultDataSource,
      dynamicDS,
      settings,
      encryption,
      ovClient,
      feishu,
    });

    await (
      service as unknown as {
        processTask(task: ImportTaskModel): Promise<void>;
      }
    ).processTask(task);

    expect(taskRepo.update).toHaveBeenNthCalledWith(1, 'large-task', {
      status: TaskStatus.RUNNING,
      updatedAt: expect.any(Date),
    });
    expect(integrationRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'integration-1', tenantId: 'large-a' },
    });
    expect(feishu.resolveConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        credentials: { appSecret: 'plain-encrypted-secret' },
      }),
      'https://feishu.example/doc',
    );
    expect(ovClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'large-a' }),
      '/api/v1/resources',
      'POST',
      expect.objectContaining({
        path: 'feishu://resolved',
        config: { appSecret: 'plain-encrypted-secret' },
      }),
    );
    expect(taskRepo.update).toHaveBeenNthCalledWith(2, 'large-task', {
      status: TaskStatus.DONE,
      updatedAt: expect.any(Date),
    });
  });
});
