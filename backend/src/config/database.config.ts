import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { resolveDatabaseSsl } from '../database/database-ssl.util';

export const buildTypeOrmOptions = (
  config: ConfigService,
): TypeOrmModuleOptions => {
  const url = config.get<string>('DATABASE_URL')?.trim() ?? '';

  // Sin base no arranca ningún módulo, no solo el de push. Mejor un mensaje
  // claro aquí que el error opaco de conexión que daría TypeORM con url vacía.
  if (!url) {
    throw new Error(
      'Falta DATABASE_URL. En local: `docker compose up -d` en backend/. ' +
        'En Render: la cadena CON pooler de la rama de Neon del entorno.',
    );
  }

  return {
    type: 'postgres',
    url,
    ssl: resolveDatabaseSsl(url),
    synchronize: false,
    autoLoadEntities: true,
    extra: {
      max: 5,
      // Suelta las conexiones ociosas para que la db pueda suspender el compute.
      idleTimeoutMillis: 10_000,
      // El compute suspendido despierta durante el intento. Sin límite (el
      // valor por defecto) una caída de Neon colgaría la petición para siempre.
      connectionTimeoutMillis: 15_000,
    },
  };
};
