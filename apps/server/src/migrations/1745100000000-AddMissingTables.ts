import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissingTables1745100000000 implements MigrationInterface {
  name = 'AddMissingTables1745100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // tenants 表
    await queryRunner.query(`
      CREATE TABLE "tenants" (
        "id"            UUID NOT NULL DEFAULT uuid_generate_v4(),
        "tenant_id"     VARCHAR(64) NOT NULL,
        "display_name"  VARCHAR(128) NOT NULL,
        "status"        VARCHAR(20) NOT NULL DEFAULT 'active',
        "isolation_level" VARCHAR(20) NOT NULL DEFAULT 'small',
        "db_config"     JSONB,
        "ov_config"     JSONB,
        "viking_account" VARCHAR(128),
        "quota"         JSONB,
        "description"   TEXT,
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_tenants" PRIMARY KEY ("id"),
        CONSTRAINT "uq_tenants_tenant_id" UNIQUE ("tenant_id")
      )
    `);

    // knowledge_nodes 表
    await queryRunner.query(`
      CREATE TABLE "knowledge_nodes" (
        "id"            UUID NOT NULL DEFAULT uuid_generate_v4(),
        "kb_id"         UUID NOT NULL,
        "parent_id"     UUID,
        "name"          VARCHAR(200) NOT NULL,
        "path"          TEXT,
        "sort_order"    INTEGER NOT NULL DEFAULT 0,
        "acl"           VARCHAR(255),
        "viking_uri"    VARCHAR(512),
        "created_at"    TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_knowledge_nodes" PRIMARY KEY ("id")
      )
    `);

    // system_configs 表
    await queryRunner.query(`
      CREATE TABLE "system_configs" (
        "key"           VARCHAR(128) NOT NULL,
        "value"         TEXT NOT NULL,
        "description"   TEXT,
        "updated_at"    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_system_configs" PRIMARY KEY ("key")
      )
    `);

    // 索引
    await queryRunner.query(
      `CREATE INDEX "idx_kn_kb" ON "knowledge_nodes" ("kb_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_kn_parent" ON "knowledge_nodes" ("parent_id")`,
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_kn_parent"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_kn_kb"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "system_configs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "knowledge_nodes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "tenants"`);
  }
}
