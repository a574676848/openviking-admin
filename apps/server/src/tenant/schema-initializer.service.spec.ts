import { SchemaInitializerService } from './schema-initializer.service';
import { TenantIsolationLevel } from '../common/constants/system.enum';

describe('SchemaInitializerService', () => {
  it('medium 租户初始化时不应复制 search_logs 表', async () => {
    const query = jest.fn();
    const release = jest.fn();
    const connect = jest.fn();
    const queryRunner = {
      connect,
      query,
      release,
    };
    const mainDataSource = {
      createQueryRunner: jest.fn(() => queryRunner),
    };
    const dynamicDS = {
      getTenantDataSource: jest.fn(),
    };

    const service = new SchemaInitializerService(
      mainDataSource as never,
      dynamicDS as never,
    );

    await service.initialize({
      tenantId: 'tenant-a',
      isolationLevel: TenantIsolationLevel.MEDIUM,
    });

    const ddlSql = query.mock.calls
      .map(([sql]) => String(sql))
      .join('\n');

    expect(ddlSql).toContain('"knowledge_bases"');
    expect(ddlSql).toContain('"knowledge_nodes"');
    expect(ddlSql).toContain('"import_tasks"');
    expect(ddlSql).toContain('"integrations"');
    expect(ddlSql).not.toContain('"search_logs"');
    expect(release).toHaveBeenCalled();
  });
});
