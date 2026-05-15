import { MigrationInterface, QueryRunner } from 'typeorm';

const KNOWLEDGE_NODE_INDEX_COLUMNS = [
  ['index_status', `VARCHAR(20) NOT NULL DEFAULT 'clean'`],
  ['draft_version', 'INTEGER NOT NULL DEFAULT 0'],
  ['indexed_version', 'INTEGER NOT NULL DEFAULT 0'],
  ['vector_count', 'INTEGER'],
  ['last_indexed_at', 'TIMESTAMPTZ'],
  ['index_error', 'TEXT'],
] as const;

export class AddDocumentDraftsAndIndexState1747000000000 implements MigrationInterface {
  name = 'AddDocumentDraftsAndIndexState1747000000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    for (const [column, type] of KNOWLEDGE_NODE_INDEX_COLUMNS) {
      await queryRunner.query(`
        ALTER TABLE "knowledge_nodes"
        ADD COLUMN IF NOT EXISTS "${column}" ${type}
      `);
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "document_drafts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "tenant_id" VARCHAR(64),
        "node_id" uuid NOT NULL,
        "markdown" TEXT NOT NULL,
        "version" INTEGER NOT NULL DEFAULT 1,
        "created_by_id" VARCHAR(64),
        "created_by_name" VARCHAR(64),
        "updated_by_id" VARCHAR(64),
        "updated_by_name" VARCHAR(64),
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_document_drafts_tenant_node"
      ON "document_drafts" (COALESCE("tenant_id", ''), "node_id")
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_document_drafts_tenant_node"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "document_drafts"`);

    for (const [column] of [...KNOWLEDGE_NODE_INDEX_COLUMNS].reverse()) {
      await queryRunner.query(`
        ALTER TABLE "knowledge_nodes"
        DROP COLUMN IF EXISTS "${column}"
      `);
    }
  }
}
