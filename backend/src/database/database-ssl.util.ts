// TLS para contenedores locales
export const resolveDatabaseSsl = (url: string) =>
  url.includes('sslmode=require') ? { rejectUnauthorized: true } : false;
