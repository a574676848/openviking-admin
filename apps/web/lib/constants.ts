/** 全局 API 路径中心 */
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    SWITCH_ROLE: '/api/auth/switch-role',
  },
  TENANTS: '/api/tenants',
  USERS: '/api/users',
  INTEGRATIONS: '/api/integrations',
  IMPORT_TASKS: '/api/import-tasks',
  KNOWLEDGE_BASES: '/api/knowledge-bases',
  KNOWLEDGE_TREE: '/api/knowledge-tree',
  SYSTEM: {
    HEALTH: '/api/system/health',
    STATS: '/api/system/stats',
    DASHBOARD: '/api/system/dashboard',
    SETTINGS: '/api/settings',
  },
  AUDIT: '/api/audit',
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
