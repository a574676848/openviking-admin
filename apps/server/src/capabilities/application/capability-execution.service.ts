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

@Injectable()
export class CapabilityExecutionService {
  constructor(
    private readonly capabilityCatalogService: CapabilityCatalogService,
    private readonly capabilityAuthorizationService: CapabilityAuthorizationService,
    private readonly capabilityObservabilityService: CapabilityObservabilityService,
    private readonly capabilityRateLimitService: CapabilityRateLimitService,
    private readonly knowledgeCapabilityGateway: KnowledgeCapabilityGateway,
  ) {}

  async execute(
    capabilityId: CapabilityId,
    input: Record<string, unknown>,
    context: CapabilityContext,
  ): Promise<CapabilityInvocationResult> {
    const contract = this.capabilityCatalogService
      .listCapabilities()
      .find((item) => item.id === capabilityId);

    if (!contract) {
      throw new NotFoundException(`未知 capability: ${capabilityId}`);
    }

    this.capabilityAuthorizationService.authorize(
      contract,
      context.principal,
    );

    const startedAt = Date.now();

    try {
      this.capabilityRateLimitService.assertAllowed(
        context.principal,
        capabilityId,
      );

      let data: Record<string, unknown>;

      switch (capabilityId) {
        case 'knowledge.search':
          data = await this.knowledgeCapabilityGateway.search(
            context.principal,
            input,
            context.trace,
          );
          break;
        case 'knowledge.grep':
          data = await this.knowledgeCapabilityGateway.grep(
            context.principal,
            input,
            context.trace,
          );
          break;
        case 'resources.list':
          data = await this.knowledgeCapabilityGateway.listResources(
            context.principal,
            input,
            context.trace,
          );
          break;
        case 'resources.tree':
          data = await this.knowledgeCapabilityGateway.treeResources(
            context.principal,
            input,
            context.trace,
          );
          break;
        default:
          throw new NotFoundException(`未知 capability: ${capabilityId}`);
      }

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
