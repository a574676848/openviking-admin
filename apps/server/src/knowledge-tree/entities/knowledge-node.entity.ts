import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  KnowledgeNodeIndexStatus,
  KnowledgeNodeKind,
  KnowledgeNodeModel,
} from '../domain/knowledge-node.model';

@Entity('knowledge_nodes')
export class KnowledgeNode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: string;

  @Column({ name: 'kb_id' })
  kbId: string;

  @Column({ name: 'parent_id', nullable: true, type: 'uuid' })
  parentId: string | null;

  @Column({ length: 200 })
  name: string;

  @Column({ nullable: true, type: 'text' })
  path: string;

  @Column({ name: 'sort_order', default: 0 })
  sortOrder: number;

  /**
   * 权限控制列表 (jsonb)
   * e.g., { "roles": ["admin"], "users": ["u123"], "isPublic": false }
   */
  @Column({ type: 'jsonb', nullable: true })
  acl: KnowledgeNodeModel['acl'];

  @Column({ type: 'varchar', length: 20, nullable: true })
  kind: KnowledgeNodeKind | null;

  @Column({ name: 'viking_uri', nullable: true })
  vikingUri: string;

  @Column({ name: 'content_uri', type: 'varchar', length: 2048, nullable: true })
  contentUri: string | null;

  @Column({ name: 'index_status', type: 'varchar', length: 20, default: 'clean' })
  indexStatus: KnowledgeNodeIndexStatus;

  @Column({ name: 'draft_version', type: 'int', default: 0 })
  draftVersion: number;

  @Column({ name: 'indexed_version', type: 'int', default: 0 })
  indexedVersion: number;

  @Column({ name: 'vector_count', type: 'int', nullable: true })
  vectorCount: number | null;

  @Column({ name: 'last_indexed_at', type: 'timestamptz', nullable: true })
  lastIndexedAt: Date | null;

  @Column({ name: 'index_error', type: 'text', nullable: true })
  indexError: string | null;

  @Column({ name: 'created_by_id', type: 'varchar', length: 64, nullable: true })
  createdById: string | null;

  @Column({ name: 'created_by_name', type: 'varchar', length: 64, nullable: true })
  createdByName: string | null;

  @Column({ name: 'updated_by_id', type: 'varchar', length: 64, nullable: true })
  updatedById: string | null;

  @Column({ name: 'updated_by_name', type: 'varchar', length: 64, nullable: true })
  updatedByName: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
