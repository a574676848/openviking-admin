import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('search_logs')
export class SearchLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: string;

  @Column({ type: 'text' })
  query: string;

  @Column({ nullable: true })
  scope: string;

  @Column({ name: 'result_count', default: 0 })
  resultCount: number;

  @Column({ name: 'score_max', type: 'float', default: 0 })
  scoreMax: number;

  @Column({ name: 'latency_ms', default: 0 })
  latencyMs: number;

  /** 用户反馈：helpful / unhelpful / null（未反馈） */
  @Column({ nullable: true, length: 20 })
  feedback: string;

  @Column({ name: 'feedback_note', nullable: true, type: 'text' })
  feedbackNote: string;

  @Column({ type: 'jsonb', nullable: true })
  meta: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
