import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('mcp_sessions')
export class McpSession {
  @PrimaryColumn({ name: 'session_id', length: 36 })
  sessionId: string;

  @Column({ name: 'api_key_hash', length: 64 })
  @Index('idx_mcp_sessions_api_key_hash')
  apiKeyHash: string;

  @Column({ name: 'session_token_hash', length: 64 })
  sessionTokenHash: string;

  @Column({ name: 'expires_at', type: 'timestamp' })
  @Index('idx_mcp_sessions_expires_at')
  expiresAt: Date;

  @Column({ name: 'last_seen_at', type: 'timestamp' })
  lastSeenAt: Date;

  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
