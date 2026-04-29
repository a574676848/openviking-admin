import { ForbiddenException } from '@nestjs/common';
import { KnowledgeCapabilityGateway } from './knowledge-capability.gateway';
import type { Principal, TraceContext } from '../domain/capability.types';

describe('KnowledgeCapabilityGateway', () => {
  const ovKnowledgeGateway = {
    findKnowledge: jest.fn(),
    grepKnowledge: jest.fn(),
    listResources: jest.fn(),
    treeResources: jest.fn(),
  };
  const importTaskService = {
    create: jest.fn(),
    findOne: jest.fn(),
    findAll: jest.fn(),
    cancel: jest.fn(),
    retry: jest.fn(),
  };
  const knowledgeBaseService = {
    findAll: jest.fn(),
    findOne: jest.fn(),
  };
  const knowledgeTreeService = {
    findByKb: jest.fn(),
    findOne: jest.fn(),
  };
  const gateway = new KnowledgeCapabilityGateway(
    ovKnowledgeGateway as never,
    knowledgeBaseService as never,
    knowledgeTreeService as never,
    importTaskService as never,
  );

  const principal: Principal = {
    userId: 'user-1',
    tenantId: 'tenant-a',
    role: 'tenant_operator',
    scope: 'tenant',
    credentialType: 'jwt_access_token',
    clientType: 'service',
    ovConfig: {
      baseUrl: 'http://ov.local',
      apiKey: 'secret',
      account: 'default',
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should reject cross-tenant resource access', async () => {
    await expect(
      gateway.listResources(principal, {
        uri: 'viking://resources/tenants/tenant-b/',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('should call OV with tenant scoped uri', async () => {
    ovKnowledgeGateway.listResources.mockResolvedValue({
      result: [{ uri: 'viking://resources/tenants/tenant-a/doc-1', isDir: false }],
    });

    await gateway.listResources(principal, {
      uri: 'viking://resources/tenants/tenant-a/',
    }, {
      traceId: 'trace-1',
      spanId: 'span-1',
      requestId: 'request-1',
      tenantId: 'tenant-a',
      userId: 'user-1',
      channel: 'http',
      clientType: 'service',
      credentialType: 'jwt_access_token',
      capability: 'resources.list',
    } as TraceContext);

    expect(ovKnowledgeGateway.listResources).toHaveBeenCalledWith(
      expect.anything(),
      'viking://resources/tenants/tenant-a/',
      expect.objectContaining({
        traceId: 'trace-1',
        requestId: 'request-1',
      }),
    );
  });

  it('should call OV with tenant custom account and user from ovConfig', async () => {
    ovKnowledgeGateway.findKnowledge.mockResolvedValue({
      result: { resources: [] },
    });

    await gateway.search(
      {
        ...principal,
        ovConfig: {
          ...principal.ovConfig,
          account: 'tenant-custom-account',
          user: 'tenant-custom-user',
        },
      },
      { query: '面授课堂', limit: 10 },
    );

    expect(ovKnowledgeGateway.findKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        account: 'tenant-custom-account',
        user: 'tenant-custom-user',
      }),
      expect.anything(),
      undefined,
    );
  });
});
