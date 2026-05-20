import { MigrationInterface, QueryRunner } from 'typeorm';

const IMPORT_TASKS_TABLE = 'import_tasks';
const AUTO_CREATED_NODE_ID_COLUMN = 'auto_created_node_id';

export class AddImportTaskAutoCreatedNodeId1747100000000 implements MigrationInterface {
  name = 'AddImportTaskAutoCreatedNodeId1747100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "${IMPORT_TASKS_TABLE}"
      ADD COLUMN IF NOT EXISTS "${AUTO_CREATED_NODE_ID_COLUMN}" VARCHAR(36)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "${IMPORT_TASKS_TABLE}"
      DROP COLUMN IF EXISTS "${AUTO_CREATED_NODE_ID_COLUMN}"
    `);
  }
}
