/** 平台集成常量 */
export const PLATFORM_ENDPOINTS = {
  FEISHU: {
    AUTH_URL:
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    SOURCE_TYPE: 'feishu_docx',
  },
  DINGTALK: {
    AUTH_URL: 'https://oapi.dingtalk.com/gettoken',
    SOURCE_TYPE: 'dingtalk_doc',
  },
};

/** 全局性能配置 */
export const QUEUE_CONFIG = {
  GLOBAL_MAX_CONCURRENCY: 5, // 全局最大并行任务数
  TENANT_MAX_CONCURRENCY: 2, // 单租户最大并行任务数
  POLLING_INTERVAL_MS: 3000, // 队列轮询间隔
};
