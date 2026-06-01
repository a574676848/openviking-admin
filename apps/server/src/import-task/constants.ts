/** 平台集成常量 */
export const PLATFORM_ENDPOINTS = {
  FEISHU: {
    AUTH_URL:
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    DOCX_API_BASE: 'https://open.feishu.cn/open-apis/docx/v1/documents',
    DOCX_TOKEN_PATTERN: /\/docx\/([^/?#]+)/,
  },
  DINGTALK: {
    AUTH_URL: 'https://api.dingtalk.com/v1.0/oauth2/accessToken',
    QUERY_BY_URL_URL: 'https://api.dingtalk.com/v2.0/wiki/nodes/queryByUrl',
    DOCUMENT_BLOCKS_URL: 'https://api.dingtalk.com/v1.0/doc/suites/documents',
  },
};

/** 全局性能配置 */
export const QUEUE_CONFIG = {
  GLOBAL_MAX_CONCURRENCY: 5, // 全局最大并行任务数
  TENANT_MAX_CONCURRENCY: 2, // 单租户最大并行任务数
  POLLING_INTERVAL_MS: 60_000, // 队列轮询间隔
};

/** 本地导入上传配置 */
export const LOCAL_IMPORT_UPLOAD_CONFIG = {
  FIELD_NAME: 'files',
  MAX_FILES: 10,
  MAX_FILE_SIZE_BYTES: 25 * 1024 * 1024,
  STORAGE_DIR_ENV: 'LOCAL_IMPORT_UPLOAD_DIR',
  KEEP_AFTER_DONE_ENV: 'LOCAL_IMPORT_KEEP_FILES_AFTER_DONE',
  MANAGED_UPLOAD_SEGMENT: 'managed',
  GIT_ARCHIVE_SEGMENT: 'openviking-git-archives',
  DEFAULT_STORAGE_SEGMENTS: ['storage', 'import-uploads'],
  ALLOWED_EXTENSIONS: [
    '.pdf',
    '.md',
    '.markdown',
    '.json',
    '.canvas',
    '.css',
    '.js',
    '.doc',
    '.docx',
    '.txt',
    '.zip',
  ],
} as const;

/** 导入任务字段长度 */
export const IMPORT_TASK_FIELD_LIMITS = {
  SOURCE_NAME_MAX_LENGTH: 255,
} as const;

/** OpenViking 资源接口路径 */
export const OPENVIKING_RESOURCE_ENDPOINTS = {
  TEMP_UPLOAD: '/api/v1/resources/temp_upload',
  INJECT: '/api/v1/resources',
} as const;

/** OpenViking 资源注入默认等待策略 */
export const OPENVIKING_RESOURCE_INJECT_DEFAULT_WAIT = false;

/** Worker OV 调用超时（毫秒） */
export const OV_INJECT_TIMEOUT_MS = 120_000;
export const OV_DELETE_TIMEOUT_MS = 120_000;
export const OV_STATS_TIMEOUT_MS = 30_000;
export const OV_STREAM_TIMEOUT_MS = 60_000;
