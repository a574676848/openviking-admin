import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { Integration } from './entities/integration.entity';
import { EncryptionService } from '../common/encryption.service';
import { IIntegrationRepository } from './domain/repositories/integration.repository.interface';

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
    const where: any = { id };
    if (tenantId) where.tenantId = tenantId;
    const item = await this.repo.findOne({ where });
    if (!item) throw new NotFoundException('集成配置不存在');

    // 关键：返回供业务使用的实体时自动解密
    return this.decryptItem(item);
  }

  async create(dto: any, tenantId: string) {
    const encryptedDto = this.encryptDto(dto);
    return this.repo.save({ ...encryptedDto, tenantId });
  }

  async update(id: string, dto: any, tenantId: string | null) {
    const item = await this.findOne(id, tenantId);
    const encryptedDto = this.encryptDto(dto);
    Object.assign(item, encryptedDto);
    return this.repo.save(item);
  }

  async remove(id: string, tenantId: string | null) {
    const item = await this.findOne(id, tenantId);
    return this.repo.remove(item);
  }

  /** 生产级：定义需要加密和脱敏的核心字段 */
  private readonly SENSITIVE_KEYS = [
    'token',
    'password',
    'appSecret',
    'clientSecret',
  ];

  /**
   * 脱敏处理：返回给前端时完全抹除关键敏感信息
   */
  mask(item: Integration) {
    const masked = { ...item };
    if (masked.credentials) {
      this.SENSITIVE_KEYS.forEach((k) => {
        if (masked.credentials[k]) masked.credentials[k] = '********';
      });
    }
    return masked;
  }

  private encryptDto(dto: any) {
    if (!dto.credentials) return dto;
    this.SENSITIVE_KEYS.forEach((k) => {
      if (dto.credentials[k] && dto.credentials[k] !== '********') {
        dto.credentials[k] = this.encryption.encrypt(dto.credentials[k]);
      }
    });
    return dto;
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
