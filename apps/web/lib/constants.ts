/** 全局 API 路径中心 */
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/v1/auth/login',
    SWITCH_ROLE: '/api/v1/auth/switch-role',
  },
  TENANTS: '/api/v1/tenants',
  USERS: '/api/v1/users',
  INTEGRATIONS: '/api/v1/integrations',
  IMPORT_TASKS: '/api/v1/import-tasks',
  KNOWLEDGE_BASES: '/api/v1/knowledge-bases',
  KNOWLEDGE_TREE: '/api/v1/knowledge-tree',
  SYSTEM: {
    HEALTH: '/api/v1/system/health',
    STATS: '/api/v1/system/stats',
    DASHBOARD: '/api/v1/system/dashboard',
    SETTINGS: '/api/v1/settings',
  },
  AUDIT: '/api/v1/audit',
};

/** 物理连接默认值 */
export const DB_DEFAULTS = {
  POSTGRES_PORT: '5432',
};

/** 业务状态枚举 */
export enum IsolationLevel {
  SMALL = 'small',
  MEDIUM = 'medium',
  LARGE = 'large'
}

/** 角色定义 */
export const SystemRoles = {
  SUPER_ADMIN: 'super_admin',
  TENANT_ADMIN: 'tenant_admin',
  TENANT_OPERATOR: 'tenant_operator',
  TENANT_VIEWER: 'tenant_viewer',
} as const;
