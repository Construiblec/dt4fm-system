# Logs del backend

Los logs de Render son la herramienta de diagnóstico del backend: varias respuestas de la API son genéricas a propósito y remiten al log («el detalle queda en el log»). Este documento dice cómo escribir un log para que esa promesa se cumpla, y cómo encontrar lo que pasó con una petición concreta.

## Cómo se ve

Una línea por evento. Todas las líneas de una misma petición llevan el mismo `rid`:

```
WARN  [OpenmaintClient] GET /sessions/current → 400: session not found for id = null (728 ms) rid=626a83a7
WARN  [HTTP] GET /auth/session 401 (733 ms) Sesión no válida rid=626a83a7
```

- **`[HTTP]`** cierra cada petición: método, ruta (el patrón, `/cleaning-tasks/:id`, no la URL real), estado, duración y, si falló, el motivo. `/health` y los preflight de CORS no la escriben.
- **`[OpenmaintClient]` / `[ContificoClient]`** escriben una línea solo si la llamada falla, con ruta, estado y el mensaje que devolvió el servicio. Las llamadas correctas salen con `LOG_LEVEL=debug`.
- **`[ExceptionsHandler]`** aparece solo ante un error no controlado (un bug): la causa en una línea y hasta cinco marcos de traza de nuestro código.

## Buscar una petición en Render

1. En el navegador, DevTools › *Network* › la petición › *Headers* de la respuesta: copiar `X-Request-Id`.
2. En Render › el servicio › *Logs*, buscar `rid=<ese valor>`.

Aparecen juntas la línea de la petición, las de openMAINT o Contifico que la acompañaron y, si hubo un bug, la de `ExceptionsHandler`.

## Niveles

| Nivel | Cuándo | Ejemplo del repositorio |
|---|---|---|
| `error` | Alguien tiene que actuar: algo no se hizo | `No se pudo registrar el pago 123 — PUT /classes/Pagos/cards/123 → 500: …` |
| `warn` | Falló algo, pero se recuperó o siguió degradado | `No se pudo leer la ficha del empleado 42 — …` (se sigue sin la ficha) |
| `log` | Un evento de negocio por operación | `Correctivo creado: id=8812` |
| `debug` | El detalle de cada llamada externa y de la rutina | `Sesión de servicio vencida o ausente: se renueva` |

## Reglas

Las comprueba [`logging-conventions.spec.ts`](../src/common/logging/logging-conventions.spec.ts), que corre en CI con `npm test`.

1. **Nada de `console.*`.** Usar `Logger` de `@nestjs/common`. `console` no pasa por `AppLogger`: no respeta `LOG_LEVEL` ni tapa secretos.
2. **La causa va dentro del texto, con `describeError`.**
   ```ts
   // Sí
   this.logger.error(`No se pudo crear la tarea — ${describeError(error)}`);

   // No: el AxiosError entero son cientos de líneas con la sesión de openMAINT
   this.logger.error('No se pudo crear la tarea', error);
   // No: Nest toma el segundo argumento como contexto y lo muestra entre corchetes
   this.logger.error('No se pudo crear la tarea:', error.message);
   ```
3. **Ningún objeto como argumento.** Los datos van en el texto como `clave=valor`.
4. **Solo ids.** Nunca payloads, respuestas completas, sesiones, contraseñas, PINes, tokens ni datos personales (cédula, nombre del huésped). La única excepción es la alarma IoT que no se pudo registrar: su payload es el único registro, porque la Raspberry no reintenta.
5. **Sin emojis ni saltos de línea.** `AppLogger` convierte los saltos en ` | `, pero mejor no escribirlos.

## Variables de entorno

| Variable | Valores | Uso |
|---|---|---|
| `LOG_LEVEL` | `error`, `warn`, `log` (defecto), `debug`, `verbose` | `log` en Render. Para depurar, `debug` durante un rato: añade cada llamada a openMAINT y a Contifico y el arranque completo de Nest. Cambiarla en Render redespliega; hay que devolverla a `log`. |
| `LOG_FORMAT` | vacía (texto) o `json` | `json` escribe una línea JSON por evento, con el campo `rid`, para enviar los logs a otra herramienta. |

Las E2E corren con `LOG_LEVEL=error` (`test/setup-env.ts`).

## Migraciones

`npm run migration:run:prod` ([`run-migrations.ts`](../src/database/run-migrations.ts)) deja una línea:

```
LOG [Migraciones] Sin migraciones pendientes
LOG [Migraciones] Aplicadas 2: CreateAppSession1789300000000, VehicularGateTrigger1789300000000
ERROR [Migraciones] No se aplicaron las migraciones: QueryFailedError: permission denied for schema public (42501) → el rol de DATABASE_URL_DIRECT no puede crear tablas: ¿es el dueño de la base?
```

Si falla una migración concreta, una línea anterior dice cuál (`Migration "X" failed`).

## Qué lo garantiza

| Pieza | Qué hace |
|---|---|
| [`AppLogger`](../src/common/logging/app-logger.ts) | Una línea por evento; resume cualquier error y tapa las claves sensibles de cualquier objeto, aunque alguien se salte la convención; sin colores fuera de una terminal; oculta el anuncio de rutas y módulos de Nest. |
| [`describeError`](../src/common/logging/describe-error.util.ts) | La causa en una línea de como mucho 300 caracteres: método, ruta (sin host ni query, con `/sessions/***`), estado y mensaje del servicio. |
| [`requestContext`](../src/common/logging/request-context.ts) | El `rid` de cada petición, la cabecera `X-Request-Id` y la línea `[HTTP]`. |
| [`AllExceptionsFilter`](../src/common/filters/all-exceptions.filter.ts) | Una línea por error no controlado, sin cambiar la respuesta al cliente. |

## Antes y después

Medido el 2026-10-19:

| Caso | Antes | Ahora |
|---|---|---|
| Un error de axios registrado | 567 líneas, con contraseña y sesión | 1 línea, sin secretos |
| Arranque del backend | 201 líneas | 10 |
| Migración fallida por permisos | 65 líneas | 1, con pista |
| Llamada correcta a openMAINT | 2 líneas de ~424 caracteres | ninguna (1 con `debug`) |
