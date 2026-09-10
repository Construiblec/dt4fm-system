import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { Logger } from '@nestjs/common';

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
 * El navegador manda el `Origin` como esquema + host + puerto, en minúsculas y
 * sin barra final ni ruta. La comparación es exacta, así que normalizamos los
 * dos lados: `https://Construiblec.cloud/` copiado de la barra de direcciones
 * tiene que casar con el `https://construiblec.cloud` que llega en la cabecera.
 *
 * No quita el puerto: `https://host:8443` es un origen distinto de
 * `https://host`, y unificarlos sería abrir uno que no se declaró.
 */
export function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, '');
}

/**
 * Lee `CORS_ALLOWED_ORIGINS` (lista separada por comas) en cada llamada, no
 * una sola vez al arrancar, para que quede cubierto por `setup-env.ts` en las
 * suites E2E sin depender del orden de imports.
 *
 * Ojo: la variable **reemplaza** a `DEFAULT_ALLOWED_ORIGINS`, no se suma a
 * ella. Si está definida, cada entorno declara la lista completa de los suyos.
 */
export function resolveAllowedOrigins(): string[] {
  const fromEnv = process.env.CORS_ALLOWED_ORIGINS;

  if (!fromEnv?.trim()) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return fromEnv.split(',').map(normalizeOrigin).filter(Boolean);
}

/** `true` si el `Origin` recibido está declarado, comparando ya normalizado. */
export function isOriginAllowed(origin: string): boolean {
  return resolveAllowedOrigins().includes(normalizeOrigin(origin));
}

const corsLogger = new Logger('CORS');

/**
 * Opciones que consume `app.enableCors` en `main.ts`. Viven aquí, y no allí,
 * para poder probarlas sin levantar la aplicación entera.
 *
 * **`allowedHeaders` está ausente a propósito.** Sin esa clave, el paquete
 * `cors` refleja las cabeceras que el navegador pida en el preflight
 * (`Access-Control-Request-Headers`) — su comportamiento por defecto. La lista
 * explícita que había antes obligaba a desplegar cada vez que un cliente
 * estrenaba una cabecera, y eso fue justo lo que dejó fuera a la página
 * personalizada de openMAINT: ExtJS añade `X-Requested-With` por su cuenta en
 * cada `Ext.Ajax.request`, sin que la página lo declare.
 *
 * No afloja nada: la frontera es `origin`. A un origen que ya declaraste de
 * confianza no lo contiene la lista de cabeceras —puede mandar lo que quiera—,
 * y a uno que no está declarado el preflight lo para antes de mirarlas. Quien
 * decide sigue siendo `CORS_ALLOWED_ORIGINS`, que se cambia sin tocar código.
 */
export const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Sin Origin (curl, servidor a servidor, el webhook IoT de la
    // Raspberry) no hay navegador de por medio, así que CORS no aplica:
    // dejarlas pasar aquí no abre nada que ya no estuviera abierto. Solo el
    // navegador exige y hace cumplir esta cabecera.
    if (!origin || isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    // `false`, no `new Error(...)`: el error hacía que el preflight
    // respondiera 500, que en el navegador se ve como "fallo del servidor" y
    // manda a depurar al lado equivocado. Con `false` la respuesta sale sin
    // `Access-Control-Allow-Origin` y el navegador dice exactamente lo que
    // pasa. El log deja el origen rechazado en Render, que es el dato que
    // hace falta para saber qué añadir a `CORS_ALLOWED_ORIGINS`.
    corsLogger.warn(
      `Origin rechazado: ${origin} — permitidos: ${resolveAllowedOrigins().join(', ')}`,
    );
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  // Sin esto cada preflight se repite: la auditoría midió 4 de 353-480 ms en
  // un solo login (H-3). 24 h es el techo que respeta Chrome.
  maxAge: 86400,
};
