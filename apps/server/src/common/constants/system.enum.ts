/** 租户隔离等级枚举 */
export enum TenantIsolationLevel {
  SMALL = 'small', // 字段级逻辑隔离
  MEDIUM = 'medium', // Schema 级物理隔离
  LARGE = 'large', // 独立数据库隔离
}

/** 租户运行状态 */
export enum TenantStatus {
  ACTIVE = 'active',
  DISABLED = 'disabled',
  INITIALIZING = 'initializing',
}

/** 导入任务状态 */
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  DONE = 'done',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/** 集成协议类型 */
export enum IntegrationType {
  GITHUB = 'github',
  GITLAB = 'gitlab',
  WEBDAV = 'webdav',
  FEISHU = 'feishu',
  DINGTALK = 'dingtalk',
  OIDC = 'oidc',
  LDAP = 'ldap',
}

/** 系统配置键常量 */
export const CONFIG_KEYS = {
  OV_BASE_URL: 'ov.base_url',
  OV_API_KEY: 'ov.api_key',
  OV_ACCOUNT: 'ov.account',
  OV_USER: 'ov.user',
  RERANK_ENDPOINT: 'rerank.endpoint',
  RERANK_MODEL: 'rerank.model',
  SEARCH_TOP_K: 'search.top_k',
  SEARCH_THRESHOLD: 'search.score_threshold',
};
