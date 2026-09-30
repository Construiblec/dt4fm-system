import { MigrationInterface, QueryRunner } from 'typeorm';

/** Apertura remota por `trigger`: estado `triggered` y fase por barrera. */
export class VehicularGateTrigger1789300000000 implements MigrationInterface {
  name = 'VehicularGateTrigger1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Las filas `opened`/`closed` anteriores se quedan: son historial.
    await queryRunner.query(
      `ALTER TABLE "remote_open_request" DROP CONSTRAINT "CHK_remote_open_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "remote_open_request" ADD CONSTRAINT "CHK_remote_open_status" CHECK ("status" IN ('attempted', 'triggered', 'opened', 'closed', 'failed', 'uncertain'))`,
    );

    await queryRunner.query(`CREATE TABLE "vehicular_gate_phase" (
      "device_id" text NOT NULL,
      "building_id" integer NOT NULL,
      "phase" text NOT NULL,
      "pulsed_at" TIMESTAMP WITH TIME ZONE,
      "opened_by_stay_id" uuid,
      "opened_by_username" text,
      "request_id" uuid,
      "resolved_by" text,
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      CONSTRAINT "CHK_vehicular_gate_phase" CHECK ("phase" IN ('ready', 'open', 'uncertain')),
      CONSTRAINT "PK_vehicular_gate_phase" PRIMARY KEY ("device_id")
    )`);
    await queryRunner.query(
      `ALTER TABLE "vehicular_gate_phase" ADD CONSTRAINT "FK_vehicular_gate_phase_stay" FOREIGN KEY ("opened_by_stay_id") REFERENCES "guest_stay"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "vehicular_gate_phase"`);
    await queryRunner.query(
      `UPDATE "remote_open_request" SET "status" = CASE "action" WHEN 'open' THEN 'opened' ELSE 'closed' END WHERE "status" = 'triggered'`,
    );
    await queryRunner.query(
      `ALTER TABLE "remote_open_request" DROP CONSTRAINT "CHK_remote_open_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "remote_open_request" ADD CONSTRAINT "CHK_remote_open_status" CHECK ("status" IN ('attempted', 'opened', 'closed', 'failed', 'uncertain'))`,
    );
  }
}
