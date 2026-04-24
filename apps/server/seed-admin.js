const bcrypt = require('bcryptjs');
const { Client } = require('pg');

async function main() {
  const hash = await bcrypt.hash('admin123', 10);
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'openviking_admin',
  });
  await client.connect();
  await client.query(
    'INSERT INTO users (id, username, password_hash, role, tenant_id, active) VALUES (gen_random_uuid(), $1, $2, $3, $4, true)',
    ['admin', hash, 'admin', 'default']
  );
  console.log('admin 用户创建成功');
  console.log('username: admin');
  console.log('password: admin123');
  await client.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
