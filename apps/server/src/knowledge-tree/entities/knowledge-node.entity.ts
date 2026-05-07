import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
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

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
