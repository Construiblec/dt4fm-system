import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAppSession1789300000000 implements MigrationInterface {
  name = 'CreateAppSession1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "app_session" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "session_hash" text NOT NULL,
      "session_enc" text NOT NULL,
      "username" text NOT NULL,
      "user_id" integer NOT NULL,
      "remember" boolean NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      "last_used_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      CONSTRAINT "PK_app_session" PRIMARY KEY ("id")
    )`);

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_app_session_hash" ON "app_session" ("session_hash")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_app_session_username" ON "app_session" ("username")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_app_session_expires" ON "app_session" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_app_session_expires"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_app_session_username"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_app_session_hash"`);
    await queryRunner.query(`DROP TABLE "app_session"`);
  }
}
