import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { KnowledgeBaseStatus } from '../domain/knowledge-base.model';

@Entity('knowledge_bases')
export class KnowledgeBase {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 100 })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ name: 'tenant_id', length: 64 })
  tenantId: string;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: KnowledgeBaseStatus;

  @Column({ name: 'viking_uri', nullable: true })
  vikingUri: string;

  @Column({ name: 'doc_count', default: 0 })
  docCount: number;

  @Column({ name: 'vector_count', default: 0 })
  vectorCount: number;

  @Column({
    name: 'created_by_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  createdById: string | null;

  @Column({
    name: 'created_by_name',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  createdByName: string | null;

  @Column({
    name: 'updated_by_id',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  updatedById: string | null;

  @Column({
    name: 'updated_by_name',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  updatedByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}

export const KNOWLEDGE_BASE_TABLE = 'knowledge_bases';
