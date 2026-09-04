import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migración de ENSAYO — no forma parte del esquema del producto.
 *
 * Existe solo para poder ejecutar el "caso difícil" del
 * [procedimiento de rollback](../../../../docs/piloto/procedimiento-rollback.md)
 * —revertir una versión que ya aplicó una migración— sin arriesgar datos
 * reales. Crea una tabla vacía y su `down()` la borra; no la toca ninguna
 * entidad ni ningún repositorio.
 *
 * Se revierte y se elimina del repositorio en cuanto termina el ensayo. Si
 * aparece en una revisión posterior, es que quedó olvidada: bórrala.
 */
export class RollbackDrill1788530000000 implements MigrationInterface {
  name = 'RollbackDrill1788530000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "rollback_drill" ("id" SERIAL NOT NULL, "nota" text, CONSTRAINT "PK_rollback_drill" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "rollback_drill"`);
  }
}
