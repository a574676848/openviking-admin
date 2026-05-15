import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('document_drafts')
export class DocumentDraft {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'varchar', length: 64, nullable: true })
  tenantId: string | null;

  @Column({ name: 'node_id', type: 'uuid' })
  nodeId: string;

  @Column({ type: 'text' })
  markdown: string;

  @Column({ type: 'int', default: 1 })
  version: number;

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
