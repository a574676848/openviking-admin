import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CommonModule } from '../common/common.module';
import { KnowledgeTreeModule } from '../knowledge-tree/knowledge-tree.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { SettingsModule } from '../settings/settings.module';
import { TenantModule } from '../tenant/tenant.module';
import { DOCUMENT_ASSET_DEDUP_CACHE_TTL_SECONDS } from './constants';
import { DocumentContentCodec } from './document-content-codec';
import { DocumentCollabGateway } from './document-collab.gateway';
import { DocumentController } from './document.controller';
import { DocumentDraftRepository } from './document-draft.repository';
import { DocumentDraft } from './entities/document-draft.entity';
import {
  DOCUMENT_ASSET_DEDUP_STORE,
  DOCUMENT_ASSET_DEDUP_STORE_DRIVER,
  DOCUMENT_ASSET_DEDUP_STORE_OPTIONS,
  type DocumentAssetDedupStoreOptions,
} from './document-asset-dedup.store';
import { DocumentService } from './document.service';
import { InMemoryDocumentAssetDedupStore } from './in-memory-document-asset-dedup.store';
import { RedisDocumentAssetDedupStore } from './redis-document-asset-dedup.store';

const DOCUMENT_ASSET_DEDUP_ENV = {
  DRIVER: 'DOCUMENT_ASSET_DEDUP_STORE_DRIVER',
  REDIS_URL: 'DOCUMENT_ASSET_DEDUP_REDIS_URL',
  REDIS_HOST: 'DOCUMENT_ASSET_DEDUP_REDIS_HOST',
  REDIS_PORT: 'DOCUMENT_ASSET_DEDUP_REDIS_PORT',
  REDIS_DB: 'DOCUMENT_ASSET_DEDUP_REDIS_DB',
  REDIS_PASSWORD: 'DOCUMENT_ASSET_DEDUP_REDIS_PASSWORD',
  REDIS_TLS: 'DOCUMENT_ASSET_DEDUP_REDIS_TLS',
  REDIS_KEY_PREFIX: 'DOCUMENT_ASSET_DEDUP_REDIS_KEY_PREFIX',
  REDIS_CONNECT_TIMEOUT_MS: 'DOCUMENT_ASSET_DEDUP_REDIS_CONNECT_TIMEOUT_MS',
  TTL_SECONDS: 'DOCUMENT_ASSET_DEDUP_CACHE_TTL_SECONDS',
} as const;

@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentDraft]),
    CommonModule,
    KnowledgeTreeModule,
    KnowledgeBaseModule,
    SettingsModule,
    AuditModule,
    AuthModule,
    TenantModule,
  ],
  controllers: [DocumentController],
  providers: [
    DocumentService,
    DocumentDraftRepository,
    DocumentContentCodec,
    DocumentCollabGateway,
    InMemoryDocumentAssetDedupStore,
    RedisDocumentAssetDedupStore,
    {
      provide: DOCUMENT_ASSET_DEDUP_STORE_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): DocumentAssetDedupStoreOptions => ({
        driver:
          config.get<string>(DOCUMENT_ASSET_DEDUP_ENV.DRIVER)?.toLowerCase() ===
          DOCUMENT_ASSET_DEDUP_STORE_DRIVER.REDIS
            ? DOCUMENT_ASSET_DEDUP_STORE_DRIVER.REDIS
            : DOCUMENT_ASSET_DEDUP_STORE_DRIVER.MEMORY,
        redisUrl:
          config.get<string>(DOCUMENT_ASSET_DEDUP_ENV.REDIS_URL) ??
          config.get<string>('CAPABILITY_RATE_LIMIT_REDIS_URL'),
        redisHost:
          config.get<string>(DOCUMENT_ASSET_DEDUP_ENV.REDIS_HOST) ??
          config.get<string>('CAPABILITY_RATE_LIMIT_REDIS_HOST', '127.0.0.1'),
        redisPort: Number(
          config.get<string>(DOCUMENT_ASSET_DEDUP_ENV.REDIS_PORT) ??
            config.get<string>('CAPABILITY_RATE_LIMIT_REDIS_PORT', '6379'),
        ),
        redisDb: Number(
          config.get<string>(DOCUMENT_ASSET_DEDUP_ENV.REDIS_DB) ??
            config.get<string>('CAPABILITY_RATE_LIMIT_REDIS_DB', '0'),
        ),
        redisPassword:
          config.get<string>(DOCUMENT_ASSET_DEDUP_ENV.REDIS_PASSWORD) ??
          config.get<string>('CAPABILITY_RATE_LIMIT_REDIS_PASSWORD'),
        redisTls:
          (config.get<string>(DOCUMENT_ASSET_DEDUP_ENV.REDIS_TLS) ??
            config.get<string>('CAPABILITY_RATE_LIMIT_REDIS_TLS', 'false')) ===
          'true',
        redisKeyPrefix:
          config.get<string>(DOCUMENT_ASSET_DEDUP_ENV.REDIS_KEY_PREFIX) ??
          'openviking:document-asset-dedup',
        redisConnectTimeoutMs: Number(
          config.get<string>(
            DOCUMENT_ASSET_DEDUP_ENV.REDIS_CONNECT_TIMEOUT_MS,
          ) ??
            config.get<string>(
              'CAPABILITY_RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS',
              '1500',
            ),
        ),
        ttlSeconds: Number(
          config.get<string>(
            DOCUMENT_ASSET_DEDUP_ENV.TTL_SECONDS,
            String(DOCUMENT_ASSET_DEDUP_CACHE_TTL_SECONDS),
          ),
        ),
      }),
    },
    {
      provide: DOCUMENT_ASSET_DEDUP_STORE,
      inject: [
        DOCUMENT_ASSET_DEDUP_STORE_OPTIONS,
        InMemoryDocumentAssetDedupStore,
        RedisDocumentAssetDedupStore,
      ],
      useFactory: (
        options: DocumentAssetDedupStoreOptions,
        inMemoryStore: InMemoryDocumentAssetDedupStore,
        redisStore: RedisDocumentAssetDedupStore,
      ) =>
        options.driver === DOCUMENT_ASSET_DEDUP_STORE_DRIVER.REDIS
          ? redisStore
          : inMemoryStore,
    },
  ],
  exports: [DocumentService, DocumentContentCodec, DocumentDraftRepository],
})
export class DocumentModule {}
