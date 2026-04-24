import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** 在 Controller 方法上声明允许的角色列表，如 @Roles('admin', 'operator') */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
