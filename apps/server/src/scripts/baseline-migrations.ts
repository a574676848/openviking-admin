import 'reflect-metadata';
import dataSource from '../data-source';

const MIGRATIONS_TABLE_NAME = 'migrations';

interface BaselineMigration {
  timestamp: number;
  name: string;
  check: () => Promise<boolean>;
}

async function tableExists(tableName: string) {
  const result = await dataSource.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS "exists"
    `,
    [tableName],
  );

  return result[0]?.exists === true;
}

async function columnExists(tableName: string, columnName: string) {
  const result = await dataSource.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
          AND column_name = $2
      ) AS "exists"
    `,
    [tableName, columnName],
  );

  return result[0]?.exists === true;
}

async function ensureMigrationsTable() {
  await dataSource.query(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE_NAME}" (
      "id" SERIAL NOT NULL,
      "timestamp" BIGINT NOT NULL,
      "name" character varying NOT NULL,
      CONSTRAINT "PK_migrations_id" PRIMARY KEY ("id")
    )
  `);
}

async function findAppliedMigrationNames() {
  const exists = await tableExists(MIGRATIONS_TABLE_NAME);
  if (!exists) {
    return new Set<string>();
  }

  const rows = await dataSource.query(
    `SELECT "name" FROM "${MIGRATIONS_TABLE_NAME}" ORDER BY "timestamp" ASC`,
  );

  return new Set<string>(rows.map((row: { name: string }) => row.name));
}

async function insertMigrationRecord(timestamp: number, name: string) {
  await dataSource.query(
    `
      INSERT INTO "${MIGRATIONS_TABLE_NAME}" ("timestamp", "name")
      VALUES ($1, $2)
    `,
    [timestamp, name],
  );
}

async function main() {
  await dataSource.initialize();

  try {
    await ensureMigrationsTable();

    const appliedNames = await findAppliedMigrationNames();

    const baselineMigrations: BaselineMigration[] = [
      {
        timestamp: 1745000000000,
        name: 'InitSchema1745000000000',
        check: async () =>
          (await tableExists('users')) &&
          (await tableExists('knowledge_bases')) &&
          (await tableExists('import_tasks')) &&
          (await tableExists('search_logs')) &&
          (await tableExists('audit_logs')),
      },
      {
        timestamp: 1745100000000,
        name: 'AddMissingTables1745100000000',
        check: async () =>
          (await tableExists('tenants')) &&
          (await tableExists('knowledge_nodes')) &&
          (await tableExists('system_configs')),
      },
      {
        timestamp: 1745200000000,
        name: 'FixSchemaInconsistencies1745200000000',
        check: async () =>
          (await columnExists('users', 'sso_id')) &&
          (await columnExists('users', 'provider')) &&
          (await columnExists('tenants', 'isolation_level')) &&
          (await columnExists('tenants', 'db_config')) &&
          (await columnExists('tenants', 'ov_config')),
      },
      {
        timestamp: 1746000000000,
        name: 'AddMcpSessions1746000000000',
        check: async () =>
          (await tableExists('mcp_sessions')) &&
          (await tableExists('mcp_session_events')),
      },
      {
        timestamp: 1746100000000,
        name: 'RenameUserMcpKeysToCapabilityKeys1746100000000',
        check: async () => await tableExists('capability_keys'),
      },
      {
        timestamp: 1746200000000,
        name: 'RenameMcpSessionCredentialHash1746200000000',
        check: async () => await columnExists('mcp_sessions', 'credential_hash'),
      },
      {
        timestamp: 1746300000000,
        name: 'AddTenantSoftDelete1746300000000',
        check: async () => await columnExists('tenants', 'deleted_at'),
      },
    ];

    const inserted: string[] = [];
    const alreadyApplied: string[] = [];
    const unmatched: string[] = [];

    for (const migration of baselineMigrations) {
      if (appliedNames.has(migration.name)) {
        alreadyApplied.push(migration.name);
        continue;
      }

      const matched = await migration.check();

      if (!matched) {
        unmatched.push(migration.name);
        continue;
      }

      await insertMigrationRecord(migration.timestamp, migration.name);
      inserted.push(migration.name);
      appliedNames.add(migration.name);
    }

    if (inserted.length === 0) {
      console.log('migration 基线对齐完成：当前数据库无需补登记。');
    } else {
      console.log('migration 基线对齐完成，已补登记以下记录：');
      for (const name of inserted) {
        console.log(`- ${name}`);
      }
    }

    if (alreadyApplied.length > 0) {
      console.log('以下 migration 已存在登记记录：');
      for (const name of alreadyApplied) {
        console.log(`- ${name}`);
      }
    }

    if (unmatched.length > 0) {
      console.log('以下 migration 因当前库结构不匹配，未做基线登记：');
      for (const name of unmatched) {
        console.log(`- ${name}`);
      }
    }
  } finally {
    await dataSource.destroy();
  }
}

void main().catch(async (error) => {
  console.error('migration 基线对齐失败：', error);
  if (dataSource.isInitialized) {
    await dataSource.destroy();
  }
  process.exitCode = 1;
});
