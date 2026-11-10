import { MigrationInterface, QueryRunner } from 'typeorm';

/** El PIN pasa a escribirse en la reserva: `cleared` al borrarlo y `requested` para el mensaje de renovación. */
export class GuestPinNoticeDoorCode1789800000000 implements MigrationInterface {
  name = 'GuestPinNoticeDoorCode1789800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "guest_pin_notice" DROP CONSTRAINT "CHK_guest_pin_notice_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "guest_pin_notice" ADD CONSTRAINT "CHK_guest_pin_notice_status" CHECK ("status" IN ('sent', 'failed', 'skipped', 'requested', 'cleared'))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_guest_pin_notice_channel" ON "guest_pin_notice" ("credential_id", "channel", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_guest_pin_notice_channel"`,
    );
    await queryRunner.query(
      `DELETE FROM "guest_pin_notice" WHERE "status" IN ('requested', 'cleared')`,
    );
    await queryRunner.query(
      `ALTER TABLE "guest_pin_notice" DROP CONSTRAINT "CHK_guest_pin_notice_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "guest_pin_notice" ADD CONSTRAINT "CHK_guest_pin_notice_status" CHECK ("status" IN ('sent', 'failed', 'skipped'))`,
    );
  }
}
