import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { EncryptionService } from '../common/encryption.service';
import { IIntegrationRepository } from './domain/repositories/integration.repository.interface';
import type {
  CreateIntegrationInput,
  UpdateIntegrationInput,
} from './domain/integration-input.model';
import type { IntegrationModel } from './domain/integration.model';
import type { IntegrationType } from '../common/constants/system.enum';

const MASKED_SECRET_PLACEHOLDER = '********';
const SENSITIVE_CREDENTIAL_KEYS = [
  'token',
  'password',
  'bindPassword',
  'appSecret',
  'clientSecret',
] as const;

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

  async findActiveByType(tenantId: string, type: IntegrationType) {
    const item = await this.repo.findOne({
      where: { tenantId, type, active: true },
    });
    return item ? this.decryptItem(item) : null;
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
    const where: Record<string, string> = { id };
    if (tenantId) where.tenantId = tenantId;
    const item = await this.repo.findOne({ where });
    if (!item) throw new NotFoundException('集成配置不存在');

    const encrypted = this.encryptCredentials(input, item.credentials);
    Object.assign(item, encrypted);
    return this.repo.save(item);
  }

  async remove(id: string, tenantId: string | null) {
    const item = await this.findOne(id, tenantId);
    return this.repo.remove(item);
  }

  mask(item: IntegrationModel) {
    const masked = {
      ...item,
      credentials: { ...(item.credentials ?? {}) },
    };
    if (masked.credentials) {
      SENSITIVE_CREDENTIAL_KEYS.forEach((k) => {
        if (masked.credentials[k]) {
          masked.credentials[k] = MASKED_SECRET_PLACEHOLDER;
        }
      });
    }
    return masked;
  }

  private encryptCredentials(
    input: CreateIntegrationInput | UpdateIntegrationInput,
    existingCredentials?: Record<string, string>,
  ): Record<string, unknown> {
    const result: Record<string, unknown> = { ...input };
    if (!result.credentials) return result;
    const creds = { ...(result.credentials as Record<string, string>) };
    SENSITIVE_CREDENTIAL_KEYS.forEach((k) => {
      if (!creds[k]) {
        return;
      }
      if (creds[k] === MASKED_SECRET_PLACEHOLDER) {
        if (existingCredentials?.[k]) {
          creds[k] = existingCredentials[k];
        } else {
          delete creds[k];
        }
        return;
      }
      creds[k] = this.encryption.encrypt(creds[k]);
    });
    result.credentials = creds;
    return result;
  }

  private decryptItem(item: IntegrationModel) {
    if (!item.credentials) return item;
    SENSITIVE_CREDENTIAL_KEYS.forEach((k) => {
      if (item.credentials[k]) {
        item.credentials[k] = this.encryption.decrypt(item.credentials[k]);
      }
    });
    return item;
  }
}
