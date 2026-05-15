import { MigrationInterface, QueryRunner } from 'typeorm';

const ACTOR_FIELD_TABLES = [
  'knowledge_bases',
  'knowledge_nodes',
  'import_tasks',
] as const;

const ACTOR_FIELD_DEFINITIONS = [
  ['created_by_id', 'VARCHAR(64)'],
  ['created_by_name', 'VARCHAR(64)'],
  ['updated_by_id', 'VARCHAR(64)'],
  ['updated_by_name', 'VARCHAR(64)'],
] as const;

export class AddAuditActorFields1746900000000 implements MigrationInterface {
  name = 'AddAuditActorFields1746900000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of ACTOR_FIELD_TABLES) {
      for (const [column, type] of ACTOR_FIELD_DEFINITIONS) {
        await queryRunner.query(`
          ALTER TABLE "${table}"
          ADD COLUMN IF NOT EXISTS "${column}" ${type}
        `);
      }
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ACTOR_FIELD_TABLES) {
      for (const [column] of [...ACTOR_FIELD_DEFINITIONS].reverse()) {
        await queryRunner.query(`
          ALTER TABLE "${table}"
          DROP COLUMN IF EXISTS "${column}"
        `);
      }
    }
  }
}
