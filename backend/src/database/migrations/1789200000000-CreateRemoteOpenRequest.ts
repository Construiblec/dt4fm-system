import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRemoteOpenRequest1789200000000 implements MigrationInterface {
  name = 'CreateRemoteOpenRequest1789200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "remote_open_request" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "request_id" uuid NOT NULL,
      "device_id" text NOT NULL,
      "building_id" integer NOT NULL,
      "device_scope" text NOT NULL,
      "action" text NOT NULL,
      "actor_type" text NOT NULL,
      "guest_stay_id" uuid,
      "actor_username" text,
      "status" text NOT NULL,
      "error_code" text,
      "requested_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      "finished_at" TIMESTAMP WITH TIME ZONE,
      CONSTRAINT "CHK_remote_open_scope" CHECK ("device_scope" IN ('pedestrian', 'vehicular')),
      CONSTRAINT "CHK_remote_open_action" CHECK ("action" IN ('open', 'close')),
      CONSTRAINT "CHK_remote_open_actor" CHECK ("actor_type" IN ('guest', 'staff')),
      CONSTRAINT "CHK_remote_open_status" CHECK ("status" IN ('attempted', 'opened', 'closed', 'failed', 'uncertain')),
      CONSTRAINT "PK_remote_open_request" PRIMARY KEY ("id")
    )`);

    // SET NULL: el historial sobrevive a la estancia.
    await queryRunner.query(
      `ALTER TABLE "remote_open_request" ADD CONSTRAINT "FK_remote_open_guest_stay" FOREIGN KEY ("guest_stay_id") REFERENCES "guest_stay"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_remote_open_request_device" ON "remote_open_request" ("request_id", "device_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_remote_open_device_time" ON "remote_open_request" ("device_id", "requested_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_remote_open_stay_time" ON "remote_open_request" ("guest_stay_id", "requested_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_remote_open_stay_time"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_remote_open_device_time"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_remote_open_request_device"`,
    );
    await queryRunner.query(
      `ALTER TABLE "remote_open_request" DROP CONSTRAINT "FK_remote_open_guest_stay"`,
    );
    await queryRunner.query(`DROP TABLE "remote_open_request"`);
  }
}
