/**
 * Orígenes del piloto, por si `CORS_ALLOWED_ORIGINS` no está definida en el
 * entorno. Cubren los tres casos reales de hoy (ver `APP_BASE_URL` en
 * `.env.example`): desarrollo local, staging y producción.
 *
 * Antes de esto, `main.ts` reflejaba cualquier `Origin` recibido y permitía
 * credenciales (BP-002): cualquier sitio podía llamar a la API desde el
 * navegador de un usuario con sesión abierta.
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'https://dt4fm-staging.vercel.app',
  'https://dt4fm-system-f7cc.vercel.app',
];

/**
 * Lee `CORS_ALLOWED_ORIGINS` (lista separada por comas) en cada llamada, no
 * una sola vez al arrancar, para que quede cubierto por `setup-env.ts` en las
 * suites E2E sin depender del orden de imports.
 */
export function resolveAllowedOrigins(): string[] {
  const fromEnv = process.env.CORS_ALLOWED_ORIGINS;

  if (!fromEnv?.trim()) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return fromEnv
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}
