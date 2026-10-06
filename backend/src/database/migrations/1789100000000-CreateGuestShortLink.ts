import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGuestShortLink1789100000000 implements MigrationInterface {
  name = 'CreateGuestShortLink1789100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "guest_short_link" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "code_hash" text NOT NULL,
      "guest_stay_id" uuid NOT NULL,
      "token_version" integer NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "PK_guest_short_link" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_guest_short_link_code_hash" ON "guest_short_link" ("code_hash")`,
    );

    await queryRunner.query(
      `ALTER TABLE "guest_short_link" ADD CONSTRAINT "FK_guest_short_link_stay" FOREIGN KEY ("guest_stay_id") REFERENCES "guest_stay"("id") ON DELETE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "guest_short_link" DROP CONSTRAINT "FK_guest_short_link_stay"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_guest_short_link_code_hash"`,
    );
    await queryRunner.query(`DROP TABLE "guest_short_link"`);
  }
}
