import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Inject,
} from '@nestjs/common';
import { CreateKnowledgeBaseDto } from './dto/create-kb.dto';
import { TenantService } from '../tenant/tenant.service';
import { KNOWLEDGE_BASE_REPOSITORY } from './domain/repositories/knowledge-base.repository.interface';
import type { IKnowledgeBaseRepository } from './domain/repositories/knowledge-base.repository.interface';
import type { KnowledgeBaseModel } from './domain/knowledge-base.model';

@Injectable()
export class KnowledgeBaseService {
  constructor(
    @Inject(KNOWLEDGE_BASE_REPOSITORY)
    private readonly kbRepo: IKnowledgeBaseRepository,
    private readonly tenantService: TenantService,
  ) {}

  findAll(tenantId: string | null) {
    return this.kbRepo.findAll(tenantId);
  }

  async findOne(id: string, tenantId: string | null) {
    const kb = await this.kbRepo.findById(id, tenantId);
    if (!kb) throw new NotFoundException(`知识库 ${id} 不存在或无权访问`);
    return kb;
  }

  async create(dto: CreateKnowledgeBaseDto & { tenantId: string }) {
    const tenant = await this.tenantService.findOneByIdOrTenantId(dto.tenantId);
    const currentCount = await this.kbRepo.count({
      where: { tenantId: tenant.tenantId },
    });

    const maxDocs =
      (tenant.quota as Record<string, number> | undefined)?.maxDocs || 0;
    if (maxDocs > 0 && currentCount >= maxDocs) {
      throw new ForbiddenException(
        `已达到租户知识库配额上限 (${maxDocs})，请联系管理员扩容`,
      );
    }

    const tenantIdentifier = tenant.tenantId;
    return this.kbRepo.createWithUri({
      ...dto,
      tenantId: tenantIdentifier,
    });
  }

  async update(
    id: string,
    attrs: Partial<KnowledgeBaseModel>,
    tenantId: string | null,
  ) {
    const kb = await this.findOne(id, tenantId);
    Object.assign(kb, attrs);
    return this.kbRepo.save(kb);
  }

  async remove(id: string, tenantId: string | null) {
    const kb = await this.findOne(id, tenantId);
    return this.kbRepo.delete(kb);
  }
}
