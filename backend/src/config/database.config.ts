import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { resolveDatabaseSsl } from '../database/database-ssl.util';

export const buildTypeOrmOptions = (
  config: ConfigService,
): TypeOrmModuleOptions => {
  const url = config.get<string>('DATABASE_URL') ?? '';

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
    },
  };
};