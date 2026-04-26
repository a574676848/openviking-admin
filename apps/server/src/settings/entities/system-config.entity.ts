import { Entity, Column, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import type { SystemConfigModel } from '../domain/system-config.model';

@Entity('system_configs')
export class SystemConfig {
  @PrimaryColumn({ length: 128 })
  key: string;

  @Column({ type: 'text' })
  value: string;

  @Column({ nullable: true, type: 'text' })
  description: SystemConfigModel['description'];

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
