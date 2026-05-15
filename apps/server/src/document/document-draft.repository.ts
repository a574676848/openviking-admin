import { Injectable, Scope, Inject } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { RepositoryRequest } from '../common/repository-request.interface';
import type { AuditActorSnapshot } from '../common/audit-actor.types';
import { DocumentDraft } from './entities/document-draft.entity';

export interface DocumentDraftModel {
  id: string;
  tenantId: string | null;
  nodeId: string;
  markdown: string;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable({ scope: Scope.REQUEST })
export class DocumentDraftRepository {
  constructor(
    @Inject(REQUEST) private readonly request: RepositoryRequest,
    @InjectRepository(DocumentDraft)
    private readonly defaultRepo: Repository<DocumentDraft>,
  ) {}

  private get repo(): Repository<DocumentDraft> {
    if (this.request?.tenantQueryRunner) {
      return this.request.tenantQueryRunner.manager.getRepository(DocumentDraft);
    }
    if (this.request?.tenantDataSource) {
      return this.request.tenantDataSource.getRepository(DocumentDraft);
    }
    return this.defaultRepo;
  }

  async findByNode(
    nodeId: string,
    tenantId: string | null,
  ): Promise<DocumentDraftModel | null> {
    const draft = await this.repo.findOne({
      where: { nodeId, tenantId: tenantId ?? undefined },
    });
    return draft ? this.toModel(draft) : null;
  }

  async saveMarkdown(
    nodeId: string,
    tenantId: string | null,
    markdown: string,
    actor?: AuditActorSnapshot | null,
  ): Promise<DocumentDraftModel> {
    const existing = await this.repo.findOne({
      where: { nodeId, tenantId: tenantId ?? undefined },
    });
    const nextVersion = (existing?.version ?? 0) + 1;
    const draft = this.repo.create({
      ...existing,
      tenantId,
      nodeId,
      markdown,
      version: nextVersion,
      createdById: existing?.createdById ?? actor?.id ?? null,
      createdByName: existing?.createdByName ?? actor?.username ?? null,
      updatedById: actor?.id ?? existing?.updatedById ?? null,
      updatedByName: actor?.username ?? existing?.updatedByName ?? null,
    });
    return this.toModel(await this.repo.save(draft));
  }

  private toModel(draft: DocumentDraft): DocumentDraftModel {
    return {
      id: draft.id,
      tenantId: draft.tenantId,
      nodeId: draft.nodeId,
      markdown: draft.markdown,
      version: draft.version,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
    };
  }
}
