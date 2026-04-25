import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantIsolationLevel } from '../../common/constants/system.enum';

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** 唯一标识，用于 tenantId 分区 */
  @Column({ name: 'tenant_id', unique: true, length: 64 })
  tenantId: string;

  @Column({ name: 'display_name', length: 128 })
  displayName: string;

  @Column({ default: 'active' })
  status: string; // active | disabled

  /** 隔离等级：small (字段), medium (schema), large (独立库) */
  @Column({ name: 'isolation_level', default: 'small', length: 20 })
  isolationLevel: TenantIsolationLevel;

  /** 独立数据库配置 (仅针对 large 等级) */
  @Column({ name: 'db_config', type: 'jsonb', nullable: true })
  dbConfig: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
  };

  /** OpenViking account 映射 */
  @Column({ name: 'viking_account', nullable: true, length: 128 })
  vikingAccount: string;

  /** 配额 JSON，如 { maxDocs: 1000, maxVectors: 100000 } */
  @Column({ type: 'jsonb', nullable: true })
  quota: Record<string, any>;

  /** 租户特有 OpenViking 配置（覆盖全局默认值） */
  @Column({ name: 'ov_config', type: 'jsonb', nullable: true })
  ovConfig: {
    baseUrl?: string;
    apiKey?: string;
    account?: string;
    rerankEndpoint?: string;
    rerankModel?: string;
  };

  /** 描述 */
  @Column({ nullable: true, type: 'text' })
  description: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
