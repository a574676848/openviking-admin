import { MigrationInterface, QueryRunner } from 'typeorm';

const USERS_TABLE_NAME = 'users';
const LEGACY_USERNAME_CONSTRAINT_NAME = 'uq_users_username';
const LEGACY_TYPEORM_USERNAME_CONSTRAINT_NAME =
  'UQ_fe0bb3f6520ee0469504521e710';
const PLATFORM_USERNAME_INDEX_NAME = 'uq_users_platform_username';
const TENANT_USERNAME_INDEX_NAME = 'uq_users_tenant_username';

export class RepairScopedUsernameConstraints1746500000000
  implements MigrationInterface
{
  name = 'RepairScopedUsernameConstraints1746500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "${USERS_TABLE_NAME}" DROP CONSTRAINT IF EXISTS "${LEGACY_USERNAME_CONSTRAINT_NAME}"`,
    );
    await queryRunner.query(
      `ALTER TABLE "${USERS_TABLE_NAME}" DROP CONSTRAINT IF EXISTS "${LEGACY_TYPEORM_USERNAME_CONSTRAINT_NAME}"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${PLATFORM_USERNAME_INDEX_NAME}"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${TENANT_USERNAME_INDEX_NAME}"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX "${PLATFORM_USERNAME_INDEX_NAME}"
      ON "${USERS_TABLE_NAME}" ("username")
      WHERE "tenant_id" IS NULL
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "${TENANT_USERNAME_INDEX_NAME}"
      ON "${USERS_TABLE_NAME}" ("tenant_id", "username")
      WHERE "tenant_id" IS NOT NULL
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${TENANT_USERNAME_INDEX_NAME}"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "${PLATFORM_USERNAME_INDEX_NAME}"`,
    );
    await queryRunner.query(`
      ALTER TABLE "${USERS_TABLE_NAME}"
      ADD CONSTRAINT "${LEGACY_USERNAME_CONSTRAINT_NAME}" UNIQUE ("username")
    `);
  }
}
