import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameMcpSessionCredentialHash1746200000000
  implements MigrationInterface
{
  name = 'RenameMcpSessionCredentialHash1746200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'mcp_sessions' AND column_name = 'api_key_hash'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'mcp_sessions' AND column_name = 'credential_hash'
        ) THEN
          ALTER TABLE "mcp_sessions" RENAME COLUMN "api_key_hash" TO "credential_hash";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_mcp_sessions_api_key_hash"
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mcp_sessions_credential_hash"
      ON "mcp_sessions" ("credential_hash")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_mcp_sessions_credential_hash"
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'mcp_sessions' AND column_name = 'credential_hash'
        ) AND NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_name = 'mcp_sessions' AND column_name = 'api_key_hash'
        ) THEN
          ALTER TABLE "mcp_sessions" RENAME COLUMN "credential_hash" TO "api_key_hash";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mcp_sessions_api_key_hash"
      ON "mcp_sessions" ("api_key_hash")
    `);
  }
}
