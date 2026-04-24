import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixSchemaInconsistencies1745200000000 implements MigrationInterface {
  name = 'FixSchemaInconsistencies1745200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. 修复 users 表
    const usersTable = await queryRunner.getTable('users');
    if (usersTable) {
      if (!usersTable.findColumnByName('sso_id')) {
        await queryRunner.query(
          `ALTER TABLE "users" ADD COLUMN "sso_id" VARCHAR(128)`,
        );
      }
      if (!usersTable.findColumnByName('provider')) {
        await queryRunner.query(
          `ALTER TABLE "users" ADD COLUMN "provider" VARCHAR(32)`,
        );
      }
      // 修正 role 长度
      await queryRunner.query(
        `ALTER TABLE "users" ALTER COLUMN "role" TYPE VARCHAR(30)`,
      );
    }

    // 2. 修复 tenants 表
    const tenantsTable = await queryRunner.getTable('tenants');
    if (tenantsTable) {
      if (!tenantsTable.findColumnByName('isolation_level')) {
        await queryRunner.query(
          `ALTER TABLE "tenants" ADD COLUMN "isolation_level" VARCHAR(20) NOT NULL DEFAULT 'small'`,
        );
      }
      if (!tenantsTable.findColumnByName('db_config')) {
        await queryRunner.query(
          `ALTER TABLE "tenants" ADD COLUMN "db_config" JSONB`,
        );
      }
      if (!tenantsTable.findColumnByName('ov_config')) {
        await queryRunner.query(
          `ALTER TABLE "tenants" ADD COLUMN "ov_config" JSONB`,
        );
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // 回滚逻辑（可选）
  }
}
