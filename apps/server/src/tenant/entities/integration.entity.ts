import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IntegrationType } from '../../common/constants/system.enum';

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
  credentials: Record<string, any>;

  @Column({ type: 'jsonb', nullable: true })
  config: Record<string, any>;

  @Column({ default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
