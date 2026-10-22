/**
 * TLS verificado para Neon; sin TLS para el contenedor local.
 *
 * Acepta también `verify-ca` y `verify-full`: `pg` avisa (10 líneas en cada
 * arranque) de que `sslmode=require` cambiará de significado en su próxima
 * versión mayor, y el arreglo es pasar las cadenas a `verify-full` (H-8).
 * Antes solo se reconocía `require`, y ese cambio habría dejado la conexión
 * sin TLS.
 */
const VERIFIED_TLS = /[?&]sslmode=(require|verify-ca|verify-full)(&|$)/;

export const resolveDatabaseSsl = (url: string) =>
  VERIFIED_TLS.test(url) ? { rejectUnauthorized: true } : false;
