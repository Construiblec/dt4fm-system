import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { Logger } from '@nestjs/common';

export function normalizeOrigin(origin: string): string {
  return origin.trim().toLowerCase().replace(/\/+$/, '');
}

/**
 * Sin `CORS_ALLOWED_ORIGINS` no se permite ningún navegador: los dominios de
 * cada entorno viven solo en su variable, no en el código.
 */
export function resolveAllowedOrigins(): string[] {
  return (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
}

/** `true` si el `Origin` recibido está declarado, comparando ya normalizado. */
export function isOriginAllowed(origin: string): boolean {
  return resolveAllowedOrigins().includes(normalizeOrigin(origin));
}

const corsLogger = new Logger('CORS');

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
      `Origin rechazado: ${origin} — permitidos: ${resolveAllowedOrigins().join(', ') || 'ninguno (falta CORS_ALLOWED_ORIGINS)'}`,
    );
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  // Sin esto cada preflight se repite: la auditoría midió 4 de 353-480 ms en
  // un solo login (H-3). 24 h es el techo que respeta Chrome.
  maxAge: 86400,
};
