import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CapabilityCatalogService } from './capability-catalog.service';
import { CapabilityAuthorizationService } from './capability-authorization.service';
import { CapabilityObservabilityService } from './capability-observability.service';
import { KnowledgeCapabilityGateway } from '../infrastructure/knowledge-capability.gateway';
import { CapabilityRateLimitService } from '../infrastructure/capability-rate-limit.service';
import { CapabilityRateLimitException } from '../infrastructure/capability-rate-limit.exception';
import {
  CapabilityContext,
  CapabilityId,
  CapabilityInvocationResult,
} from '../domain/capability.types';
import { getCapabilityRegistryEntry } from './capability-registry';
import { CapabilitySchemaValidatorService } from './capability-schema-validator.service';

@Injectable()
export class CapabilityExecutionService {
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

    this.capabilityAuthorizationService.authorize(
      contract,
      context.principal,
    );
    this.capabilitySchemaValidator.validateInput(contract, input);

    const startedAt = Date.now();

    try {
      await this.capabilityRateLimitService.assertAllowed(
        context.principal,
        capabilityId,
      );

      const gatewayHandler = registryEntry.gatewayHandler;
      const data = await this.knowledgeCapabilityGateway[gatewayHandler](
        context.principal,
        input,
        context.trace,
      );
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

      await this.capabilityObservabilityService.recordFailure(
        context.trace,
        context.principal,
        error,
      );

      if (error instanceof Error) {
        throw error;
      }

      throw new InternalServerErrorException('capability 执行失败');
    }
  }
}
