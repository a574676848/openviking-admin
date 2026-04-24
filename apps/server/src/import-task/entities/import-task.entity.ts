import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type TaskStatus = 'pending' | 'running' | 'done' | 'failed';
export type SourceType = 'url' | 'git' | 'local';

@Entity('import_tasks')
export class ImportTask {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: string;

  /** 关联的集成凭证 ID */
  @Column({ name: 'integration_id', nullable: true })
  integrationId: string;

  @Column({ name: 'kb_id' })
  kbId: string;

  @Column({ name: 'source_type', type: 'varchar', length: 20 })
  sourceType: SourceType;

  @Column({ name: 'source_url', nullable: true })
  sourceUrl: string;

  @Column({ name: 'target_uri' })
  targetUri: string;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status: TaskStatus;

  @Column({ name: 'node_count', default: 0 })
  nodeCount: number;

  @Column({ name: 'vector_count', default: 0 })
  vectorCount: number;

  @Column({ name: 'error_msg', nullable: true, type: 'text' })
  errorMsg: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
