import { MigrationInterface, QueryRunner } from 'typeorm';

/** Marca las limpiezas canceladas por la sincronización, no por una persona. */
export class CreateCleaningSyncCancellation1790000000000 implements MigrationInterface {
  name = 'CreateCleaningSyncCancellation1790000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "cleaning_sync_cancellation" (
      "task_id" bigint NOT NULL,
      "reservation_id" text NOT NULL,
      "confirmed" boolean NOT NULL DEFAULT false,
      "cancelled_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_cleaning_sync_cancellation" PRIMARY KEY ("task_id")
    )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cleaning_sync_cancellation"`);
  }
}
