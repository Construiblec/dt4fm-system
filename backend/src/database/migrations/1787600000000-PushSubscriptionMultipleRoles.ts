import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * `role` (texto) pasa a `roles` (array): un usuario puede pertenecer a varios
 * grupos de openMAINT y alternar entre ellos en la app, y debe recibir los
 * avisos de todos mientras tenga sesión, no solo los del rol activo.
 *
 * El índice GIN es el que hace eficiente el `&&` (solapamiento) del fan-out.
 */
export class PushSubscriptionMultipleRoles1787600000000
  implements MigrationInterface
{
  name = 'PushSubscriptionMultipleRoles1787600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "push_subscriptions" ADD "roles" text array`,
    );
    // Las suscripciones existentes conservan su único rol como array de uno.
    await queryRunner.query(
      `UPDATE "push_subscriptions" SET "roles" = ARRAY["role"]`,
    );
    await queryRunner.query(
      `ALTER TABLE "push_subscriptions" ALTER COLUMN "roles" SET NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3245138de70e8f2e153e36ee0b"`,
    );
    await queryRunner.query(`ALTER TABLE "push_subscriptions" DROP COLUMN "role"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_push_subscriptions_roles" ON "push_subscriptions" USING GIN ("roles")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_push_subscriptions_roles"`);
    await queryRunner.query(`ALTER TABLE "push_subscriptions" ADD "role" text`);
    // Al revertir solo sobrevive el primer rol: la columna no admite varios.
    await queryRunner.query(
      `UPDATE "push_subscriptions" SET "role" = "roles"[1]`,
    );
    await queryRunner.query(
      `ALTER TABLE "push_subscriptions" ALTER COLUMN "role" SET NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3245138de70e8f2e153e36ee0b" ON "push_subscriptions" ("role")`,
    );
    await queryRunner.query(
      `ALTER TABLE "push_subscriptions" DROP COLUMN "roles"`,
    );
  }
}