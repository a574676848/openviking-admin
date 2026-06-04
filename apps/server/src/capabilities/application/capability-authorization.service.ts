import { ForbiddenException, Injectable } from '@nestjs/common';
import { CapabilityContract, Principal } from '../domain/capability.types';
import { SystemRoles, type UserRole } from '../../users/entities/user.entity';

const ROLE_WEIGHT: Record<UserRole, number> = {
  [SystemRoles.TENANT_VIEWER]: 1,
  [SystemRoles.TENANT_OPERATOR]: 2,
  [SystemRoles.TENANT_ADMIN]: 3,
  [SystemRoles.SUPER_ADMIN]: 4,
};

@Injectable()
export class CapabilityAuthorizationService {
  canAccess(contract: CapabilityContract, principal: Principal) {
    if (contract.permissionRequirement === 'tenant' && !principal.tenantId) {
      return false;
    }

    if (!contract.minimumRole) {
      return true;
    }

    const principalRole = this.resolvePrincipalRole(principal);
    return (ROLE_WEIGHT[principalRole] ?? 0) >= ROLE_WEIGHT[contract.minimumRole];
  }

  authorize(contract: CapabilityContract, principal: Principal) {
    if (contract.permissionRequirement === 'tenant' && !principal.tenantId) {
      throw new ForbiddenException('当前 capability 需要租户上下文');
    }

    if (!contract.minimumRole) {
      return;
    }

    const principalRole = this.resolvePrincipalRole(principal);
    if ((ROLE_WEIGHT[principalRole] ?? 0) < ROLE_WEIGHT[contract.minimumRole]) {
      throw new ForbiddenException(
        `当前 capability 至少需要 ${contract.minimumRole} 权限`,
      );
    }
  }

  private resolvePrincipalRole(principal: Principal): UserRole {
    return (principal.role ?? SystemRoles.TENANT_VIEWER) as UserRole;
  }
}
