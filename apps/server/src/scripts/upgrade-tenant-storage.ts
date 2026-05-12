import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { DataSource } from 'typeorm';

type TenantIsolationLevelValue = 'small' | 'medium' | 'large';

interface DbConfig {
  host?: string;
  port?: number | string;
  username?: string;
  password?: string;
  database?: string;
}

interface TenantRow {
  tenantId: string;
  isolationLevel: TenantIsolationLevelValue;
  dbConfig: DbConfig | null;
}

interface CliOptions {
  envPath?: string;
  dbHost?: string;
  dbPort?: number;
  dbUser?: string;
  dbPass?: string;
  dbName?: string;
  dryRun: boolean;
  help: boolean;
}

interface UpgradeContext {
  dryRun: boolean;
  label: string;
}

const DEFAULT_ENV_PATH = resolve(__dirname, '../../.env');
const DEFAULT_DB_PORT = 5432;
const DEFAULT_DB_USER = 'postgres';
const DEFAULT_DB_NAME = 'openviking_admin';
const TENANT_SCHEMA_PREFIX = 'tenant_';
const UUID_EXTENSION_SQL = 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp"';

const IMPORT_TASKS_TABLE = 'import_tasks';
const KNOWLEDGE_NODES_TABLE = 'knowledge_nodes';
const INTEGRATIONS_TABLE = 'integrations';
const SOURCE_NAME_MAX_LENGTH = 255;
const NODE_KIND_MAX_LENGTH = 20;
const CONTENT_URI_MAX_LENGTH = 2048;
const INTEGRATION_NAME_MAX_LENGTH = 64;
const INTEGRATION_TYPE_MAX_LENGTH = 32;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const envValues = loadEnvValues(options.envPath);
  const controlDbConfig = resolveControlDbConfig(options, envValues);
  const controlDataSource = createDataSource(controlDbConfig);

  await controlDataSource.initialize();
  try {
    await ensureUuidExtension(controlDataSource, {
      dryRun: options.dryRun,
      label: '控制库',
    });

    const tenants = await loadTenantRows(controlDataSource);
    const targetTenants = tenants.filter(
      (tenant) =>
        tenant.isolationLevel === 'medium' || tenant.isolationLevel === 'large',
    );

    console.log(
      `发现 ${targetTenants.length} 个需要检查的租户：${targetTenants
        .map((tenant) => tenant.tenantId)
        .join(', ')}`,
    );

    for (const tenant of targetTenants) {
      if (tenant.isolationLevel === 'medium') {
        await upgradeMediumTenant(controlDataSource, tenant, options.dryRun);
        continue;
      }

      await upgradeLargeTenant(tenant, controlDbConfig, options.dryRun);
    }

    console.log(
      options.dryRun ? '租户存储升级预检完成。' : '租户存储升级完成。',
    );
  } finally {
    await controlDataSource.destroy();
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    dryRun: false,
    help: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    switch (arg) {
      case '--':
        break;
      case '--env':
      case '--env-file':
        options.envPath = readOptionValue(args, index, arg);
        index += 1;
        break;
      case '--db-host':
        options.dbHost = readOptionValue(args, index, arg);
        index += 1;
        break;
      case '--db-port':
        options.dbPort = Number(readOptionValue(args, index, arg));
        index += 1;
        break;
      case '--db-user':
        options.dbUser = readOptionValue(args, index, arg);
        index += 1;
        break;
      case '--db-pass':
        options.dbPass = readOptionValue(args, index, arg);
        index += 1;
        break;
      case '--db-name':
        options.dbName = readOptionValue(args, index, arg);
        index += 1;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`未知参数：${arg}`);
    }
  }

  if (options.dbPort !== undefined && Number.isNaN(options.dbPort)) {
    throw new Error('--db-port 必须是数字。');
  }

  return options;
}

function readOptionValue(args: string[], index: number, optionName: string) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} 缺少参数值。`);
  }

  return value;
}

function printHelp() {
  console.log(`
用法：
  pnpm tenant-storage:upgrade -- --env apps/server/.env
  pnpm tenant-storage:upgrade -- --db-host 127.0.0.1 --db-port 5432 --db-user postgres --db-pass secret --db-name openviking_admin

参数：
  --env, --env-file <path>  从指定 .env 文件读取 openviking_admin 控制库连接
  --db-host <host>          控制库主机
  --db-port <port>          控制库端口，默认 5432
  --db-user <user>          控制库用户名，默认 postgres
  --db-pass <password>      控制库密码
  --db-name <database>      控制库名称，默认 openviking_admin
  --dry-run                 只打印将执行的 DDL，不写入数据库
