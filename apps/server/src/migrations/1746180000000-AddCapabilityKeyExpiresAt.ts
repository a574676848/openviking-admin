import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCapabilityKeyExpiresAt1746180000000
  implements MigrationInterface
{
  name = 'AddCapabilityKeyExpiresAt1746180000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "capability_keys"
      ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "capability_keys"
      DROP COLUMN IF EXISTS "expires_at"
    `);
  }
}
