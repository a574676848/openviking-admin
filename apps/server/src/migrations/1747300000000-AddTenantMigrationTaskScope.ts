import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantMigrationTaskScope1747300000000 implements MigrationInterface {
  name = 'AddTenantMigrationTaskScope1747300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenant_migration_tasks"
      ADD COLUMN IF NOT EXISTS "scope" VARCHAR(20) NOT NULL DEFAULT 'tenant'
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_migration_tasks"
      ALTER COLUMN "tenant_record_id" DROP NOT NULL,
      ALTER COLUMN "tenant_id" DROP NOT NULL,
      ALTER COLUMN "source_level" DROP NOT NULL,
      ALTER COLUMN "target_level" DROP NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "tenant_migration_tasks"
      SET "scope" = 'tenant'
      WHERE "scope" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_migration_tasks"
      ALTER COLUMN "tenant_record_id" SET NOT NULL,
      ALTER COLUMN "tenant_id" SET NOT NULL,
      ALTER COLUMN "source_level" SET NOT NULL,
      ALTER COLUMN "target_level" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "tenant_migration_tasks"
      DROP COLUMN IF EXISTS "scope"
    `);
  }
}
