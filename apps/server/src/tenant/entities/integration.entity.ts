import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IntegrationType } from '../../common/constants/system.enum';
import type { IntegrationModel } from '../domain/integration.model';

@Entity('integrations')
export class Integration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ length: 64 })
  name: string;

  @Column({ type: 'varchar', length: 32 })
  type: IntegrationType;

  /**
   * 凭证信息 (已在 Service 层实现 AES 加密)
   */
  @Column({ type: 'jsonb', default: {} })
  credentials: Record<string, string>;

  @Column({ type: 'jsonb', nullable: true })
  config: IntegrationModel['config'];

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
