import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGuestPinNotice1789500000000 implements MigrationInterface {
  name = 'CreateGuestPinNotice1789500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "guest_pin_notice" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "credential_id" uuid NOT NULL,
      "guest_stay_id" uuid,
      "pin_fingerprint" text NOT NULL,
      "channel" text NOT NULL,
      "target" text NOT NULL,
      "status" text NOT NULL,
      "http_status" integer,
      "error" text,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_guest_pin_notice_status" CHECK ("status" IN ('sent', 'failed', 'skipped')),
      CONSTRAINT "PK_guest_pin_notice" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(
      `ALTER TABLE "guest_pin_notice" ADD CONSTRAINT "FK_guest_pin_notice_credential" FOREIGN KEY ("credential_id") REFERENCES "access_credential"("id") ON DELETE CASCADE`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_guest_pin_notice_credential" ON "guest_pin_notice" ("credential_id", "pin_fingerprint", "status")`,
    );

    // Solo reservas nuevas: las credenciales vivas al desplegar quedan como ya atendidas.
    await queryRunner.query(`INSERT INTO "guest_pin_notice"
      ("credential_id", "guest_stay_id", "pin_fingerprint", "channel", "target", "status", "error")
      SELECT "id", "guest_stay_id", "pin_fingerprint", 'none', '', 'skipped', 'pre_existing'
      FROM "access_credential"
      WHERE "subject_type" = 'guest' AND "status" IN ('pending', 'active')`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_guest_pin_notice_credential"`,
    );
    await queryRunner.query(
      `ALTER TABLE "guest_pin_notice" DROP CONSTRAINT "FK_guest_pin_notice_credential"`,
    );
    await queryRunner.query(`DROP TABLE "guest_pin_notice"`);
  }
}
