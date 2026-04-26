import { RequestMethod } from '@nestjs/common';
import {
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { CapabilitiesController } from '../capabilities.controller';
import { CapabilityCatalogService } from './capability-catalog.service';

describe('CapabilityCatalogService', () => {
  it('should expose flattened capability contracts', () => {
    const service = new CapabilityCatalogService();
    const capabilities = service.listCapabilities();

    expect(capabilities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'knowledge.search' }),
        expect.objectContaining({ id: 'knowledge.grep' }),
        expect.objectContaining({ id: 'resources.list' }),
        expect.objectContaining({ id: 'resources.tree' }),
      ]),
    );
  });

  it('should build MCP tools from capability contracts', () => {
    const service = new CapabilityCatalogService();
    expect(service.toMcpTools()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'knowledge.search' }),
        expect.objectContaining({ name: 'resources.tree' }),
      ]),
    );
  });

  it('should keep catalog, HTTP route, CLI command and MCP tool names aligned', () => {
    const service = new CapabilityCatalogService();
    const contracts = service.listCapabilities();
    const toolNames = service.toMcpTools().map((tool) => tool.name).sort();
    const controllerRoutes = {
      'knowledge.search': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.search,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.search,
        ),
      },
      'knowledge.grep': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.grep,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.grep,
        ),
      },
      'resources.list': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.listResources,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.listResources,
        ),
      },
      'resources.tree': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.treeResources,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.treeResources,
        ),
      },
    };

    expect(toolNames).toEqual(contracts.map((contract) => contract.id).sort());

    for (const contract of contracts) {
      const [scope, action] = contract.id.split('.');
      const expectedCliCommand = `ova ${scope} ${action}`;
      const controllerRoute = controllerRoutes[contract.id];
      const expectedHttpPath =
        contract.id === 'resources.list'
          ? '/api/v1/resources'
          : `/api/v1/${scope}/${action}`;
      const expectedHttpMethod =
        scope === 'knowledge' ? RequestMethod.POST : RequestMethod.GET;

      expect(contract.cli.command).toBe(expectedCliCommand);
      expect(controllerRoute).toEqual(
        expect.objectContaining({
          path: contract.http.path.replace('/api/v1/', ''),
          method: expectedHttpMethod,
        }),
      );
      expect(contract.http.path).toBe(expectedHttpPath);
      expect(contract.http.method).toBe(
        expectedHttpMethod === RequestMethod.POST ? 'POST' : 'GET',
      );
    }
  });
});
