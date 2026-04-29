import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenant/entities/tenant.entity';
import { User } from '../users/entities/user.entity';
import { SystemConfig } from '../settings/entities/system-config.entity';
import { CapabilityKey } from './entities/capability-key.entity';
import { CapabilitiesController } from './capabilities.controller';
import { CapabilityAuthController } from './capability-auth.controller';
import { CapabilityKeyController } from './capability-key.controller';
import { CapabilityObservabilityController } from './capability-observability.controller';
import { CapabilityCatalogService } from './application/capability-catalog.service';
import { CapabilityDiscoveryService } from './application/capability-discovery.service';
import { CapabilityAuthorizationService } from './application/capability-authorization.service';
import { CapabilityObservabilityService } from './application/capability-observability.service';
import { CapabilityExecutionService } from './application/capability-execution.service';
import { CapabilitySchemaValidatorService } from './application/capability-schema-validator.service';
import { CredentialExchangeService } from './application/credential-exchange.service';
import { CapabilityKeyService } from './capability-key.service';
import { CapabilityCredentialService } from './infrastructure/capability-credential.service';
import { CapabilityMetricsService } from './infrastructure/capability-metrics.service';
import { CapabilityPrometheusExporterService } from './infrastructure/capability-prometheus-exporter.service';
import { CapabilityRateLimitService } from './infrastructure/capability-rate-limit.service';
import {
  CAPABILITY_RATE_LIMIT_STORE,
  CAPABILITY_RATE_LIMIT_STORE_DRIVER,
  CAPABILITY_RATE_LIMIT_STORE_OPTIONS,
  type CapabilityRateLimitStoreOptions,
} from './infrastructure/capability-rate-limit.store';
import { InMemoryCapabilityRateLimitStore } from './infrastructure/in-memory-capability-rate-limit.store';
import { KnowledgeCapabilityGateway } from './infrastructure/knowledge-capability.gateway';
import { RedisCapabilityRateLimitStore } from './infrastructure/redis-capability-rate-limit.store';

const CAPABILITY_RATE_LIMIT_ENV = {
  DRIVER: 'CAPABILITY_RATE_LIMIT_STORE_DRIVER',
  REDIS_URL: 'CAPABILITY_RATE_LIMIT_REDIS_URL',
  REDIS_HOST: 'CAPABILITY_RATE_LIMIT_REDIS_HOST',
  REDIS_PORT: 'CAPABILITY_RATE_LIMIT_REDIS_PORT',
  REDIS_DB: 'CAPABILITY_RATE_LIMIT_REDIS_DB',
  REDIS_PASSWORD: 'CAPABILITY_RATE_LIMIT_REDIS_PASSWORD',
  REDIS_TLS: 'CAPABILITY_RATE_LIMIT_REDIS_TLS',
  REDIS_KEY_PREFIX: 'CAPABILITY_RATE_LIMIT_REDIS_KEY_PREFIX',
  REDIS_CONNECT_TIMEOUT_MS: 'CAPABILITY_RATE_LIMIT_REDIS_CONNECT_TIMEOUT_MS',
} as const;

@Module({
  imports: [
    TypeOrmModule.forFeature([CapabilityKey, Tenant, User, SystemConfig]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET')!,
      }),
    }),
  ],
  controllers: [
    CapabilitiesController,
    CapabilityAuthController,
    CapabilityKeyController,
    CapabilityObservabilityController,
  ],
  providers: [
    CapabilityCatalogService,
    CapabilityDiscoveryService,
    CapabilityAuthorizationService,
    CapabilityObservabilityService,
    CapabilitySchemaValidatorService,
    CapabilityExecutionService,
    CredentialExchangeService,
    CapabilityKeyService,
    CapabilityCredentialService,
    CapabilityMetricsService,
    CapabilityPrometheusExporterService,
    CapabilityRateLimitService,
    InMemoryCapabilityRateLimitStore,
    RedisCapabilityRateLimitStore,
    {
      provide: CAPABILITY_RATE_LIMIT_STORE_OPTIONS,
      inject: [ConfigService],
      useFactory: (config: ConfigService): CapabilityRateLimitStoreOptions => ({
        driver:
          config.get<string>(CAPABILITY_RATE_LIMIT_ENV.DRIVER)?.toLowerCase() ===
          CAPABILITY_RATE_LIMIT_STORE_DRIVER.REDIS
            ? CAPABILITY_RATE_LIMIT_STORE_DRIVER.REDIS
            : CAPABILITY_RATE_LIMIT_STORE_DRIVER.MEMORY,
        redisUrl: config.get<string>(CAPABILITY_RATE_LIMIT_ENV.REDIS_URL),
        redisHost: config.get<string>(
          CAPABILITY_RATE_LIMIT_ENV.REDIS_HOST,
          '127.0.0.1',
        )!,
        redisPort: Number(
          config.get<string>(CAPABILITY_RATE_LIMIT_ENV.REDIS_PORT, '6379'),
        ),
        redisDb: Number(
          config.get<string>(CAPABILITY_RATE_LIMIT_ENV.REDIS_DB, '0'),
        ),
        redisPassword: config.get<string>(CAPABILITY_RATE_LIMIT_ENV.REDIS_PASSWORD),
        redisTls:
          config.get<string>(CAPABILITY_RATE_LIMIT_ENV.REDIS_TLS, 'false') ===
          'true',
        redisKeyPrefix: config.get<string>(
          CAPABILITY_RATE_LIMIT_ENV.REDIS_KEY_PREFIX,
          'openviking:capability-rate-limit',
        )!,
        redisConnectTimeoutMs: Number(
          config.get<string>(
            CAPABILITY_RATE_LIMIT_ENV.REDIS_CONNECT_TIMEOUT_MS,
            '1500',
          ),
        ),
      }),
    },
    {
      provide: CAPABILITY_RATE_LIMIT_STORE,
      inject: [
        CAPABILITY_RATE_LIMIT_STORE_OPTIONS,
        InMemoryCapabilityRateLimitStore,
        RedisCapabilityRateLimitStore,
      ],
      useFactory: (
        options: CapabilityRateLimitStoreOptions,
        inMemoryStore: InMemoryCapabilityRateLimitStore,
        redisStore: RedisCapabilityRateLimitStore,
      ) =>
        options.driver === CAPABILITY_RATE_LIMIT_STORE_DRIVER.REDIS
          ? redisStore
          : inMemoryStore,
    },
    KnowledgeCapabilityGateway,
  ],
  exports: [
    CapabilityCatalogService,
    CapabilityDiscoveryService,
    CapabilityAuthorizationService,
    CapabilityObservabilityService,
    CapabilitySchemaValidatorService,
    CapabilityExecutionService,
    CredentialExchangeService,
    CapabilityCredentialService,
    CapabilityMetricsService,
    CapabilityPrometheusExporterService,
    CapabilityRateLimitService,
    CAPABILITY_RATE_LIMIT_STORE,
  ],
})
export class CapabilitiesModule {}
