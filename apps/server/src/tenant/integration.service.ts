import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Integration } from './entities/integration.entity';
import { EncryptionService } from '../common/encryption.service';
import { IIntegrationRepository } from './domain/repositories/integration.repository.interface';
import type {
  CreateIntegrationInput,
  UpdateIntegrationInput,
} from './domain/integration-input.model';

@Injectable()
export class IntegrationService {
  constructor(
    @Inject(IIntegrationRepository)
    private readonly repo: IIntegrationRepository,
    private readonly encryption: EncryptionService,
  ) {}

  findAll(tenantId: string | null) {
    const where = tenantId ? { tenantId } : {};
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  async findOne(id: string, tenantId: string | null) {
    const where: Record<string, string> = { id };
    if (tenantId) where.tenantId = tenantId;
    const item = await this.repo.findOne({ where });
    if (!item) throw new NotFoundException('集成配置不存在');
    return this.decryptItem(item);
  }

  async create(input: CreateIntegrationInput, tenantId: string) {
    const encrypted = this.encryptCredentials(input);
    return this.repo.save({ ...encrypted, tenantId });
  }

  async update(
    id: string,
    input: UpdateIntegrationInput,
    tenantId: string | null,
  ) {
    const item = await this.findOne(id, tenantId);
    const encrypted = this.encryptCredentials(input);
    Object.assign(item, encrypted);
    return this.repo.save(item);
  }

  async remove(id: string, tenantId: string | null) {
    const item = await this.findOne(id, tenantId);
    return this.repo.remove(item);
  }

  private readonly SENSITIVE_KEYS = [
    'token',
    'password',
    'appSecret',
    'clientSecret',
  ];

  mask(item: Integration) {
    const masked = { ...item };
    if (masked.credentials) {
      this.SENSITIVE_KEYS.forEach((k) => {
        if (masked.credentials[k]) masked.credentials[k] = '********';
      });
    }
    return masked;
  }

  private encryptCredentials(
    input: CreateIntegrationInput | UpdateIntegrationInput,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...input };
    if (!result.credentials) return result;
    const creds = result.credentials as Record<string, string>;
    this.SENSITIVE_KEYS.forEach((k) => {
      if (creds[k] && creds[k] !== '********') {
        creds[k] = this.encryption.encrypt(creds[k]);
      }
    });
    return result;
  }

  private decryptItem(item: Integration) {
    if (!item.credentials) return item;
    this.SENSITIVE_KEYS.forEach((k) => {
      if (item.credentials[k]) {
        item.credentials[k] = this.encryption.decrypt(item.credentials[k]);
      }
    });
    return item;
  }
}
