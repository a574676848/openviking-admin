import { MigrationInterface, QueryRunner } from 'typeorm';

export class ScopeUsernamesPerTenant1746400000000
  implements MigrationInterface
{
  name = 'ScopeUsernamesPerTenant1746400000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "uq_users_username"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_fe0bb3f6520ee0469504521e710"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_users_platform_username"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_users_tenant_username"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_users_platform_username"
      ON "users" ("username")
      WHERE "tenant_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_users_tenant_username"
      ON "users" ("tenant_id", "username")
      WHERE "tenant_id" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_users_tenant_username"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_users_platform_username"`,
    );
    await queryRunner.query(`
      ALTER TABLE "users"
      ADD CONSTRAINT "uq_users_username" UNIQUE ("username")
    `);
  }
}
