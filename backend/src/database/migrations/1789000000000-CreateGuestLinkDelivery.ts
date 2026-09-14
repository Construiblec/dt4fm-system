import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGuestLinkDelivery1789000000000 implements MigrationInterface {
  name = 'CreateGuestLinkDelivery1789000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "guest_link_delivery" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "guest_stay_id" uuid NOT NULL,
      "token_version" integer NOT NULL,
      "channel" text NOT NULL,
      "target" text NOT NULL,
      "status" text NOT NULL,
      "http_status" integer,
      "error" text,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_guest_link_delivery_status" CHECK ("status" IN ('sent', 'failed')),
      CONSTRAINT "PK_guest_link_delivery" PRIMARY KEY ("id")
    )`);

    // ON DELETE CASCADE: el registro de envíos no tiene sentido sin su estancia,
    // y no debe impedir que una estancia se borre.
    await queryRunner.query(
      `ALTER TABLE "guest_link_delivery" ADD CONSTRAINT "FK_guest_link_delivery_stay" FOREIGN KEY ("guest_stay_id") REFERENCES "guest_stay"("id") ON DELETE CASCADE`,
    );

    // La consulta de siempre: ¿esta estancia ya tiene un envío que salió bien?
    await queryRunner.query(
      `CREATE INDEX "IDX_guest_link_delivery_stay_status" ON "guest_link_delivery" ("guest_stay_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_guest_link_delivery_stay_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "guest_link_delivery" DROP CONSTRAINT "FK_guest_link_delivery_stay"`,
    );
    await queryRunner.query(`DROP TABLE "guest_link_delivery"`);
  }
}
