import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('audit_logs')
@Index(['userId', 'createdAt'])
@Index(['action', 'createdAt'])
@Index(['tenantId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: string;

  @Column({ name: 'user_id', nullable: true })
  userId: string;

  @Column({ name: 'username', nullable: true })
  username: string;

  /** 操作类型：login / logout / create_kb / delete_kb / import / reindex / search / settings_change / user_create / user_delete */
  @Column({ length: 64 })
  action: string;

  /** 操作目标，如知识库 ID、URI 等 */
  @Column({ name: 'target', nullable: true })
  target: string;

  /** 额外元数据 */
  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, any>;

  /** ip 地址 */
  @Column({ name: 'ip', nullable: true })
  ip: string;

  /** 是否成功 */
  @Column({ default: true })
  success: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
