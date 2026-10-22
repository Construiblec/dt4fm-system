import { Logger } from '@nestjs/common';
import { AppLogger } from '../common/logging/app-logger';
import { describeError } from '../common/logging/describe-error.util';
import dataSource from './data-source';

/**
 * Pistas para los fallos que ya aparecieron al desplegar. La clave es el
 * SQLSTATE de Postgres o el código de red de Node.
 */
const HINTS: Record<string, string> = {
  '42501':
    'el rol de DATABASE_URL_DIRECT no puede crear tablas: ¿es el dueño de la base? (en Neon, el rol de la rama que eligió «Connect»)',
  '28P01':
    'usuario o contraseña de la base incorrectos: revisa DATABASE_URL_DIRECT',
  '3D000': 'la base que nombra DATABASE_URL_DIRECT no existe',
  ENOTFOUND:
    'no se encuentra el servidor de la base: revisa el host de DATABASE_URL_DIRECT',
  ECONNREFUSED: 'el servidor de la base rechaza la conexión: ¿está levantado?',
};

function hintFor(error: unknown): string | undefined {
  const code =
    (error as { code?: unknown })?.code ??
    (error as { driverError?: { code?: unknown } })?.driverError?.code;

  return typeof code === 'string' ? HINTS[code] : undefined;
}

/**
 * Sustituye a `typeorm migration:run` en Render (`npm run migration:run:prod`).
 *
 * El CLI fuerza `logging: ["query", "error", "schema"]`, así que cada
 * despliegue imprimía todas las consultas, y un fallo volcaba el objeto de
 * error entero (~60 líneas). Aquí solo salen los mensajes de migración de
 * TypeORM ("3 migrations are new…", "Migration X has been executed…") y, si
 * algo falla, una línea con la causa y una pista.
 *
 * Por lo demás hace exactamente lo que el CLI
 * (`node_modules/typeorm/commands/MigrationRunCommand.js`): las mismas
 * opciones, la misma transacción por defecto y la misma salida con código 0/1.
 */
async function main(): Promise<void> {
  Logger.overrideLogger(new AppLogger());
  const logger = new Logger('Migraciones');

  dataSource.setOptions({
    subscribers: [],
    synchronize: false,
    migrationsRun: false,
    dropSchema: false,
    logging: ['migration'],
  });

  try {
    await dataSource.initialize();
    const executed = await dataSource.runMigrations({
      transaction: dataSource.options.migrationsTransactionMode ?? 'all',
    });

    // Sin esta línea un despliegue sin migraciones no dejaba rastro de que se
    // comprobaron: TypeORM solo lo dice en el nivel `schema`, el de las consultas.
    logger.log(
      executed.length > 0
        ? `Aplicadas ${executed.length}: ${executed.map((m) => m.name).join(', ')}`
        : 'Sin migraciones pendientes',
    );

    await dataSource.destroy();
    process.exit(0);
  } catch (error) {
    const hint = hintFor(error);

    logger.error(
      `No se aplicaron las migraciones: ${describeError(error)}${hint ? ` → ${hint}` : ''}`,
    );

    if (dataSource.isInitialized) {
      await dataSource.destroy();
    }

    process.exit(1);
  }
}

void main();
