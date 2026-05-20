import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantMigrationTasks1747200000000 implements MigrationInterface {
  name = 'AddTenantMigrationTasks1747200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "tenant_migration_tasks" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "scope" VARCHAR(20) NOT NULL DEFAULT 'tenant',
        "tenant_record_id" UUID,
        "tenant_id" VARCHAR(64),
        "source_level" VARCHAR(20),
        "target_level" VARCHAR(20),
        "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
        "step" VARCHAR(80) NOT NULL DEFAULT '等待执行',
        "progress" INTEGER NOT NULL DEFAULT 0,
        "error_message" TEXT,
        "target_db_config" JSONB,
        "precheck_result" JSONB,
        "created_by_id" VARCHAR(64),
        "created_by_name" VARCHAR(64),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_tenant_migration_tasks" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_tenant_migration_tasks_tenant"
      ON "tenant_migration_tasks" ("tenant_id", "created_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_tenant_migration_tasks_tenant"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "tenant_migration_tasks"`);
  }
}
