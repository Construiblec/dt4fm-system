import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChannelAndPhoneToGuestStay1789100000000 implements MigrationInterface {
  name = 'AddChannelAndPhoneToGuestStay1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // `channel_name` decide por dónde se entrega el enlace del portal
    // (mensaje de Hostaway para reservas de canal, correo para las directas).
    // `guest_phone` se guarda desde ya para el futuro canal de WhatsApp.
    await queryRunner.query(`ALTER TABLE "guest_stay" ADD "channel_name" text`);
    await queryRunner.query(`ALTER TABLE "guest_stay" ADD "guest_phone" text`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "guest_stay" DROP COLUMN "guest_phone"`,
    );
    await queryRunner.query(
      `ALTER TABLE "guest_stay" DROP COLUMN "channel_name"`,
    );
  }
}
