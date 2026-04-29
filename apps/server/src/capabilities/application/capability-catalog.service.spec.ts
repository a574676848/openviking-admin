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
        expect.objectContaining({ id: 'knowledgeBases.list' }),
        expect.objectContaining({ id: 'knowledgeTree.list' }),
        expect.objectContaining({ id: 'documents.import.create' }),
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
      'knowledgeBases.list': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.listKnowledgeBases,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.listKnowledgeBases,
        ),
      },
      'knowledgeBases.detail': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.getKnowledgeBaseDetail,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.getKnowledgeBaseDetail,
        ),
      },
      'knowledgeTree.list': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.listKnowledgeTree,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.listKnowledgeTree,
        ),
      },
      'knowledgeTree.detail': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.getKnowledgeTreeDetail,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.getKnowledgeTreeDetail,
        ),
      },
      'documents.import.create': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.createDocumentImport,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.createDocumentImport,
        ),
      },
      'documents.import.status': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.getDocumentImportStatus,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.getDocumentImportStatus,
        ),
      },
      'documents.import.list': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.listDocumentImports,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.listDocumentImports,
        ),
      },
      'documents.import.cancel': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.cancelDocumentImport,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.cancelDocumentImport,
        ),
      },
      'documents.import.retry': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.retryDocumentImport,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.retryDocumentImport,
        ),
      },
      'documents.import.events': {
        path: Reflect.getMetadata(
          PATH_METADATA,
          CapabilitiesController.prototype.watchDocumentImportEvents,
        ),
        method: Reflect.getMetadata(
          METHOD_METADATA,
          CapabilitiesController.prototype.watchDocumentImportEvents,
        ),
      },
    };

    expect(toolNames).toEqual(contracts.map((contract) => contract.id).sort());

    for (const contract of contracts) {
      const controllerRoute = controllerRoutes[contract.id];
      const expectedHttpMethod =
        contract.http.method === 'POST' ? RequestMethod.POST : RequestMethod.GET;

      expect(controllerRoute).toEqual(
        expect.objectContaining({
          path: contract.http.path.replace('/api/v1/', ''),
          method: expectedHttpMethod,
        }),
      );
      expect(contract.cli.command.startsWith('ova ')).toBe(true);
    }
  });
});
