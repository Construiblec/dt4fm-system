import { MigrationInterface, QueryRunner } from 'typeorm';

/** Distingue un cambio de Hostaway de uno hecho por una persona en la limpieza. */
export class CreateCleaningSyncBaseline1790100000000 implements MigrationInterface {
  name = 'CreateCleaningSyncBaseline1790100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "cleaning_sync_baseline" (
      "task_id" bigint NOT NULL,
      "checkout_date" text NOT NULL,
      "listing_id" text NOT NULL,
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_cleaning_sync_baseline" PRIMARY KEY ("task_id")
    )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "cleaning_sync_baseline"`);
  }
}
