import { readFileSync } from 'fs';
import { resolve } from 'path';
import { parse } from 'dotenv';
import { Client } from 'pg';

/**
 * Lee DATABASE_URL del `.env` **sin volcar el archivo en `process.env`**.
 *
 * `import 'dotenv/config'` sería más corto pero es justo lo que NO hay que
 * hacer aquí: globalSetup corre en el proceso principal de Jest y los workers
 * heredan su `process.env`, así que cargar el `.env` entero filtraría los
 * secretos reales (openMAINT, SMTP, VAPID, el del webhook IoT) a las suites.
 * Eso rompe el aislamiento de `setup-env.ts`, cuyos `??=` dejan de aplicarse
 * porque la variable ya viene definida — y los tests acabarían corriendo
 * contra la configuración de verdad en vez de la de pruebas.
 */
const readDatabaseUrlFromEnvFile = (): string | undefined => {
  try {
    const file = readFileSync(resolve(__dirname, '..', '.env'), 'utf8');
    return parse(file).DATABASE_URL?.trim() || undefined;
  } catch {
    // Sin `.env` (CI, por ejemplo) la variable llega por el entorno.
    return undefined;
  }
};

/**
 * Comprobación previa a TODA la corrida E2E (jest `globalSetup`).
 *
 * Sin esto, un Postgres apagado produce el peor diagnóstico posible: las 15
 * suites tardan ~32 s cada una reintentando la conexión, fallan con un
 * `AggregateError:` sin mensaje, y encima el `afterAll` añade un
 * `Cannot read properties of undefined (reading 'close')` que parece un bug
 * de las pruebas cuando en realidad solo falta la base de datos.
 *
 * Aquí se falla en menos de un segundo y con instrucciones concretas.
 */
export default async function globalSetup(): Promise<void> {
  const url = process.env.DATABASE_URL?.trim() || readDatabaseUrlFromEnvFile();

  if (!url) {
    throw new Error(
      [
        '',
        '  Falta DATABASE_URL para las pruebas E2E.',
        '',
        '  En local, levanta el Postgres del proyecto:',
        '    cd backend && docker compose up -d',
        '',
        '  y exporta la cadena del contenedor:',
        '    DATABASE_URL=postgresql://dt4fm:dt4fm@localhost:5555/dt4fm',
        '',
      ].join('\n'),
    );
  }

  const client = new Client({
    connectionString: url,
    // Sin esto, un host inalcanzable se queda colgado hasta el timeout de TCP.
    connectionTimeoutMillis: 3000,
  });

  try {
    await client.connect();
    await client.end();
  } catch (error) {
    // Un host inalcanzable llega como AggregateError SIN mensaje, que es
    // justo lo que hacía ilegible el fallo original.
    const detail =
      (error as Error)?.message?.trim() ||
      (error as { code?: string })?.code ||
      'el servidor no respondió (¿está levantado?)';

    throw new Error(
      [
        '',
        `  No se pudo conectar a Postgres: ${detail}`,
        '',
        `  DATABASE_URL = ${url.replace(/:[^:@/]+@/, ':****@')}`,
        '',
        '  Las suites E2E necesitan un Postgres real: levantan AppModule',
        '  completo, y AppModule registra TypeORM en la raíz. Solo el módulo',
        '  push-notifications lo usa de verdad, pero la app no arranca sin él.',
        '',
        '  Para levantarlo en local:',
        '    cd backend',
        '    docker compose up -d        # requiere Docker Desktop ARRANCADO',
        '    npm run migration:run',
        '',
        '  Si `docker compose` falla con "failed to connect to the docker API",',
        '  Docker Desktop no está corriendo: ábrelo desde el menú Inicio y',
        '  espera a que el icono de la barra deje de animarse.',
        '',
      ].join('\n'),
    );
  }
}
