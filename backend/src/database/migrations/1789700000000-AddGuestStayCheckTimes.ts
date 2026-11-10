import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGuestStayCheckTimes1789700000000 implements MigrationInterface {
  name = 'AddGuestStayCheckTimes1789700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "guest_stay" ADD "check_in_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "guest_stay" ADD "check_out_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "guest_stay" DROP COLUMN "check_out_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "guest_stay" DROP COLUMN "check_in_at"`,
    );
  }
}
