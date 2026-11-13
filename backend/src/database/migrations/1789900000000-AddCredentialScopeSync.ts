import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Estado deseado (`scope`) frente a confirmado (`confirmed_scopes`). El backfill
 * no llama a la VPS: el desfase físico previo lo corrige la conciliación.
 */
export class AddCredentialScopeSync1789900000000 implements MigrationInterface {
  name = 'AddCredentialScopeSync1789900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "access_credential"
      ADD "confirmed_scopes" text[] NOT NULL DEFAULT '{}',
      ADD "employee_no" text,
      ADD "rewrite_pending" boolean NOT NULL DEFAULT false,
      ADD "sync_error" text,
      ADD "last_synced_at" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(`ALTER TABLE "access_credential"
      ADD CONSTRAINT "CHK_credential_confirmed_scopes"
      CHECK ("confirmed_scopes" <@ ARRAY['pedestrian', 'vehicular']::text[])`);

    // Vivas sincronizadas: lo deseado se dio por escrito. Revocadas sin confirmar: pueden seguir en la puerta.
    await queryRunner.query(`UPDATE "access_credential"
      SET "confirmed_scopes" = CASE "scope"
        WHEN 'both' THEN ARRAY['pedestrian', 'vehicular']::text[]
        ELSE ARRAY["scope"]::text[] END
      WHERE ("status" IN ('pending', 'active') AND "sync_state" = 'synced')
         OR ("status" IN ('revoked', 'expired') AND "sync_state" <> 'synced')`);

    await queryRunner.query(`UPDATE "access_credential" c
      SET "employee_no" = (
        SELECT e ->> 'employeeNo'
        FROM jsonb_array_elements(c."sync_detail") e
        WHERE e ->> 'employeeNo' IS NOT NULL
        LIMIT 1)
      WHERE jsonb_typeof(c."sync_detail") = 'array'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "access_credential" DROP CONSTRAINT "CHK_credential_confirmed_scopes"`,
    );
    await queryRunner.query(`ALTER TABLE "access_credential"
      DROP COLUMN "last_synced_at",
      DROP COLUMN "sync_error",
      DROP COLUMN "rewrite_pending",
      DROP COLUMN "employee_no",
      DROP COLUMN "confirmed_scopes"`);
  }
}
