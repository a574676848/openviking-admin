import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitSchema1745000000000 implements MigrationInterface {
  name = 'InitSchema1745000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"            UUID NOT NULL DEFAULT uuid_generate_v4(),
        "username"      VARCHAR(64) NOT NULL,
        "password_hash" VARCHAR(255) NOT NULL,
        "role"          VARCHAR(30) NOT NULL DEFAULT 'tenant_viewer',
        "tenant_id"     VARCHAR(64),
        "active"        BOOLEAN NOT NULL DEFAULT true,
        "sso_id"        VARCHAR(128),
        "provider"      VARCHAR(32),
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_username" UNIQUE ("username")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "knowledge_bases" (
        "id"           UUID NOT NULL DEFAULT uuid_generate_v4(),
        "name"         VARCHAR(100) NOT NULL,
        "description"  TEXT,
        "tenant_id"    VARCHAR(64) NOT NULL,
        "status"       VARCHAR(20) NOT NULL DEFAULT 'active',
        "viking_uri"   VARCHAR(512),
        "doc_count"    INTEGER NOT NULL DEFAULT 0,
        "vector_count" INTEGER NOT NULL DEFAULT 0,
        "created_at"   TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_knowledge_bases" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "import_tasks" (
        "id"          UUID NOT NULL DEFAULT uuid_generate_v4(),
        "kb_id"       UUID NOT NULL,
        "source_type" VARCHAR(20) NOT NULL,
        "source_url"  VARCHAR(2048),
        "target_uri"  VARCHAR(2048) NOT NULL,
        "status"      VARCHAR(20) NOT NULL DEFAULT 'pending',
        "node_count"  INTEGER NOT NULL DEFAULT 0,
        "vector_count" INTEGER NOT NULL DEFAULT 0,
        "error_msg"   TEXT,
        "created_at"  TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"  TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_import_tasks" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "search_logs" (
        "id"           UUID NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id"    VARCHAR(64),
        "query"        TEXT NOT NULL,
        "scope"        VARCHAR(2048),
        "result_count" INTEGER NOT NULL DEFAULT 0,
        "score_max"    FLOAT NOT NULL DEFAULT 0,
        "latency_ms"   INTEGER NOT NULL DEFAULT 0,
        "created_at"   TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_search_logs" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"         UUID NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id"  VARCHAR(64),
        "user_id"    UUID,
        "action"     VARCHAR(100) NOT NULL,
        "resource"   VARCHAR(512),
        "detail"     JSONB,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_audit_logs" PRIMARY KEY ("id")
      )
    `);

    // 索引
    await queryRunner.query(
      `CREATE INDEX "idx_kb_tenant" ON "knowledge_bases" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_import_task_kb" ON "import_tasks" ("kb_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_search_log_tenant" ON "search_logs" ("tenant_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_audit_log_tenant" ON "audit_logs" ("tenant_id")`,
    );

    // 初始管理员账号 (密码: Admin@2026)
    await queryRunner.query(`
      INSERT INTO "users" ("username", "password_hash", "role")
      VALUES ('admin', '$2b$10$MPKX/woij0we1gqVnbEX0.VsfiV8OGXoU6L1/ghVkuqsmZepx5OIK', 'super_admin')
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "search_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "import_tasks"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_bases"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_nodes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "system_configs"`);
  }
}
