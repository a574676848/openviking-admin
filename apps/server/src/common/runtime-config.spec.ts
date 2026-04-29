import { assertSafeRuntimeConfig } from './runtime-config';

describe('assertSafeRuntimeConfig', () => {
  it('允许非生产环境启用 DB_SYNCHRONIZE', () => {
    expect(() =>
      assertSafeRuntimeConfig({
        NODE_ENV: 'development',
        DB_SYNCHRONIZE: 'true',
      }),
    ).not.toThrow();
  });

  it('允许生产环境保持 DB_SYNCHRONIZE=false', () => {
    expect(() =>
      assertSafeRuntimeConfig({
        NODE_ENV: 'production',
        DB_SYNCHRONIZE: 'false',
        JWT_SECRET: 'x'.repeat(32),
        ENCRYPTION_KEY: 'y'.repeat(32),
        FRONTEND_URL: 'https://admin.openviking.example',
        OV_BASE_URL: 'https://ov.openviking.example',
        OV_API_KEY: 'ov-live-key',
        LOCAL_IMPORT_UPLOAD_DIR: '/data/openviking/import-uploads',
      }),
    ).not.toThrow();
  });

  it('阻止生产环境启用 DB_SYNCHRONIZE=true', () => {
    expect(() =>
      assertSafeRuntimeConfig({
        NODE_ENV: 'production',
        DB_SYNCHRONIZE: 'true',
        JWT_SECRET: 'x'.repeat(32),
        ENCRYPTION_KEY: 'y'.repeat(32),
        FRONTEND_URL: 'https://admin.openviking.example',
        OV_BASE_URL: 'https://ov.openviking.example',
        OV_API_KEY: 'ov-live-key',
        LOCAL_IMPORT_UPLOAD_DIR: '/data/openviking/import-uploads',
      }),
    ).toThrow('生产环境禁止启用 DB_SYNCHRONIZE=true');
  });

  it('阻止生产环境缺少本地导入共享目录', () => {
    expect(() =>
      assertSafeRuntimeConfig({
        NODE_ENV: 'production',
        DB_SYNCHRONIZE: 'false',
        JWT_SECRET: 'x'.repeat(32),
        ENCRYPTION_KEY: 'y'.repeat(32),
        FRONTEND_URL: 'https://admin.openviking.example',
        OV_BASE_URL: 'https://ov.openviking.example',
        OV_API_KEY: 'ov-live-key',
      }),
    ).toThrow('生产环境缺少 LOCAL_IMPORT_UPLOAD_DIR');
  });

  it('阻止生产环境使用相对本地导入目录', () => {
    expect(() =>
      assertSafeRuntimeConfig({
        NODE_ENV: 'production',
        DB_SYNCHRONIZE: 'false',
        JWT_SECRET: 'x'.repeat(32),
        ENCRYPTION_KEY: 'y'.repeat(32),
        FRONTEND_URL: 'https://admin.openviking.example',
        OV_BASE_URL: 'https://ov.openviking.example',
        OV_API_KEY: 'ov-live-key',
        LOCAL_IMPORT_UPLOAD_DIR: './storage/import-uploads',
      }),
    ).toThrow('生产环境 LOCAL_IMPORT_UPLOAD_DIR 必须使用绝对路径');
  });

  it('阻止生产环境使用占位密钥与 localhost CORS 配置', () => {
    expect(() =>
      assertSafeRuntimeConfig({
        NODE_ENV: 'production',
        DB_SYNCHRONIZE: 'false',
        JWT_SECRET: 'change-me-in-production',
        ENCRYPTION_KEY: 'replace-me-encryption-key',
        FRONTEND_URL: 'http://localhost:6002',
        OV_BASE_URL: 'http://localhost:1933',
        OV_API_KEY: 'replace-me',
        LOCAL_IMPORT_UPLOAD_DIR: '/data/openviking/import-uploads',
      }),
    ).toThrow('生产环境 JWT_SECRET 不安全');
  });
});
