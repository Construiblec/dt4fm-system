import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateLiveViewRequest1789400000000 implements MigrationInterface {
  name = 'CreateLiveViewRequest1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "live_view_request" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "request_id" uuid NOT NULL,
      "camera_id" text NOT NULL,
      "building_id" integer,
      "actor_username" text NOT NULL,
      "status" text NOT NULL,
      "error_code" text,
      "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "finished_at" TIMESTAMP WITH TIME ZONE,
      CONSTRAINT "CHK_live_view_status" CHECK ("status" IN ('requested', 'issued', 'failed')),
      CONSTRAINT "PK_live_view_request" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_live_view_request_id" ON "live_view_request" ("request_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_live_view_camera_time" ON "live_view_request" ("camera_id", "requested_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_live_view_actor_time" ON "live_view_request" ("actor_username", "requested_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_live_view_actor_time"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_live_view_camera_time"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_live_view_request_id"`);
    await queryRunner.query(`DROP TABLE "live_view_request"`);
  }
}
