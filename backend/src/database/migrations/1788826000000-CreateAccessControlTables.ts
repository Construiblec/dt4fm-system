import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAccessControlTables1788826000000 implements MigrationInterface {
  name = 'CreateAccessControlTables1788826000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // guest_stay va primero: access_credential la referencia.
    await queryRunner.query(`CREATE TABLE "guest_stay" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "hostaway_reservation_id" text NOT NULL,
      "listing_id" text NOT NULL,
      "openmaint_unit_id" integer,
      "building_id" integer,
      "guest_name" text NOT NULL,
      "guest_email" text,
      "guest_last_name_hash" text,
      "arrival_date" date NOT NULL,
      "departure_date" date NOT NULL,
      "access_valid_from" TIMESTAMP WITH TIME ZONE NOT NULL,
      "access_valid_to" TIMESTAMP WITH TIME ZONE NOT NULL,
      "status" text NOT NULL,
      "token_version" integer NOT NULL DEFAULT 1,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_guest_stay_reservation" UNIQUE ("hostaway_reservation_id"),
      CONSTRAINT "CHK_guest_stay_status" CHECK ("status" IN ('pending', 'active', 'completed', 'cancelled')),
      CONSTRAINT "PK_guest_stay" PRIMARY KEY ("id")
    )`);
    await queryRunner.query(
      `CREATE INDEX "IDX_guest_stay_status_valid_to" ON "guest_stay" ("status", "access_valid_to")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_guest_stay_listing" ON "guest_stay" ("listing_id")`,
    );

    await queryRunner.query(`CREATE TABLE "access_credential" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "subject_type" text NOT NULL,
      "subject_ref" text NOT NULL,
      "display_name" text NOT NULL,
      "scope" text NOT NULL,
      "building_id" integer NOT NULL,
      "openmaint_unit_id" integer,
      "pin_ciphertext" text NOT NULL,
      "pin_fingerprint" text NOT NULL,
      "valid_from" TIMESTAMP WITH TIME ZONE NOT NULL,
      "valid_to" TIMESTAMP WITH TIME ZONE NOT NULL,
      "status" text NOT NULL,
      "revoked_reason" text,
      "issued_by" text NOT NULL,
      "guest_stay_id" uuid,
      "sync_state" text NOT NULL DEFAULT 'pending',
      "sync_attempts" integer NOT NULL DEFAULT 0,
      "sync_detail" jsonb,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "CHK_credential_subject_type" CHECK ("subject_type" IN ('guest', 'tenant', 'employee')),
      CONSTRAINT "CHK_credential_scope" CHECK ("scope" IN ('pedestrian', 'vehicular', 'both')),
      CONSTRAINT "CHK_credential_status" CHECK ("status" IN ('pending', 'active', 'revoked', 'expired')),
      CONSTRAINT "CHK_credential_sync_state" CHECK ("sync_state" IN ('pending', 'synced', 'failed')),
      CONSTRAINT "PK_access_credential" PRIMARY KEY ("id")
    )`);

    // ON DELETE RESTRICT: una estancia no se borra mientras cuelgue de ella una credencial.
    await queryRunner.query(
      `ALTER TABLE "access_credential" ADD CONSTRAINT "FK_credential_guest_stay" FOREIGN KEY ("guest_stay_id") REFERENCES "guest_stay"("id") ON DELETE RESTRICT`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_credential_subject" ON "access_credential" ("subject_type", "subject_ref")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_credential_expiry" ON "access_credential" ("status", "valid_to")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_credential_stay" ON "access_credential" ("guest_stay_id")`,
    );

    // Unicidad por edificio, no por (edificio, ámbito): un `both` y un
    // `pedestrian` con el mismo PIN no colisionarían en el índice, pero sí en
    // el terminal peatonal, que es donde importa. Un único global se agotaría
    // por reutilización histórica; el conflicto real es dentro del edificio.
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_credential_pin_activo"
      ON "access_credential" ("building_id", "pin_fingerprint")
      WHERE "status" IN ('pending', 'active')`);

    // Impide la doble emisión cuando el webhook y el barrido diario coinciden
    // sobre la misma reserva.
    await queryRunner.query(`CREATE UNIQUE INDEX "UQ_credential_sujeto_activo"
      ON "access_credential" ("subject_type", "subject_ref", "scope")
      WHERE "status" IN ('pending', 'active')`);

    // La cola de reintentos: solo lo que no está sincronizado.
    await queryRunner.query(`CREATE INDEX "IDX_credential_sync_pendiente"
      ON "access_credential" ("sync_state", "updated_at")
      WHERE "sync_state" <> 'synced'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_credential_sync_pendiente"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_credential_sujeto_activo"`,
    );
    await queryRunner.query(`DROP INDEX "public"."UQ_credential_pin_activo"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_credential_stay"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_credential_expiry"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_credential_subject"`);
    await queryRunner.query(
      `ALTER TABLE "access_credential" DROP CONSTRAINT "FK_credential_guest_stay"`,
    );
    await queryRunner.query(`DROP TABLE "access_credential"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_guest_stay_listing"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_guest_stay_status_valid_to"`,
    );
    await queryRunner.query(`DROP TABLE "guest_stay"`);
  }
}
