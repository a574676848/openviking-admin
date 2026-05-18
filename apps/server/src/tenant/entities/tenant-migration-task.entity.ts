import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { TenantIsolationLevel } from '../../common/constants/system.enum';
import type { TenantModel } from '../domain/tenant.model';

export type TenantMigrationTaskStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed';
export type TenantMigrationTaskScope = 'platform' | 'tenant';

@Entity('tenant_migration_tasks')
@Index('idx_tenant_migration_tasks_tenant', ['tenantId', 'createdAt'])
export class TenantMigrationTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 20, default: 'tenant' })
  scope: TenantMigrationTaskScope;

  @Column({ name: 'tenant_record_id', type: 'uuid', nullable: true })
  tenantRecordId: string | null;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  tenantId: string | null;

  @Column({ name: 'source_level', type: 'varchar', length: 20, nullable: true })
  sourceLevel: TenantIsolationLevel | null;

  @Column({ name: 'target_level', type: 'varchar', length: 20, nullable: true })
  targetLevel: TenantIsolationLevel | null;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: TenantMigrationTaskStatus;

  @Column({ type: 'varchar', length: 80, default: '等待执行' })
  step: string;

  @Column({ type: 'int', default: 0 })
  progress: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'target_db_config', type: 'jsonb', nullable: true })
  targetDbConfig: TenantModel['dbConfig'];

  @Column({ name: 'precheck_result', type: 'jsonb', nullable: true })
  precheckResult: Record<string, unknown> | null;

  @Column({ name: 'created_by_id', type: 'varchar', length: 64, nullable: true })
  createdById: string | null;

  @Column({
    name: 'created_by_name',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  createdByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
