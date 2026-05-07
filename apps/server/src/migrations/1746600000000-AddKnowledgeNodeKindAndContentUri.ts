import { MigrationInterface, QueryRunner } from 'typeorm';

const KNOWLEDGE_NODE_TABLE = 'knowledge_nodes';
const KIND_COLUMN = 'kind';
const CONTENT_URI_COLUMN = 'content_uri';

export class AddKnowledgeNodeKindAndContentUri1746600000000
  implements MigrationInterface
{
  name = 'AddKnowledgeNodeKindAndContentUri1746600000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schemas = await this.resolveTargetSchemas(queryRunner);

    for (const schema of schemas) {
      await queryRunner.query(`
        ALTER TABLE "${schema}"."${KNOWLEDGE_NODE_TABLE}"
        ADD COLUMN IF NOT EXISTS "${KIND_COLUMN}" VARCHAR(20)
      `);
      await queryRunner.query(`
        ALTER TABLE "${schema}"."${KNOWLEDGE_NODE_TABLE}"
        ADD COLUMN IF NOT EXISTS "${CONTENT_URI_COLUMN}" VARCHAR(2048)
      `);
      await queryRunner.query(`
        UPDATE "${schema}"."${KNOWLEDGE_NODE_TABLE}"
        SET "${KIND_COLUMN}" = CASE
          WHEN "viking_uri" IS NULL OR "viking_uri" LIKE '%/' THEN 'collection'
          ELSE 'document'
        END
        WHERE "${KIND_COLUMN}" IS NULL
      `);
      await queryRunner.query(`
        UPDATE "${schema}"."${KNOWLEDGE_NODE_TABLE}"
        SET "${CONTENT_URI_COLUMN}" = "viking_uri"
        WHERE "${CONTENT_URI_COLUMN}" IS NULL
          AND "${KIND_COLUMN}" = 'document'
          AND "viking_uri" IS NOT NULL
      `);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schemas = await this.resolveTargetSchemas(queryRunner);

    for (const schema of schemas) {
      await queryRunner.query(`
        ALTER TABLE "${schema}"."${KNOWLEDGE_NODE_TABLE}"
        DROP COLUMN IF EXISTS "${CONTENT_URI_COLUMN}"
      `);
      await queryRunner.query(`
        ALTER TABLE "${schema}"."${KNOWLEDGE_NODE_TABLE}"
        DROP COLUMN IF EXISTS "${KIND_COLUMN}"
      `);
    }
  }

  private async resolveTargetSchemas(queryRunner: QueryRunner) {
    const rows = (await queryRunner.query(`
      SELECT table_schema
      FROM information_schema.tables
      WHERE table_name = '${KNOWLEDGE_NODE_TABLE}'
        AND (
          table_schema = 'public'
          OR table_schema LIKE 'tenant\\_%' ESCAPE '\\'
        )
      GROUP BY table_schema
      ORDER BY table_schema
    `)) as Array<{ table_schema: string }>;

    return rows.map((row) => row.table_schema);
  }
}
