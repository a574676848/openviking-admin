import { ForbiddenException } from '@nestjs/common';
import { CapabilityAuthorizationService } from './capability-authorization.service';

describe('CapabilityAuthorizationService', () => {
  const service = new CapabilityAuthorizationService();

  it('should reject tenant capability without tenant context', () => {
    expect(() =>
      service.authorize(
        {
          id: 'knowledge.search',
          version: 'v1',
          displayName: 'Knowledge Search',
          description: 'search',
          inputSchema: { type: 'object', properties: {} },
          outputSchema: { type: 'object', properties: {} },
          permissionRequirement: 'tenant',
          minimumRole: 'tenant_viewer',
          auditLevel: 'standard',
          http: { method: 'POST', path: '/api/knowledge/search' },
          cli: { command: 'ova knowledge search' },
        },
        {
          userId: 'user-1',
          tenantId: null,
          role: 'tenant_viewer',
          scope: 'platform',
          credentialType: 'jwt_access_token',
          clientType: 'service',
          ovConfig: {
            baseUrl: 'http://ov.local',
            apiKey: 'secret',
            account: 'default',
          },
        },
      ),
    ).toThrow(ForbiddenException);
  });

  it('should reject principals below the minimum role', () => {
    expect(() =>
      service.authorize(
        {
          id: 'resources.tree',
          version: 'v1',
          displayName: 'Resources Tree',
          description: 'tree',
          inputSchema: { type: 'object', properties: {} },
          outputSchema: { type: 'object', properties: {} },
          permissionRequirement: 'tenant',
          minimumRole: 'tenant_operator',
          auditLevel: 'standard',
          http: { method: 'GET', path: '/api/resources/tree' },
          cli: { command: 'ova resources tree' },
        },
        {
          userId: 'user-1',
          tenantId: 'tenant-1',
          role: 'tenant_viewer',
          scope: 'tenant',
          credentialType: 'jwt_access_token',
          clientType: 'service',
          ovConfig: {
            baseUrl: 'http://ov.local',
            apiKey: 'secret',
            account: 'default',
          },
        },
      ),
    ).toThrow('tenant_operator');
  });
});
