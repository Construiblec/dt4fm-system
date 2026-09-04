import 'dotenv/config';
import { DataSource } from 'typeorm';
import { resolveDatabaseSsl } from './database-ssl.util';

const url = process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL ?? '';

const compiled = __filename.endsWith('.js');

export default new DataSource({
  type: 'postgres',
  url,
  ssl: resolveDatabaseSsl(url),
  entities: [compiled ? 'dist/**/*.entity.js' : 'src/**/*.entity.ts'],
  migrations: [
    compiled ? 'dist/database/migrations/*.js' : 'src/database/migrations/*.ts',
  ],
});
