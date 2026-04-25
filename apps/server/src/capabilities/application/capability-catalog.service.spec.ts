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
});
