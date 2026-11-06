import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGuestStayAccessSuspension1789600000000 implements MigrationInterface {
  name = 'AddGuestStayAccessSuspension1789600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "guest_stay" ADD "access_suspended_at" TIMESTAMP WITH TIME ZONE`,
    );
    await queryRunner.query(
      `ALTER TABLE "guest_stay" ADD "access_suspended_by" text`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "guest_stay" DROP COLUMN "access_suspended_by"`,
    );
    await queryRunner.query(
      `ALTER TABLE "guest_stay" DROP COLUMN "access_suspended_at"`,
    );
  }
}
