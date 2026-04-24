import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('mcp_session_events')
@Index('idx_mcp_session_events_pending', [
  'sessionId',
  'deliveredAt',
  'createdAt',
])
export class McpSessionEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', length: 36 })
  sessionId: string;

  @Column({ name: 'event_type', length: 32, nullable: true })
  eventType: string | null;

  @Column({ type: 'text' })
  payload: string;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
