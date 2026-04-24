import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type KbStatus = 'active' | 'building' | 'archived';

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
  status: KbStatus;

  @Column({ name: 'viking_uri', nullable: true })
  vikingUri: string;

  @Column({ name: 'doc_count', default: 0 })
  docCount: number;

  @Column({ name: 'vector_count', default: 0 })
  vectorCount: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
