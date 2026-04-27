import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTenantSoftDelete1746300000000 implements MigrationInterface {
  name = 'AddTenantSoftDelete1746300000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
      ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "tenants"
      DROP COLUMN IF EXISTS "deleted_at"
    `);
  }
}
