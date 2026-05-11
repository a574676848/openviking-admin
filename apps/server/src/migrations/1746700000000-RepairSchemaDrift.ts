import { MigrationInterface, QueryRunner } from 'typeorm';

const AUDIT_LOGS_TABLE = 'audit_logs';
const IMPORT_TASKS_TABLE = 'import_tasks';
const INTEGRATIONS_TABLE = 'integrations';
const KNOWLEDGE_NODES_TABLE = 'knowledge_nodes';
const SEARCH_LOGS_TABLE = 'search_logs';
const LEGACY_RESOURCE_COLUMN = 'resource';
const LEGACY_DETAIL_COLUMN = 'detail';

export class RepairSchemaDrift1746700000000 implements MigrationInterface {
  name = 'RepairSchemaDrift1746700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await this.repairAuditLogs(queryRunner);
    await this.ensureIntegrationsTable(queryRunner);
    await this.repairBusinessTables(queryRunner);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_audit_logs_tenant_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_audit_logs_action_created"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_audit_logs_user_created"`,
    );
    await queryRunner.query(`
      ALTER TABLE "${AUDIT_LOGS_TABLE}"
      DROP COLUMN IF EXISTS "success",
      DROP COLUMN IF EXISTS "ip",
      DROP COLUMN IF EXISTS "meta",
      DROP COLUMN IF EXISTS "target",
      DROP COLUMN IF EXISTS "username"
    `);
  }

  private async repairAuditLogs(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "${AUDIT_LOGS_TABLE}"
      ADD COLUMN IF NOT EXISTS "username" VARCHAR(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "${AUDIT_LOGS_TABLE}"
      ADD COLUMN IF NOT EXISTS "target" VARCHAR(512)
    `);
    await queryRunner.query(`
      ALTER TABLE "${AUDIT_LOGS_TABLE}"
      ADD COLUMN IF NOT EXISTS "meta" JSONB
    `);
    await queryRunner.query(`
      ALTER TABLE "${AUDIT_LOGS_TABLE}"
      ADD COLUMN IF NOT EXISTS "ip" VARCHAR(255)
    `);
    await queryRunner.query(`
      ALTER TABLE "${AUDIT_LOGS_TABLE}"
      ADD COLUMN IF NOT EXISTS "success" BOOLEAN NOT NULL DEFAULT true
    `);
    await this.backfillAuditLegacyColumns(queryRunner);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_logs_user_created"
      ON "${AUDIT_LOGS_TABLE}" ("user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_logs_action_created"
      ON "${AUDIT_LOGS_TABLE}" ("action", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_audit_logs_tenant_created"
      ON "${AUDIT_LOGS_TABLE}" ("tenant_id", "created_at")
    `);
  }

  private async backfillAuditLegacyColumns(
    queryRunner: QueryRunner,
  ): Promise<void> {
    const hasResourceColumn = await queryRunner.hasColumn(
      AUDIT_LOGS_TABLE,
      LEGACY_RESOURCE_COLUMN,
    );
    const hasDetailColumn = await queryRunner.hasColumn(
      AUDIT_LOGS_TABLE,
      LEGACY_DETAIL_COLUMN,
    );

    if (hasResourceColumn) {
      await queryRunner.query(`
        UPDATE "${AUDIT_LOGS_TABLE}"
        SET "target" = COALESCE("target", "${LEGACY_RESOURCE_COLUMN}")
        WHERE "target" IS NULL
      `);
    }

    if (hasDetailColumn) {
      await queryRunner.query(`
        UPDATE "${AUDIT_LOGS_TABLE}"
        SET "meta" = COALESCE("meta", "${LEGACY_DETAIL_COLUMN}")
        WHERE "meta" IS NULL
      `);
    }
  }

  private async ensureIntegrationsTable(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "${INTEGRATIONS_TABLE}" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id" VARCHAR NOT NULL,
        "name" VARCHAR(64) NOT NULL,
        "type" VARCHAR(32) NOT NULL,
        "credentials" JSONB NOT NULL DEFAULT '{}',
        "config" JSONB,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_integrations" PRIMARY KEY ("id")
      )
    `);

    const tenantSchemas = await this.resolveTenantSchemas(queryRunner);
    for (const schema of tenantSchemas) {
      await queryRunner.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName(schema, INTEGRATIONS_TABLE)}
        (LIKE "public"."${INTEGRATIONS_TABLE}" INCLUDING ALL)
      `);
    }
  }

  private async repairBusinessTables(queryRunner: QueryRunner): Promise<void> {
    const importTaskSchemas = await this.resolveSchemasWithTable(
      queryRunner,
      IMPORT_TASKS_TABLE,
    );
    for (const schema of importTaskSchemas) {
      await queryRunner.query(`
        ALTER TABLE ${this.tableName(schema, IMPORT_TASKS_TABLE)}
        ADD COLUMN IF NOT EXISTS "tenant_id" VARCHAR
      `);
      await queryRunner.query(`
        ALTER TABLE ${this.tableName(schema, IMPORT_TASKS_TABLE)}
        ADD COLUMN IF NOT EXISTS "integration_id" VARCHAR
      `);
      await queryRunner.query(`
        ALTER TABLE ${this.tableName(schema, IMPORT_TASKS_TABLE)}
        ADD COLUMN IF NOT EXISTS "source_name" VARCHAR(255)
      `);
    }

    const knowledgeNodeSchemas = await this.resolveSchemasWithTable(
      queryRunner,
      KNOWLEDGE_NODES_TABLE,
    );
    for (const schema of knowledgeNodeSchemas) {
      await queryRunner.query(`
        ALTER TABLE ${this.tableName(schema, KNOWLEDGE_NODES_TABLE)}
        ADD COLUMN IF NOT EXISTS "tenant_id" VARCHAR
      `);
      await this.ensureKnowledgeNodeAclJsonb(queryRunner, schema);
    }

    const searchLogSchemas = await this.resolveSchemasWithTable(
      queryRunner,
      SEARCH_LOGS_TABLE,
    );
    for (const schema of searchLogSchemas) {
      await queryRunner.query(`
        ALTER TABLE ${this.tableName(schema, SEARCH_LOGS_TABLE)}
        ADD COLUMN IF NOT EXISTS "feedback" VARCHAR(20)
      `);
      await queryRunner.query(`
        ALTER TABLE ${this.tableName(schema, SEARCH_LOGS_TABLE)}
        ADD COLUMN IF NOT EXISTS "feedback_note" TEXT
      `);
      await queryRunner.query(`
        ALTER TABLE ${this.tableName(schema, SEARCH_LOGS_TABLE)}
        ADD COLUMN IF NOT EXISTS "meta" JSONB
      `);
    }
  }

  private async ensureKnowledgeNodeAclJsonb(
    queryRunner: QueryRunner,
    schema: string,
  ): Promise<void> {
    const rows = (await queryRunner.query(
      `
        SELECT data_type
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = 'acl'
      `,
      [schema, KNOWLEDGE_NODES_TABLE],
    )) as Array<{ data_type: string }>;

    if (rows[0]?.data_type === 'jsonb') {
      return;
    }

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION pg_temp.openviking_try_parse_jsonb(value TEXT)
      RETURNS JSONB AS $$
      BEGIN
        RETURN value::jsonb;
      EXCEPTION WHEN others THEN
        RETURN to_jsonb(value);
      END;
      $$ LANGUAGE plpgsql
    `);

    await queryRunner.query(`
      ALTER TABLE ${this.tableName(schema, KNOWLEDGE_NODES_TABLE)}
      ALTER COLUMN "acl" TYPE JSONB
      USING CASE
        WHEN "acl" IS NULL OR btrim("acl"::text) = '' THEN NULL
        ELSE pg_temp.openviking_try_parse_jsonb("acl"::text)
      END
    `);
  }

  private async resolveTenantSchemas(queryRunner: QueryRunner): Promise<string[]> {
    const rows = (await queryRunner.query(`
      SELECT schema_name
      FROM information_schema.schemata
      WHERE schema_name LIKE 'tenant\\_%' ESCAPE '\\'
      ORDER BY schema_name
    `)) as Array<{ schema_name: string }>;

    return rows.map((row) => row.schema_name);
  }

  private async resolveSchemasWithTable(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<string[]> {
    const rows = (await queryRunner.query(
      `
        SELECT table_schema
        FROM information_schema.tables
        WHERE table_name = $1
          AND (
            table_schema = 'public'
            OR table_schema LIKE 'tenant\\_%' ESCAPE '\\'
          )
        ORDER BY table_schema
      `,
      [tableName],
    )) as Array<{ table_schema: string }>;

    return rows.map((row) => row.table_schema);
  }

  private tableName(schema: string, table: string): string {
    return `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(table)}`;
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
