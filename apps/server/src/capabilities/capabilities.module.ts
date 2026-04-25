import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenant/entities/tenant.entity';
import { SystemConfig } from '../settings/entities/system-config.entity';
import { CapabilityKey } from './entities/capability-key.entity';
import { CapabilitiesController } from './capabilities.controller';
import { CapabilityAuthController } from './capability-auth.controller';
import { CapabilityObservabilityController } from './capability-observability.controller';
import { CapabilityCatalogService } from './application/capability-catalog.service';
import { CapabilityDiscoveryService } from './application/capability-discovery.service';
import { CapabilityAuthorizationService } from './application/capability-authorization.service';
import { CapabilityObservabilityService } from './application/capability-observability.service';
import { CapabilityExecutionService } from './application/capability-execution.service';
import { CredentialExchangeService } from './application/credential-exchange.service';
import { CapabilityCredentialService } from './infrastructure/capability-credential.service';
import { CapabilityMetricsService } from './infrastructure/capability-metrics.service';
import { CapabilityPrometheusExporterService } from './infrastructure/capability-prometheus-exporter.service';
import { CapabilityRateLimitService } from './infrastructure/capability-rate-limit.service';
import { CAPABILITY_RATE_LIMIT_STORE } from './infrastructure/capability-rate-limit.store';
import { InMemoryCapabilityRateLimitStore } from './infrastructure/in-memory-capability-rate-limit.store';
import { KnowledgeCapabilityGateway } from './infrastructure/knowledge-capability.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([CapabilityKey, Tenant, SystemConfig]),
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
    CapabilityObservabilityController,
  ],
  providers: [
    CapabilityCatalogService,
    CapabilityDiscoveryService,
    CapabilityAuthorizationService,
    CapabilityObservabilityService,
    CapabilityExecutionService,
    CredentialExchangeService,
    CapabilityCredentialService,
    CapabilityMetricsService,
    CapabilityPrometheusExporterService,
    CapabilityRateLimitService,
    InMemoryCapabilityRateLimitStore,
    {
      provide: CAPABILITY_RATE_LIMIT_STORE,
      useExisting: InMemoryCapabilityRateLimitStore,
    },
    KnowledgeCapabilityGateway,
  ],
  exports: [
    CapabilityCatalogService,
    CapabilityDiscoveryService,
    CapabilityAuthorizationService,
    CapabilityObservabilityService,
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
