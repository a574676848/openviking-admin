import 'dotenv/config';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import dataSource from '../data-source';

type TenantRow = {
  tenantId: string;
  isolationLevel: string;
  dbConfig: {
    host?: string;
    port?: number;
    username?: string;
    password?: string;
    database?: string;
  } | null;
};

const KNOWLEDGE_NODE_TABLE = 'knowledge_nodes';
const KIND_COLUMN = 'kind';
const CONTENT_URI_COLUMN = 'content_uri';

async function resolveTargetSchemas(queryRunner: DataSource) {
  const rows = (await queryRunner.query(`
    SELECT table_schema
    FROM information_schema.tables
    WHERE table_name = '${KNOWLEDGE_NODE_TABLE}'
      AND (
        table_schema = 'public'
        OR table_schema LIKE 'tenant\\_%' ESCAPE '\\'
      )
    GROUP BY table_schema
    ORDER BY table_schema
  `)) as Array<{ table_schema: string }>;

  return rows.map((row) => row.table_schema);
}

async function applyKnowledgeNodeColumns(
  targetDataSource: DataSource,
  schemas: string[],
) {
  for (const schema of schemas) {
    await targetDataSource.query(`
      ALTER TABLE "${schema}"."${KNOWLEDGE_NODE_TABLE}"
      ADD COLUMN IF NOT EXISTS "${KIND_COLUMN}" VARCHAR(20)
    `);
    await targetDataSource.query(`
      ALTER TABLE "${schema}"."${KNOWLEDGE_NODE_TABLE}"
      ADD COLUMN IF NOT EXISTS "${CONTENT_URI_COLUMN}" VARCHAR(2048)
    `);
    await targetDataSource.query(`
      UPDATE "${schema}"."${KNOWLEDGE_NODE_TABLE}"
      SET "${KIND_COLUMN}" = CASE
        WHEN "viking_uri" IS NULL OR "viking_uri" LIKE '%/' THEN 'collection'
        ELSE 'document'
      END
      WHERE "${KIND_COLUMN}" IS NULL
    `);
    await targetDataSource.query(`
      UPDATE "${schema}"."${KNOWLEDGE_NODE_TABLE}"
      SET "${CONTENT_URI_COLUMN}" = "viking_uri"
      WHERE "${CONTENT_URI_COLUMN}" IS NULL
        AND "${KIND_COLUMN}" = 'document'
        AND "viking_uri" IS NOT NULL
    `);
  }
}

async function migrateLargeTenantDatabase(tenant: TenantRow) {
  if (!tenant.dbConfig?.database) {
    console.log(`跳过 LARGE 租户 ${tenant.tenantId}：缺少 dbConfig.database`);
    return;
  }

  const tenantDataSource = new DataSource({
    type: 'postgres',
    host: tenant.dbConfig.host,
    port: Number(tenant.dbConfig.port) || 5432,
    username: tenant.dbConfig.username,
    password: tenant.dbConfig.password,
    database: tenant.dbConfig.database,
    synchronize: false,
    logging: false,
  });

  await tenantDataSource.initialize();
  try {
    const schemas = await resolveTargetSchemas(tenantDataSource);
    const targetSchemas = schemas.includes('public') ? ['public'] : schemas;
    await applyKnowledgeNodeColumns(tenantDataSource, targetSchemas);
    console.log(
      `LARGE 租户 ${tenant.tenantId} 独立库迁移完成: ${tenant.dbConfig.database}`,
    );
  } finally {
    await tenantDataSource.destroy();
  }
}

async function main() {
  await dataSource.initialize();

  try {
    const schemas = await resolveTargetSchemas(dataSource);
    await applyKnowledgeNodeColumns(dataSource, schemas);
    console.log(`主库与 schema 迁移完成: ${schemas.join(', ')}`);

    const tenants = (await dataSource.query(`
      SELECT tenant_id AS "tenantId",
             isolation_level AS "isolationLevel",
             db_config AS "dbConfig"
      FROM tenants
      WHERE status = 'active'
        AND isolation_level = 'large'
    `)) as TenantRow[];

    for (const tenant of tenants) {
      await migrateLargeTenantDatabase(tenant);
    }
  } finally {
    await dataSource.destroy();
  }
}

void main().catch((error) => {
  console.error('知识节点 kind/contentUri 迁移失败：', error);
  process.exitCode = 1;
});
