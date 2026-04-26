import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const envExamplePath = path.join(root, 'apps/server/.env.example');
const envSource = fs.readFileSync(envExamplePath, 'utf8');

const requiredKeys = [
  'DB_HOST',
  'DB_PORT',
  'DB_USER',
  'DB_PASS',
  'DB_NAME',
  'JWT_SECRET',
  'ENCRYPTION_KEY',
  'OV_BASE_URL',
  'OV_API_KEY',
  'FRONTEND_URL',
  'PORT',
  'NODE_ENV',
  'DB_SYNCHRONIZE',
  'CAPABILITY_RATE_LIMIT_STORE_DRIVER',
];

const missing = requiredKeys.filter((key) => !envSource.includes(`${key}=`));

if (missing.length > 0) {
  console.error(`.env.example 缺少关键变量: ${missing.join(', ')}`);
  process.exit(1);
}

console.log(`.env.example 检查通过，共校验 ${requiredKeys.length} 个关键变量。`);
