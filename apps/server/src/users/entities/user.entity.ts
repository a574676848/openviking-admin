import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import type { UserModel } from '../domain/user.model';

export const SystemRoles = {
  SUPER_ADMIN: 'super_admin',
  TENANT_ADMIN: 'tenant_admin',
  TENANT_OPERATOR: 'tenant_operator',
  TENANT_VIEWER: 'tenant_viewer',
} as const;

export type UserRole = (typeof SystemRoles)[keyof typeof SystemRoles];

@Index('uq_users_platform_username', ['username'], {
  unique: true,
  where: '"tenant_id" IS NULL',
})
@Index('uq_users_tenant_username', ['tenantId', 'username'], {
  unique: true,
  where: '"tenant_id" IS NOT NULL',
})
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 64 })
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
  @Column({ type: 'varchar', name: 'sso_id', nullable: true, length: 128 })
  ssoId: UserModel['ssoId'];

  /** 身份提供商：feishu | dingtalk | oidc | ldap */
  @Column({ type: 'varchar', name: 'provider', nullable: true, length: 32 })
  provider: UserModel['provider'];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
