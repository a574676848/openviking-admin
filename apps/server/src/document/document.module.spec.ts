import { MODULE_METADATA } from '@nestjs/common/constants';
import { AuditModule } from '../audit/audit.module';
import { AppModule } from '../app.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { KnowledgeTreeModule } from '../knowledge-tree/knowledge-tree.module';
import { SettingsModule } from '../settings/settings.module';
import { TenantModule } from '../tenant/tenant.module';
import { DocumentContentCodec } from './document-content-codec';
import { DocumentCollabGateway } from './document-collab.gateway';
import { DocumentController } from './document.controller';
import { DOCUMENT_ASSET_DEDUP_STORE } from './document-asset-dedup.store';
import { DocumentModule } from './document.module';
import { DocumentService } from './document.service';

function getMetadata<T>(target: object, key: string): T[] {
  return Reflect.getMetadata(key, target) ?? [];
}

describe('DocumentModule', () => {
  it('应该声明文档 REST 组件和依赖模块', () => {
    expect(getMetadata(DocumentModule, MODULE_METADATA.IMPORTS)).toEqual(
      expect.arrayContaining([
        CommonModule,
        KnowledgeTreeModule,
        SettingsModule,
        AuditModule,
        AuthModule,
        TenantModule,
      ]),
    );
    expect(getMetadata(DocumentModule, MODULE_METADATA.CONTROLLERS)).toContain(
      DocumentController,
    );
    expect(getMetadata(DocumentModule, MODULE_METADATA.PROVIDERS)).toEqual(
      expect.arrayContaining([
        DocumentService,
        DocumentContentCodec,
        DocumentCollabGateway,
        expect.objectContaining({
          provide: DOCUMENT_ASSET_DEDUP_STORE,
        }),
      ]),
    );
  });

  it('应该导出 P3 协作网关可复用的服务能力', () => {
    expect(getMetadata(DocumentModule, MODULE_METADATA.EXPORTS)).toEqual(
      expect.arrayContaining([DocumentService, DocumentContentCodec]),
    );
  });

  it('应该注册到 AppModule 成为运行时入口', () => {
    expect(getMetadata(AppModule, MODULE_METADATA.IMPORTS)).toContain(
      DocumentModule,
    );
  });
});
