import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CapabilityCatalogService } from './capability-catalog.service';
import { CapabilityAuthorizationService } from './capability-authorization.service';
import { CapabilityObservabilityService } from './capability-observability.service';
import { KnowledgeCapabilityGateway } from '../infrastructure/knowledge-capability.gateway';
import { CapabilityRateLimitService } from '../infrastructure/capability-rate-limit.service';
import { CapabilityRateLimitException } from '../infrastructure/capability-rate-limit.exception';
import { CapabilityTimeoutException } from '../infrastructure/capability-timeout.exception';
import {
  CapabilityContext,
  CapabilityId,
  CapabilityInvocationResult,
} from '../domain/capability.types';
import { getCapabilityRegistryEntry } from './capability-registry';
import { CapabilitySchemaValidatorService } from './capability-schema-validator.service';

const DEFAULT_CAPABILITY_TIMEOUT_MS = 30_000;
const IMPORT_CAPABILITY_TIMEOUT_MS = 120_000;
const DB_CAPABILITY_TIMEOUT_MS = 15_000;
const IN_MEMORY_CAPABILITY_TIMEOUT_MS = 10_000;

const LONG_RUNNING_CAPABILITIES: ReadonlySet<CapabilityId> = new Set([
  'documents.import.create',
  'documents.import.cancel',
  'documents.import.retry',
  'documents.index.rebuild',
]);

const DB_ONLY_CAPABILITIES: ReadonlySet<CapabilityId> = new Set([
  'knowledgeBases.list',
  'knowledgeBases.detail',
  'knowledgeBases.delete',
  'knowledgeTree.list',
  'knowledgeTree.detail',
  'knowledgeTree.delete',
  'documents.import.status',
  'documents.import.list',
  'documents.import.events',
  'documents.index.status',
]);

const IN_MEMORY_CAPABILITIES: ReadonlySet<CapabilityId> = new Set([
  'documents.draft.grep',
  'documents.extract.guide',
]);

function resolveCapabilityTimeoutMs(capabilityId: CapabilityId): number {
  if (LONG_RUNNING_CAPABILITIES.has(capabilityId)) {
    return IMPORT_CAPABILITY_TIMEOUT_MS;
  }
  if (DB_ONLY_CAPABILITIES.has(capabilityId)) {
    return DB_CAPABILITY_TIMEOUT_MS;
  }
  if (IN_MEMORY_CAPABILITIES.has(capabilityId)) {
    return IN_MEMORY_CAPABILITY_TIMEOUT_MS;
  }
  return DEFAULT_CAPABILITY_TIMEOUT_MS;
}

function timeoutAfter(ms: number, capabilityId: CapabilityId): Promise<never> {
  return new Promise((_resolve, reject) => {
    setTimeout(() => {
      reject(new CapabilityTimeoutException(capabilityId, ms));
    }, ms);
  });
}

@Injectable()
export class CapabilityExecutionService {
  private readonly logger = new Logger(CapabilityExecutionService.name);

  constructor(
    private readonly capabilityCatalogService: CapabilityCatalogService,
    private readonly capabilityAuthorizationService: CapabilityAuthorizationService,
    private readonly capabilityObservabilityService: CapabilityObservabilityService,
    private readonly capabilityRateLimitService: CapabilityRateLimitService,
    private readonly knowledgeCapabilityGateway: KnowledgeCapabilityGateway,
    private readonly capabilitySchemaValidator: CapabilitySchemaValidatorService,
  ) {}

  async execute(
    capabilityId: CapabilityId,
    input: Record<string, unknown>,
    context: CapabilityContext,
  ): Promise<CapabilityInvocationResult> {
    const registryEntry = getCapabilityRegistryEntry(capabilityId);
    const contract = registryEntry?.contract;

    if (!contract) {
      throw new NotFoundException(`未知 capability: ${capabilityId}`);
    }

    this.capabilityAuthorizationService.authorize(contract, context.principal);
    this.capabilitySchemaValidator.validateInput(contract, input);

    const startedAt = Date.now();

    try {
      await this.capabilityRateLimitService.assertAllowed(
        context.principal,
        capabilityId,
      );

      const gatewayHandler = registryEntry.gatewayHandler;
      const timeoutMs = resolveCapabilityTimeoutMs(capabilityId);
      const data = await Promise.race([
        this.knowledgeCapabilityGateway[gatewayHandler](
          context.principal,
          input,
          context.trace,
        ),
        timeoutAfter(timeoutMs, capabilityId),
      ]);
      this.capabilitySchemaValidator.validateOutput(contract, data);

      const result: CapabilityInvocationResult = {
        data,
        meta: {
          capability: capabilityId,
          channel: context.trace.channel,
          version: contract.version,
          durationMs: Date.now() - startedAt,
        },
        traceId: context.trace.traceId,
        error: null,
      };

      await this.capabilityObservabilityService.recordSuccess(
        context.trace,
        context.principal,
        result.meta,
      );

      return result;
    } catch (error) {
      if (error instanceof CapabilityRateLimitException) {
        await this.capabilityObservabilityService.recordRejected(
          context.trace,
          context.principal,
          error.message,
        );
        throw error;
      }

      try {
        await this.capabilityObservabilityService.recordFailure(
          context.trace,
          context.principal,
          error,
        );
      } catch (observabilityError) {
        this.logger.error(
          `capability.failure.record_failed traceId=${context.trace.traceId}: ${observabilityError instanceof Error ? observabilityError.message : '未知错误'}`,
        );
      }

      if (error instanceof Error) {
        throw error;
      }

      throw new InternalServerErrorException('capability 执行失败');
    }
  }
}