`);
}

function loadEnvValues(envPath?: string) {
  const resolvedEnvPath = resolveEnvPath(envPath);
  if (!resolvedEnvPath) {
    return new Map<string, string>();
  }

  const values = new Map<string, string>();
  const lines = readFileSync(resolvedEnvPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(
      /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/,
    );
    if (!match) {
      continue;
    }

    values.set(match[1], normalizeEnvValue(match[2]));
  }

  console.log(`读取数据库配置文件：${resolvedEnvPath}`);
  return values;
}

function resolveEnvPath(envPath?: string) {
  if (envPath) {
    const resolved = resolveInputPath(envPath);
    if (!existsSync(resolved)) {
      throw new Error(`指定的 .env 文件不存在：${resolved}`);
    }
    return resolved;
  }

  return existsSync(DEFAULT_ENV_PATH) ? DEFAULT_ENV_PATH : null;
}

function resolveInputPath(inputPath: string) {
  if (isAbsolute(inputPath)) {
    return inputPath;
  }

  return resolve(process.env.INIT_CWD ?? process.cwd(), inputPath);
}

function normalizeEnvValue(rawValue: string) {
  const trimmed = rawValue.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function resolveControlDbConfig(
  options: CliOptions,
  envValues: Map<string, string>,
): Required<DbConfig> {
  const config = {
    host:
      options.dbHost ??
      envValues.get('DB_HOST') ??
      envValues.get('OPENVIKING_DB_HOST') ??
      process.env.DB_HOST ??
      process.env.OPENVIKING_DB_HOST,
    port:
      options.dbPort ??
      Number(
        envValues.get('DB_PORT') ??
          envValues.get('OPENVIKING_DB_PORT') ??
          process.env.DB_PORT ??
          process.env.OPENVIKING_DB_PORT ??
          DEFAULT_DB_PORT,
      ),
    username:
      options.dbUser ??
      envValues.get('DB_USER') ??
      envValues.get('OPENVIKING_DB_USER') ??
      process.env.DB_USER ??
      process.env.OPENVIKING_DB_USER ??
      DEFAULT_DB_USER,
    password:
      options.dbPass ??
      envValues.get('DB_PASS') ??
      envValues.get('OPENVIKING_DB_PASS') ??
      process.env.DB_PASS ??
      process.env.OPENVIKING_DB_PASS ??
      '',
    database:
      options.dbName ??
      envValues.get('DB_NAME') ??
      envValues.get('OPENVIKING_DB_NAME') ??
      process.env.DB_NAME ??
      process.env.OPENVIKING_DB_NAME ??
      DEFAULT_DB_NAME,
  };

  if (!config.host) {
    throw new Error('缺少控制库 DB_HOST，请传入 --db-host 或 --env。');
  }

  if (Number.isNaN(config.port)) {
    throw new Error('控制库 DB_PORT 不是有效数字。');
  }

  return config as Required<DbConfig>;
}

function createDataSource(config: Required<DbConfig>) {
  return new DataSource({
    type: 'postgres',
    host: config.host,
    port: Number(config.port) || DEFAULT_DB_PORT,
    username: config.username,
    password: config.password,
    database: config.database,
    synchronize: false,
    logging: false,
  });
}

async function loadTenantRows(dataSource: DataSource): Promise<TenantRow[]> {
  const hasDeletedAt = await columnExists(
    dataSource,
    'public',
    'tenants',
    'deleted_at',
  );
  const deletedFilter = hasDeletedAt ? 'WHERE "deleted_at" IS NULL' : '';
  const rows = (await dataSource.query(`
    SELECT "tenant_id" AS "tenantId",
           "isolation_level" AS "isolationLevel",
           "db_config" AS "dbConfig"
    FROM "tenants"
    ${deletedFilter}
    ORDER BY "tenant_id"
  `)) as TenantRow[];

  return rows;
}

async function upgradeMediumTenant(
  dataSource: DataSource,
  tenant: TenantRow,
  dryRun: boolean,
) {
  const schema = resolveTenantSchemaName(tenant.tenantId);
  const context = {
    dryRun,
    label: `MEDIUM 租户 ${tenant.tenantId} schema ${schema}`,
  };

  if (!(await schemaExists(dataSource, schema))) {
    console.warn(`${context.label} 不存在，已跳过。`);
    return;
  }

  await upgradeSchemaStorage(dataSource, schema, context);
}

async function upgradeLargeTenant(
  tenant: TenantRow,
  controlDbConfig: Required<DbConfig>,
  dryRun: boolean,
) {
  if (!tenant.dbConfig?.database) {
    console.warn(
      `LARGE 租户 ${tenant.tenantId} 缺少 dbConfig.database，已跳过。`,
    );
    return;
  }

  const tenantDbConfig = {
    host: tenant.dbConfig.host ?? controlDbConfig.host,
    port: Number(tenant.dbConfig.port ?? controlDbConfig.port),
    username: tenant.dbConfig.username ?? controlDbConfig.username,
    password: tenant.dbConfig.password ?? controlDbConfig.password,
    database: tenant.dbConfig.database,
  };
  const tenantDataSource = createDataSource(tenantDbConfig);
  const context = {
    dryRun,
    label: `LARGE 租户 ${tenant.tenantId} 独立库 ${tenantDbConfig.database}`,
  };

  await tenantDataSource.initialize();
  try {
    await ensureUuidExtension(tenantDataSource, context);
    await upgradeSchemaStorage(tenantDataSource, 'public', context);
  } finally {
    await tenantDataSource.destroy();
  }
}

function resolveTenantSchemaName(tenantId: string) {
  return `${TENANT_SCHEMA_PREFIX}${tenantId.replace(/-/g, '_')}`;
}

async function upgradeSchemaStorage(
  dataSource: DataSource,
  schema: string,
  context: UpgradeContext,
) {
  console.log(`开始升级：${context.label}`);
  await ensureImportTasks(dataSource, schema, context);
  await ensureKnowledgeNodes(dataSource, schema, context);
  await ensureIntegrations(dataSource, schema, context);
  console.log(`完成升级：${context.label}`);
}

async function ensureUuidExtension(
  dataSource: DataSource,
  context: UpgradeContext,
) {
  await runSql(dataSource, context, UUID_EXTENSION_SQL);
}

async function ensureImportTasks(
  dataSource: DataSource,
  schema: string,
  context: UpgradeContext,
) {
  if (!(await tableExists(dataSource, schema, IMPORT_TASKS_TABLE))) {
    console.warn(`${context.label} 缺少 ${IMPORT_TASKS_TABLE} 表，已跳过。`);
    return;
  }

  await runSql(
    dataSource,
    context,
    `
      ALTER TABLE ${tableName(schema, IMPORT_TASKS_TABLE)}
      ADD COLUMN IF NOT EXISTS "tenant_id" VARCHAR
    `,
  );
  await runSql(
    dataSource,
    context,
    `
      ALTER TABLE ${tableName(schema, IMPORT_TASKS_TABLE)}
      ADD COLUMN IF NOT EXISTS "integration_id" VARCHAR
    `,
  );
  await runSql(
    dataSource,
    context,
    `
      ALTER TABLE ${tableName(schema, IMPORT_TASKS_TABLE)}
      ADD COLUMN IF NOT EXISTS "source_name" VARCHAR(${SOURCE_NAME_MAX_LENGTH})
    `,
  );

  if (
    await columnExists(
      dataSource,
      schema,
      IMPORT_TASKS_TABLE,
      'original_file_name',
    )
  ) {
    await runSql(
      dataSource,
      context,
      `
        UPDATE ${tableName(schema, IMPORT_TASKS_TABLE)}
        SET "source_name" = COALESCE("source_name", "original_file_name")
        WHERE "source_name" IS NULL
      `,
    );
  }
}

async function ensureKnowledgeNodes(
  dataSource: DataSource,
  schema: string,
  context: UpgradeContext,
) {
  if (!(await tableExists(dataSource, schema, KNOWLEDGE_NODES_TABLE))) {
    console.warn(`${context.label} 缺少 ${KNOWLEDGE_NODES_TABLE} 表，已跳过。`);
    return;
  }

  await runSql(
    dataSource,
    context,
    `
      ALTER TABLE ${tableName(schema, KNOWLEDGE_NODES_TABLE)}
      ADD COLUMN IF NOT EXISTS "tenant_id" VARCHAR
    `,
  );
  await runSql(
    dataSource,
    context,
    `
      ALTER TABLE ${tableName(schema, KNOWLEDGE_NODES_TABLE)}
      ADD COLUMN IF NOT EXISTS "kind" VARCHAR(${NODE_KIND_MAX_LENGTH})
    `,
  );
  await runSql(
    dataSource,
    context,
    `
      ALTER TABLE ${tableName(schema, KNOWLEDGE_NODES_TABLE)}
      ADD COLUMN IF NOT EXISTS "content_uri" VARCHAR(${CONTENT_URI_MAX_LENGTH})
    `,
  );

  if (
    await columnExists(dataSource, schema, KNOWLEDGE_NODES_TABLE, 'viking_uri')
  ) {
    await backfillKnowledgeNodeContent(dataSource, schema, context);
  }

  await ensureKnowledgeNodeAclJsonb(dataSource, schema, context);
}

async function backfillKnowledgeNodeContent(
  dataSource: DataSource,
  schema: string,
  context: UpgradeContext,
) {
  await runSql(
    dataSource,
    context,
    `
      UPDATE ${tableName(schema, KNOWLEDGE_NODES_TABLE)}
      SET "kind" = CASE
        WHEN "viking_uri" IS NULL OR "viking_uri" LIKE '%/' THEN 'collection'
        ELSE 'document'
      END
      WHERE "kind" IS NULL
    `,
  );
  await runSql(
    dataSource,
    context,
    `
      UPDATE ${tableName(schema, KNOWLEDGE_NODES_TABLE)}
      SET "content_uri" = "viking_uri"
      WHERE "content_uri" IS NULL
        AND "kind" = 'document'
        AND "viking_uri" IS NOT NULL
    `,
  );
}

async function ensureKnowledgeNodeAclJsonb(
  dataSource: DataSource,
  schema: string,
  context: UpgradeContext,
) {
  const rows = (await dataSource.query(
    `
      SELECT data_type
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = 'acl'
    `,
    [schema, KNOWLEDGE_NODES_TABLE],
  )) as Array<{ data_type: string }>;

  if (!rows[0] || rows[0].data_type === 'jsonb') {
    return;
  }

  await runSql(
    dataSource,
    context,
    `
      CREATE OR REPLACE FUNCTION pg_temp.openviking_try_parse_jsonb(value TEXT)
      RETURNS JSONB AS $$
      BEGIN
        RETURN value::jsonb;
      EXCEPTION WHEN others THEN
        RETURN to_jsonb(value);
      END;
      $$ LANGUAGE plpgsql
    `,
  );
  await runSql(
    dataSource,
    context,
    `
      ALTER TABLE ${tableName(schema, KNOWLEDGE_NODES_TABLE)}
      ALTER COLUMN "acl" TYPE JSONB
      USING CASE
        WHEN "acl" IS NULL OR btrim("acl"::text) = '' THEN NULL
        ELSE pg_temp.openviking_try_parse_jsonb("acl"::text)
      END
    `,
  );
}

async function ensureIntegrations(
  dataSource: DataSource,
  schema: string,
  context: UpgradeContext,
) {
  await runSql(
    dataSource,
    context,
    `
      CREATE TABLE IF NOT EXISTS ${tableName(schema, INTEGRATIONS_TABLE)} (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" VARCHAR NOT NULL,
        "name" VARCHAR(${INTEGRATION_NAME_MAX_LENGTH}) NOT NULL,
        "type" VARCHAR(${INTEGRATION_TYPE_MAX_LENGTH}) NOT NULL,
        "credentials" JSONB NOT NULL DEFAULT '{}',
        "config" JSONB,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_integrations" PRIMARY KEY ("id")
      )
    `,
  );
}

async function schemaExists(dataSource: DataSource, schema: string) {
  const rows = (await dataSource.query(
    `
      SELECT 1
      FROM information_schema.schemata
      WHERE schema_name = $1
      LIMIT 1
    `,
    [schema],
  )) as Array<Record<string, unknown>>;

  return rows.length > 0;
}

async function tableExists(
  dataSource: DataSource,
  schema: string,
  table: string,
) {
  const rows = (await dataSource.query(
    `
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = $1
        AND table_name = $2
      LIMIT 1
    `,
    [schema, table],
  )) as Array<Record<string, unknown>>;

  return rows.length > 0;
}

async function columnExists(
  dataSource: DataSource,
  schema: string,
  table: string,
  column: string,
) {
  const rows = (await dataSource.query(
    `
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = $1
        AND table_name = $2
        AND column_name = $3
      LIMIT 1
    `,
    [schema, table, column],
  )) as Array<Record<string, unknown>>;

  return rows.length > 0;
}

async function runSql(
  dataSource: DataSource,
  context: UpgradeContext,
  sql: string,
) {
  const normalizedSql = normalizeSql(sql);
  if (context.dryRun) {
    console.log(`[dry-run] ${context.label}: ${normalizedSql}`);
    return;
  }

  await dataSource.query(sql);
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, ' ').trim();
}

function tableName(schema: string, table: string) {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`租户存储升级失败：${message}`);
  process.exit(1);
});
