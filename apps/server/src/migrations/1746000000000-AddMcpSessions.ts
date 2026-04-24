import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMcpSessions1746000000000 implements MigrationInterface {
  name = 'AddMcpSessions1746000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mcp_sessions" (
        "session_id" VARCHAR(36) NOT NULL,
        "api_key_hash" VARCHAR(64) NOT NULL,
        "session_token_hash" VARCHAR(64) NOT NULL,
        "expires_at" TIMESTAMP NOT NULL,
        "last_seen_at" TIMESTAMP NOT NULL,
        "closed_at" TIMESTAMP,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_mcp_sessions" PRIMARY KEY ("session_id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "mcp_session_events" (
        "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
        "session_id" VARCHAR(36) NOT NULL,
        "event_type" VARCHAR(32),
        "payload" TEXT NOT NULL,
        "delivered_at" TIMESTAMP,
        "expires_at" TIMESTAMP NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_mcp_session_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mcp_sessions_api_key_hash"
      ON "mcp_sessions" ("api_key_hash")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mcp_sessions_expires_at"
      ON "mcp_sessions" ("expires_at")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_mcp_session_events_pending"
      ON "mcp_session_events" ("session_id", "delivered_at", "created_at")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_mcp_session_events_pending"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_mcp_sessions_expires_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_mcp_sessions_api_key_hash"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_session_events"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "mcp_sessions"`);
  }
}
