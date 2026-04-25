import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameUserMcpKeysToCapabilityKeys1746100000000
  implements MigrationInterface
{
  name = 'RenameUserMcpKeysToCapabilityKeys1746100000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'user_mcp_keys'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'capability_keys'
        ) THEN
          ALTER TABLE "user_mcp_keys" RENAME TO "capability_keys";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "capability_keys" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "name" VARCHAR(100) NOT NULL,
        "api_key" VARCHAR(255) NOT NULL,
        "user_id" VARCHAR(255) NOT NULL,
        "tenant_id" VARCHAR(255) NOT NULL,
        "last_used_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_capability_keys" PRIMARY KEY ("id"),
        CONSTRAINT "uq_capability_keys_api_key" UNIQUE ("api_key")
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_capability_keys_api_key"
      ON "capability_keys" ("api_key")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "idx_capability_keys_api_key"
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'capability_keys'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'user_mcp_keys'
        ) THEN
          ALTER TABLE "capability_keys" RENAME TO "user_mcp_keys";
        END IF;
      END
      $$;
    `);
  }
}
