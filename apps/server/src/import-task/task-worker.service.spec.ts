import { TaskWorkerService } from './task-worker.service';
import { ImportTask } from './entities/import-task.entity';
import { Integration } from '../tenant/entities/integration.entity';
import { Tenant } from '../tenant/entities/tenant.entity';
import { KnowledgeNode } from '../knowledge-tree/entities/knowledge-node.entity';
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
    ovConfigResolver?: Record<string, unknown>;
    encryption?: Record<string, unknown>;
    ovClient?: Record<string, unknown>;
    feishu?: Record<string, unknown>;
    dingtalk?: Record<string, unknown>;
    git?: Record<string, unknown>;
    localImportStorage?: Record<string, unknown>;
  }) {
    return new TaskWorkerService(
      options.defaultDataSource as never,
      (options.dynamicDS ?? { getTenantDataSource: jest.fn() }) as never,
      (options.ovConfigResolver ?? { resolve: jest.fn() }) as never,
      (options.encryption ?? { decrypt: jest.fn((value) => value) }) as never,
      (options.ovClient ?? {
        request: jest.fn(),
        uploadTempFile: jest.fn(),
      }) as never,
      (options.feishu ?? {
        supports: jest.fn(),
        resolveConfig: jest.fn(),
      }) as never,
      (options.dingtalk ?? { supports: jest.fn() }) as never,
      (options.git ?? { supports: jest.fn() }) as never,
      (options.localImportStorage ?? {
        readBySourceUrl: jest.fn(),
        shouldCleanupAfterDone: jest.fn(() => false),
        isManagedFileUrl: jest.fn(() => false),
        deleteBySourceUrl: jest.fn(),
      }) as never,
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
      find: jest
        .fn()
        .mockResolvedValue([smallTenant, mediumTenant, largeTenant]),
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
        if (entity === KnowledgeNode) return {};
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
    expect(mediumQueryRunner.query).toHaveBeenNthCalledWith(
      1,
      'SET search_path TO "tenant_test3", public',
    );
    expect(mediumQueryRunner.query).toHaveBeenNthCalledWith(
      2,
      'SET search_path TO public',
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

  it('轮询入口应吞掉单次轮询异常，避免未处理拒绝退出进程', async () => {
    const service = createService({
      defaultDataSource: { getRepository: jest.fn() },
    });
    const serviceWithInternals = service as unknown as {
      poll: () => Promise<void>;
      runPollSafely: () => void;
      logger: {
        error: jest.Mock;
        warn: jest.Mock;
        log: jest.Mock;
      };
    };
    serviceWithInternals.logger = {
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
    };
    jest
      .spyOn(serviceWithInternals, 'poll')
      .mockRejectedValue(new Error('Connection terminated unexpectedly'));

    serviceWithInternals.runPollSafely();
    await Promise.resolve();

    expect(serviceWithInternals.logger.error).toHaveBeenCalledWith(
      'Import task polling failed: Connection terminated unexpectedly',
    );
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
    const ovConfigResolver = {
      resolve: jest.fn().mockResolvedValue({
        baseUrl: 'http://ov.local',
        apiKey: 'ov-key',
        account: 'large-a',
        user: 'worker-user',
      }),
    };
    const encryption = {
      decrypt: jest.fn((value: string) => `plain-${value}`),
    };
    const ovClient = {
      request: jest.fn().mockResolvedValue({ ok: true }),
      uploadTempFile: jest.fn().mockResolvedValue({
        result: { temp_file_id: 'platform_feishu.md' },
      }),
    };
    const feishu = {
      supports: jest.fn((type) => type === IntegrationType.FEISHU),
      resolveConfig: jest.fn().mockResolvedValue({
        tempFile: {
          fileName: '飞书文档.md',
          buffer: Buffer.from('飞书正文'),
          mimeType: 'text/markdown;charset=utf-8',
        },
      }),
    };
    const service = createService({
      defaultDataSource,
      dynamicDS,
      ovConfigResolver,
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
    expect(tenantRepo.findOne).toHaveBeenCalledWith({
      where: [{ tenantId: 'large-a' }],
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
        temp_file_id: 'platform_feishu.md',
        to: 'viking://resources/tenants/large-a/kb-1/imports/feishu/',
        wait: false,
      }),
      { user: 'worker-user' },
    );
    expect(ovClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'large-a' }),
      '/api/v1/resources',
      'POST',
      expect.not.objectContaining({
        path: expect.anything(),
        config: expect.anything(),
        appSecret: expect.anything(),
      }),
      { user: 'worker-user' },
    );
    expect(ovClient.uploadTempFile).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'large-a' }),
      '/api/v1/resources/temp_upload',
      {
        fileName: '飞书文档.md',
        buffer: expect.any(Buffer),
        mimeType: 'text/markdown;charset=utf-8',
      },
      { user: 'worker-user' },
      { serviceLabel: 'OpenViking Resources' },
    );
    expect(taskRepo.update).toHaveBeenNthCalledWith(2, 'large-task', {
      status: TaskStatus.DONE,
      updatedAt: expect.any(Date),
    });
  });

  it('本地上传任务成功后应按配置清理托管文件', async () => {
    const tenant = createTenant('small-a', TenantIsolationLevel.SMALL);
    const task = {
      ...createTask('local-task', 'small-a'),
      integrationId: '',
      sourceType: 'local',
      sourceUrl: 'file:///data/openviking/imports/manual.md',
      targetUri: 'viking://resources/small-a/kb-1/imports/local/',
    } as ImportTaskModel;
    const tenantRepo = {
      findOne: jest.fn().mockResolvedValue(tenant),
    };
    const taskRepo = {
      update: jest.fn(),
    };
    const defaultDataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === Tenant) return tenantRepo;
        if (entity === ImportTask) return taskRepo;
        return {};
      }),
    };
    const ovConfigResolver = {
      resolve: jest.fn().mockResolvedValue({
        baseUrl: 'http://ov.local',
        apiKey: 'ov-key',
        account: 'small-a',
        user: 'worker-user',
      }),
    };
    const ovClient = {
      request: jest
        .fn()
        .mockResolvedValueOnce({ ok: true })
        .mockResolvedValueOnce({
          result: { children_count: 1, descendant_count: 2 },
        })
        .mockResolvedValueOnce({ result: { count: 5 } }),
      uploadTempFile: jest.fn().mockResolvedValue({
        result: { temp_file_id: 'upload_manual.md' },
      }),
    };
    const localImportStorage = {
      readBySourceUrl: jest.fn().mockResolvedValue({
        fileName: 'manual.md',
        buffer: Buffer.from('manual'),
        mimeType: null,
      }),
      shouldCleanupAfterDone: jest.fn(() => true),
      isManagedFileUrl: jest.fn(() => true),
      deleteBySourceUrl: jest.fn(),
    };
    const service = createService({
      defaultDataSource,
      ovConfigResolver,
      ovClient,
      localImportStorage,
    });

    await (
      service as unknown as {
        processTask(task: ImportTaskModel): Promise<void>;
      }
    ).processTask(task);

    expect(localImportStorage.readBySourceUrl).toHaveBeenCalledWith(
      'file:///data/openviking/imports/manual.md',
    );
    expect(ovClient.uploadTempFile).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'small-a' }),
      '/api/v1/resources/temp_upload',
      {
        fileName: 'manual.md',
        buffer: expect.any(Buffer),
        mimeType: null,
      },
      { user: 'worker-user' },
      { serviceLabel: 'OpenViking Resources' },
    );
    expect(ovClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'small-a' }),
      '/api/v1/resources',
      'POST',
      {
        temp_file_id: 'upload_manual.md',
        to: 'viking://resources/tenants/small-a/kb-1/imports/local/',
        reason: 'Queue Task: local-task',
        wait: true,
      },
      { user: 'worker-user' },
    );
    expect(ovClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'small-a' }),
      expect.stringContaining('/api/v1/fs/stat'),
      'GET',
      undefined,
      { user: 'worker-user' },
    );
    expect(ovClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'small-a' }),
      expect.stringContaining('/api/v1/debug/vector/count'),
      'GET',
      undefined,
      { user: 'worker-user' },
    );
    expect(taskRepo.update).toHaveBeenNthCalledWith(2, 'local-task', {
      status: TaskStatus.DONE,
      nodeCount: 3,
      vectorCount: 5,
      updatedAt: expect.any(Date),
    });
    expect(localImportStorage.deleteBySourceUrl).toHaveBeenCalledWith(
      'file:///data/openviking/imports/manual.md',
    );
  });

  it('OpenViking 返回业务失败时应标记任务失败', async () => {
    const tenant = createTenant('test3', TenantIsolationLevel.SMALL);
    const task = {
      ...createTask('failed-inject-task', 'test3'),
      integrationId: '',
      sourceType: 'url',
      sourceUrl: 'https://docs.example.com/page',
      targetUri: 'viking://resources/tenants/test3/kb-1/imports/url/',
    } as ImportTaskModel;
    const tenantRepo = {
      findOne: jest.fn().mockResolvedValue(tenant),
    };
    const taskRepo = {
      update: jest.fn(),
    };
    const defaultDataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === Tenant) return tenantRepo;
        if (entity === ImportTask) return taskRepo;
        return {};
      }),
    };
    const ovConfigResolver = {
      resolve: jest.fn().mockResolvedValue({
        baseUrl: 'http://ov.local',
        apiKey: 'ov-key',
        account: 'test3',
        user: 'worker-user',
      }),
    };
    const ovClient = {
      request: jest.fn().mockResolvedValue({
        result: { status: 'error', errors: ['Parse error: git clone failed'] },
      }),
    };
    const service = createService({
      defaultDataSource,
      ovConfigResolver,
      ovClient,
    });

    await (
      service as unknown as {
        processTask(task: ImportTaskModel): Promise<void>;
      }
    ).processTask(task);

    expect(taskRepo.update).toHaveBeenNthCalledWith(2, 'failed-inject-task', {
      status: TaskStatus.FAILED,
      nodeCount: 0,
      vectorCount: 0,
      errorMsg: 'Parse error: git clone failed',
      updatedAt: expect.any(Date),
    });
  });

  it('Git 平台任务不应向 OpenViking 资源接口发送额外 config', async () => {
    const tenant = createTenant('test3', TenantIsolationLevel.MEDIUM);
    const task = {
      ...createTask('git-task', 'test3'),
      sourceType: 'git',
      sourceUrl: 'https://git.example.com/org/repo',
      targetUri: 'viking://resources/tenants/test3/kb-1/imports/git/',
    } as ImportTaskModel;
    const tenantRepo = {
      findOne: jest.fn().mockResolvedValue(tenant),
    };
    const taskRepo = {
      update: jest.fn(),
    };
    const integrationRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'integration-1',
        tenantId: 'test3',
        name: 'GitLab',
        type: IntegrationType.GITLAB,
        credentials: { token: 'encrypted-token' },
        config: null,
        active: true,
        createdAt: new Date('2026-04-29T00:00:00.000Z'),
        updatedAt: new Date('2026-04-29T00:00:00.000Z'),
      }),
    };
    const queryRunner = {
      isReleased: false,
      connect: jest.fn(),
      query: jest.fn(),
      release: jest.fn(),
      manager: {
        getRepository: jest.fn((entity) =>
          entity === ImportTask ? taskRepo : integrationRepo,
        ),
      },
    };
    const defaultDataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === Tenant) return tenantRepo;
        throw new Error('unexpected repository');
      }),
      createQueryRunner: jest.fn(() => queryRunner),
    };
    const ovConfigResolver = {
      resolve: jest.fn().mockResolvedValue({
        baseUrl: 'http://ov.local',
        apiKey: 'ov-key',
        account: 'test3',
        user: 'worker-user',
      }),
    };
    const ovClient = {
      request: jest.fn()
        .mockRejectedValueOnce(new Error('clone failed'))
        .mockResolvedValueOnce({ ok: true }),
    };
    const git = {
      supports: jest.fn((type) => type === IntegrationType.GITLAB),
      resolveConfig: jest.fn().mockResolvedValue({
        path: 'https://plain-token@git.example.com/org/repo',
        fallbackPaths: ['http://oauth2:plain-token@git.example.com/org/repo'],
      }),
    };
    const service = createService({
      defaultDataSource,
      ovConfigResolver,
      ovClient,
      git,
    });

    await (
      service as unknown as {
        processTask(task: ImportTaskModel): Promise<void>;
      }
    ).processTask(task);

    expect(ovClient.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ account: 'test3' }),
      '/api/v1/resources',
      'POST',
      expect.objectContaining({
        path: 'https://plain-token@git.example.com/org/repo',
        to: 'viking://resources/tenants/test3/kb-1/imports/git/',
      }),
      { user: 'worker-user' },
    );
    expect(ovClient.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ account: 'test3' }),
      '/api/v1/resources',
      'POST',
      expect.objectContaining({
        path: 'http://oauth2:plain-token@git.example.com/org/repo',
        to: 'viking://resources/tenants/test3/kb-1/imports/git/',
      }),
      { user: 'worker-user' },
    );
    const resourceInjectCalls = ovClient.request.mock.calls.filter(
      ([, path, method]) => path === '/api/v1/resources' && method === 'POST',
    );
    expect(resourceInjectCalls).toHaveLength(2);
    expect(ovClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'test3' }),
      '/api/v1/resources',
      'POST',
      expect.not.objectContaining({ fallback_paths: expect.anything() }),
      { user: 'worker-user' },
    );
    expect(ovClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'test3' }),
      '/api/v1/resources',
      'POST',
      expect.not.objectContaining({ config: expect.anything() }),
      { user: 'worker-user' },
    );
  });

  it('OpenViking 返回注入失败时应继续尝试 Git fallback path', async () => {
    const tenant = createTenant('test3', TenantIsolationLevel.MEDIUM);
    const task = {
      ...createTask('git-fallback-task', 'test3'),
      sourceType: 'git',
      sourceUrl: 'https://git.exexm.com/epaas-product/exe-cloud-business-center',
      targetUri: 'viking://resources/tenants/test3/kb-1/imports/git/',
    } as ImportTaskModel;
    const tenantRepo = {
      findOne: jest.fn().mockResolvedValue(tenant),
    };
    const taskRepo = {
      update: jest.fn(),
    };
    const integrationRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'integration-1',
        tenantId: 'test3',
        name: 'GitLab',
        type: IntegrationType.GITLAB,
        credentials: { token: 'encrypted-token' },
        config: null,
        active: true,
        createdAt: new Date('2026-04-29T00:00:00.000Z'),
        updatedAt: new Date('2026-04-29T00:00:00.000Z'),
      }),
    };
    const queryRunner = {
      isReleased: false,
      connect: jest.fn(),
      query: jest.fn(),
      release: jest.fn(),
      manager: {
        getRepository: jest.fn((entity) =>
          entity === ImportTask ? taskRepo : integrationRepo,
        ),
      },
    };
    const defaultDataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === Tenant) return tenantRepo;
        throw new Error('unexpected repository');
      }),
      createQueryRunner: jest.fn(() => queryRunner),
    };
    const ovConfigResolver = {
      resolve: jest.fn().mockResolvedValue({
        baseUrl: 'http://ov.local',
        apiKey: 'ov-key',
        account: 'test3',
        user: 'worker-user',
      }),
    };
    const ovClient = {
      request: jest.fn()
        .mockResolvedValueOnce({
          result: {
            status: 'error',
            errors: ['Parse error: Git command failed'],
          },
        })
        .mockResolvedValueOnce({ ok: true }),
    };
    const git = {
      supports: jest.fn((type) => type === IntegrationType.GITLAB),
      resolveConfig: jest.fn().mockResolvedValue({
        path: 'https://plain-token@git.exexm.com/epaas-product/exe-cloud-business-center',
        fallbackPaths: [
          'http://oauth2:plain-token@git.exexm.com/epaas-product/exe-cloud-business-center',
        ],
      }),
    };
    const service = createService({
      defaultDataSource,
      ovConfigResolver,
      ovClient,
      git,
    });

    await (
      service as unknown as {
        processTask(task: ImportTaskModel): Promise<void>;
      }
    ).processTask(task);

    expect(ovClient.request).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ account: 'test3' }),
      '/api/v1/resources',
      'POST',
      expect.objectContaining({
        path: 'https://plain-token@git.exexm.com/epaas-product/exe-cloud-business-center',
      }),
      { user: 'worker-user' },
    );
    expect(ovClient.request).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ account: 'test3' }),
      '/api/v1/resources',
      'POST',
      expect.objectContaining({
        path: 'http://oauth2:plain-token@git.exexm.com/epaas-product/exe-cloud-business-center',
      }),
      { user: 'worker-user' },
    );
  });

  it('网页提取任务应直接把 URL 注入 OpenViking 资源接口', async () => {
    const tenant = createTenant('small-a', TenantIsolationLevel.SMALL);
    const task = {
      ...createTask('url-task', 'small-a'),
      integrationId: '',
      sourceType: 'url',
      sourceUrl: 'https://docs.example.com/page',
      targetUri: 'viking://resources/small-a/kb-1/imports/url/',
    } as ImportTaskModel;
    const tenantRepo = {
      findOne: jest.fn().mockResolvedValue(tenant),
    };
    const taskRepo = {
      update: jest.fn(),
    };
    const defaultDataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === Tenant) return tenantRepo;
        if (entity === ImportTask) return taskRepo;
        return {};
      }),
    };
    const ovConfigResolver = {
      resolve: jest.fn().mockResolvedValue({
        baseUrl: 'http://ov.local',
        apiKey: 'ov-key',
        account: 'small-a',
        user: 'worker-user',
      }),
    };
    const ovClient = {
      request: jest.fn().mockResolvedValue({ ok: true }),
    };
    const service = createService({
      defaultDataSource,
      ovConfigResolver,
      ovClient,
    });

    await (
      service as unknown as {
        processTask(task: ImportTaskModel): Promise<void>;
      }
    ).processTask(task);

    expect(ovClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'small-a' }),
      '/api/v1/resources',
      'POST',
      expect.objectContaining({
        path: 'https://docs.example.com/page',
        to: 'viking://resources/tenants/small-a/kb-1/imports/url/',
      }),
      { user: 'worker-user' },
    );
  });

  it('已是引擎租户命名空间的 targetUri 不应重复追加 tenants 前缀', async () => {
    const tenant = createTenant('test3', TenantIsolationLevel.SMALL);
    const task = {
      ...createTask('tenant-uri-task', 'test3'),
      integrationId: '',
      sourceType: 'url',
      sourceUrl: 'https://docs.example.com/page',
      targetUri: 'viking://resources/tenants/test3/kb-1/imports/url/',
    } as ImportTaskModel;
    const tenantRepo = {
      findOne: jest.fn().mockResolvedValue(tenant),
    };
    const taskRepo = {
      update: jest.fn(),
    };
    const defaultDataSource = {
      getRepository: jest.fn((entity) => {
        if (entity === Tenant) return tenantRepo;
        if (entity === ImportTask) return taskRepo;
        return {};
      }),
    };
    const ovConfigResolver = {
      resolve: jest.fn().mockResolvedValue({
        baseUrl: 'http://ov.local',
        apiKey: 'ov-key',
        account: 'test3',
        user: 'worker-user',
      }),
    };
    const ovClient = {
      request: jest.fn().mockResolvedValue({ ok: true }),
    };
    const service = createService({
      defaultDataSource,
      ovConfigResolver,
      ovClient,
    });

    await (
      service as unknown as {
        processTask(task: ImportTaskModel): Promise<void>;
      }
    ).processTask(task);

    expect(ovClient.request).toHaveBeenCalledWith(
      expect.objectContaining({ account: 'test3' }),
      '/api/v1/resources',
      'POST',
      expect.objectContaining({
        to: 'viking://resources/tenants/test3/kb-1/imports/url/',
      }),
      { user: 'worker-user' },
    );
  });
});
