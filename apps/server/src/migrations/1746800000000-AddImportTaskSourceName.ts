import { MigrationInterface, QueryRunner } from 'typeorm';

const IMPORT_TASKS_TABLE = 'import_tasks';
const SOURCE_NAME_COLUMN = 'source_name';
const LEGACY_ORIGINAL_FILE_NAME_COLUMN = 'original_file_name';
const SOURCE_NAME_MAX_LENGTH = 255;

export class AddImportTaskSourceName1746800000000
  implements MigrationInterface
{
  name = 'AddImportTaskSourceName1746800000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    const schemas = await this.resolveSchemasWithTable(
      queryRunner,
      IMPORT_TASKS_TABLE,
    );
    for (const schema of schemas) {
      await queryRunner.query(`
        ALTER TABLE ${this.tableName(schema, IMPORT_TASKS_TABLE)}
        ADD COLUMN IF NOT EXISTS "${SOURCE_NAME_COLUMN}" VARCHAR(${SOURCE_NAME_MAX_LENGTH})
      `);
      await this.backfillLegacyOriginalFileName(queryRunner, schema);
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schemas = await this.resolveSchemasWithTable(
      queryRunner,
      IMPORT_TASKS_TABLE,
    );
    for (const schema of schemas) {
      await queryRunner.query(`
        ALTER TABLE ${this.tableName(schema, IMPORT_TASKS_TABLE)}
        DROP COLUMN IF EXISTS "${SOURCE_NAME_COLUMN}"
      `);
    }
  }

  private async resolveSchemasWithTable(
    queryRunner: QueryRunner,
    tableName: string,
  ): Promise<string[]> {
    const rows = (await queryRunner.query(
      `
        SELECT table_schema
        FROM information_schema.tables
        WHERE table_name = $1
          AND (
            table_schema = 'public'
            OR table_schema LIKE 'tenant\\_%' ESCAPE '\\'
          )
        ORDER BY table_schema
      `,
      [tableName],
    )) as Array<{ table_schema: string }>;

    return rows.map((row) => row.table_schema);
  }

  private async backfillLegacyOriginalFileName(
    queryRunner: QueryRunner,
    schema: string,
  ): Promise<void> {
    const hasLegacyColumn = await this.hasColumn(
      queryRunner,
      schema,
      IMPORT_TASKS_TABLE,
      LEGACY_ORIGINAL_FILE_NAME_COLUMN,
    );
    if (!hasLegacyColumn) {
      return;
    }

    await queryRunner.query(`
      UPDATE ${this.tableName(schema, IMPORT_TASKS_TABLE)}
      SET "${SOURCE_NAME_COLUMN}" = COALESCE("${SOURCE_NAME_COLUMN}", "${LEGACY_ORIGINAL_FILE_NAME_COLUMN}")
      WHERE "${SOURCE_NAME_COLUMN}" IS NULL
    `);
  }

  private async hasColumn(
    queryRunner: QueryRunner,
    schema: string,
    tableName: string,
    columnName: string,
  ): Promise<boolean> {
    const rows = (await queryRunner.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
          AND column_name = $3
        LIMIT 1
      `,
      [schema, tableName, columnName],
    )) as Array<Record<string, unknown>>;

    return rows.length > 0;
  }

  private tableName(schema: string, table: string): string {
    return `${this.quoteIdentifier(schema)}.${this.quoteIdentifier(table)}`;
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
