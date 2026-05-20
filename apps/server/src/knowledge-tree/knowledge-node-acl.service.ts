import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { KnowledgeNodeModel } from './domain/knowledge-node.model';
import {
  IKnowledgeNodeRepository,
  type IKnowledgeNodeRepository as IKnowledgeNodeRepositoryType,
} from './domain/repositories/knowledge-node.repository.interface';

export interface KnowledgeNodeAccessPrincipal {
  userId: string;
  role?: string | null;
}

@Injectable()
export class KnowledgeNodeAclService {
  constructor(
    @Inject(IKnowledgeNodeRepository)
    private readonly nodeRepo: IKnowledgeNodeRepositoryType,
  ) {}

  canReadNode(
    node: Pick<KnowledgeNodeModel, 'acl'>,
    principal: KnowledgeNodeAccessPrincipal,
  ) {
    const acl = node.acl;
    if (!acl || acl.isPublic) {
      return true;
    }

    const roles = acl.roles ?? [];
    const users = acl.users ?? [];
    return (
      Boolean(principal.role && roles.includes(principal.role)) ||
      users.includes(principal.userId)
    );
  }

  assertCanReadNode(
    node: Pick<KnowledgeNodeModel, 'acl'>,
    principal: KnowledgeNodeAccessPrincipal,
    message = '当前用户无权访问该知识节点',
  ) {
    if (!this.canReadNode(node, principal)) {
      throw new ForbiddenException(message);
    }
  }

  filterReadableNodes<T extends Pick<KnowledgeNodeModel, 'acl'>>(
    nodes: T[],
    principal: KnowledgeNodeAccessPrincipal,
  ) {
    return nodes.filter((node) => this.canReadNode(node, principal));
  }

  async getAllowedUris(
    tenantId: string,
    principal: KnowledgeNodeAccessPrincipal,
  ) {
    return this.nodeRepo.findAllowedUris(tenantId, {
      id: principal.userId,
      role: principal.role ?? '',
    });
  }
}
