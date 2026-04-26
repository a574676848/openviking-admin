import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { UserModel } from '../domain/user.model';

export const SystemRoles = {
  SUPER_ADMIN: 'super_admin',
  TENANT_ADMIN: 'tenant_admin',
  TENANT_OPERATOR: 'tenant_operator',
  TENANT_VIEWER: 'tenant_viewer',
} as const;

export type UserRole = (typeof SystemRoles)[keyof typeof SystemRoles];

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, length: 64 })
  username: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'varchar', length: 30, default: 'tenant_viewer' })
  role: UserModel['role'];

  @Column({ name: 'tenant_id', nullable: true })
  tenantId: string;

  @Column({ default: true })
  active: boolean;

  /** 第三方身份唯一标识 (SSO) */
  @Column({ name: 'sso_id', nullable: true, length: 128 })
  ssoId: UserModel['ssoId'];

  /** 身份提供商：feishu | dingtalk | oidc | ldap */
  @Column({ name: 'provider', nullable: true, length: 32 })
  provider: UserModel['provider'];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
