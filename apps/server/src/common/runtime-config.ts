import path from 'node:path';

const PLACEHOLDER_PATTERNS = [
  'change-me',
  'replace-me',
  'your_',
  'example.com',
  'localhost',
  '127.0.0.1',
] as const;

function hasPlaceholder(value: string) {
  const normalized = value.trim().toLowerCase();
  return PLACEHOLDER_PATTERNS.some((pattern) => normalized.includes(pattern));
}

function assertRequired(env: NodeJS.ProcessEnv, key: string, message: string) {
  if (!env[key] || env[key]?.trim().length === 0) {
    throw new Error(message);
  }
}

function assertAbsolutePath(value: string, message: string) {
  if (!path.isAbsolute(value.trim())) {
    throw new Error(message);
  }
}

export function assertSafeRuntimeConfig(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  if (env.DB_SYNCHRONIZE === 'true') {
    throw new Error(
      '生产环境禁止启用 DB_SYNCHRONIZE=true，请先执行数据库迁移后再启动服务。',
    );
  }

  assertRequired(env, 'JWT_SECRET', '生产环境缺少 JWT_SECRET。');
  assertRequired(env, 'ENCRYPTION_KEY', '生产环境缺少 ENCRYPTION_KEY。');
  assertRequired(
    env,
    'FRONTEND_URL',
    '生产环境缺少 FRONTEND_URL，用于 CORS 白名单。',
  );
  assertRequired(env, 'OV_BASE_URL', '生产环境缺少 OV_BASE_URL。');
  assertRequired(env, 'OV_API_KEY', '生产环境缺少 OV_API_KEY。');
  assertRequired(
    env,
    'LOCAL_IMPORT_UPLOAD_DIR',
    '生产环境缺少 LOCAL_IMPORT_UPLOAD_DIR，用于本地文档上传暂存。',
  );

  if (
    (env.JWT_SECRET ?? '').trim().length < 32 ||
    hasPlaceholder(env.JWT_SECRET!)
  ) {
    throw new Error('生产环境 JWT_SECRET 不安全，请使用至少 32 位随机字符串。');
  }

  if (
    (env.ENCRYPTION_KEY ?? '').trim().length < 32 ||
    hasPlaceholder(env.ENCRYPTION_KEY!)
  ) {
    throw new Error(
      '生产环境 ENCRYPTION_KEY 不安全，请使用至少 32 位随机字符串。',
    );
  }

  if (hasPlaceholder(env.FRONTEND_URL!)) {
    throw new Error(
      '生产环境 FRONTEND_URL 不能使用 localhost / 127.0.0.1 / example.com 占位值。',
    );
  }

  if (hasPlaceholder(env.OV_BASE_URL!) || hasPlaceholder(env.OV_API_KEY!)) {
    throw new Error(
      '生产环境 OpenViking 连接配置仍是占位值，请改为真实地址和密钥。',
    );
  }

  if (hasPlaceholder(env.LOCAL_IMPORT_UPLOAD_DIR!)) {
    throw new Error('生产环境本地导入目录不能使用占位路径。');
  }

  assertAbsolutePath(
    env.LOCAL_IMPORT_UPLOAD_DIR!,
    '生产环境 LOCAL_IMPORT_UPLOAD_DIR 必须使用绝对路径。',
  );
}
