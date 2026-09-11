# Portal del huésped — magiclink

**Fecha:** 2026-09-11 · **Rama:** `feature/magiclink`

Documenta el módulo `guest-portal` construye sobre `guest_stay`, tal como fija la decisión
[D-02](../decisiones-arquitectura-y-seguridad.md#d-02--el-portal-del-huésped-es-de-dt4fm)
de este mismo directorio. El README general del control de accesos
([`../README.md`](../README.md)) lo daba como pendiente en su §10; este documento es el
que cierra ese pendiente.

---

## 1. Decisión de diseño central: el token es un puntero, no una copia

El token **no lleva fechas**. Firma únicamente:

```json
{ "v": 1, "s": "<guest_stay.id>", "tv": "<token_version>", "n": "<nonce>" }
```

En cada canje se relee `guest_stay` en vivo y se decide la vigencia contra la fila
**en ese instante** — nunca contra lo que diga el token.

**Por qué.** Es un requisito de producto explícito: si el check-out se extiende después
de emitir el enlace (típicamente porque Hostaway avisa de una modificación de reserva),
el mismo enlace ya entregado tiene que acompañar la fecha nueva, sin reenviarse. Si el
token grabara la fecha de vencimiento, extenderla obligaría a reemitir y reenviar.

**Consecuencia comprobada:** como `action` del webhook de Hostaway (`reservation_created`
/ `reservation_updated`) no se usa para ramificar ninguna lógica —confirmado leyendo
[`reservations.controller.ts`](../../../src/modules/access-control/reservations.controller.ts)—,
toda modificación de reserva pasa por el mismo `GuestStayService.upsertFromReservation()`
que recalcula `access_valid_from`/`access_valid_to` y los guarda. El enlace los hereda
solo, sin ningún código nuevo de por medio.

## 2. Decisiones de producto (tomadas explícitamente, no supuestas)

| Decisión | Valor | Por qué |
|---|---|---|
| Segundo factor | **Ninguno** | El enlace es la única credencial. Compartirlo es responsabilidad del huésped, no del sistema |
| Visibilidad del PIN | Inmediata al abrir, **dentro de la ventana de acceso** | Antes del check-in dice *"Tu PIN se mostrará a la hora de tu check-in"*; después del check-out, el enlace deja de abrir |
| Regenerar PIN | **No invalida** el enlace | El portal siempre muestra el PIN vigente; el enlace nunca cachea uno viejo |
| Edificios sin cobertura (Batán, República) | **Sí** reciben enlace | El portal es más que el PIN; el bloque de credenciales se sustituye por un aviso (`pinState: "sin-cobertura"`) |
| Emisión del enlace | Pensada para ser automática al confirmarse la reserva | **No implementado aún** — ver §6 |

## 3. Piezas nuevas

**Dentro de `access-control`** (no se tocó su lógica, solo se sumó una pieza):

- [`guest-portal-data.service.ts`](../../../src/modules/access-control/guest-portal-data.service.ts)
  — único punto por el que el portal llega a los datos de accesos. Mantiene
  `CredentialService` (y con él `revealPin()`) **dentro** del módulo de control de
  accesos: el portal nunca lo recibe, solo pide `getPortalData(stay)` y recibe un DTO
  plano. El PIN solo se descifra cuando además se va a mostrar.

**Módulo nuevo `guest-portal`:**

- `guest-token.service.ts` — HMAC-SHA256 sobre el payload de arriba. Reutiliza casi
  entero el criptografiado del `guest-access` retirado (12 pruebas ya probadas), cambiando
  solo qué va dentro del payload.
- `guest-portal.service.ts` — decide si un enlace sigue sirviendo: firma válida,
  `token_version` vigente, estancia no cancelada, dentro de la ventana de acceso.
- `guards/guest-token.guard.ts` — exige el token en `Authorization: Bearer`,
  `x-guest-token`, o `?token=` (solo para la primera carga).
- `guest-portal.controller.ts` — `POST /guest/magic-link` y `GET /guest/me`.

**Frontend:** `GuestDashboardPage.tsx` en `/guest/dashboard`, texto plano sin estilos.
Su valor no es visual: expone campos crudos (`openmaintUnitId`, `syncState`) que hoy no se
ven en ninguna pantalla, y sirve de diagnóstico de qué listings de Hostaway no están
mapeados a una unidad de openMAINT.

## 4. Endpoints

| Ruta | Auth | Qué hace |
|---|---|---|
| `POST /guest/magic-link` | Sesión de openMAINT, rol `SuperUser` | Emite el enlace de una estancia (`stayId`, uuid de `guest_stay`) |
| `GET /guest/me` | El propio enlace | Devuelve los datos del portal. `pin` solo viene si `pinState: "disponible"` |

`pinState` puede ser `disponible`, `antes-del-checkin`, `finalizado`, o `sin-cobertura`
— el frontend decide qué texto mostrar según ese campo, nunca inventa uno propio.

## 5. Lo que falta

- **Envío automático del enlace.** Hoy solo existe la emisión manual vía
  `POST /guest/magic-link`. Conectarlo a `GuestStayService.upsertFromReservation()`
  exige sacar `GuestTokenService` a un módulo aparte, para evitar una dependencia
  circular (`access-control` necesitaría el token, `guest-portal` necesita
  `access-control`).
- **Regenerar PIN a demanda.** No existe ningún endpoint para que un supervisor pida un
  PIN nuevo fuera del automatismo de `pin_conflict`. El frontend de Supervisor CAV ya
  espera `POST /access-authorizations/:id/regenerate`, que no tiene contraparte en el
  backend.
- **Extender el check-out a mano (No es urgente, todo se registra en hostaway).** `CredentialService.reschedule()` existe y mueve la
  ventana de una credencial, pero solo se dispara automáticamente cuando Hostaway avisa
  de una modificación — no hay endpoint para que un humano lo haga sin que la orden venga
  de Hostaway.

## 6. Verificado

292 pruebas unitarias + 193 E2E contra Postgres real, y un recorrido manual completo:
enlace sin cobertura, antes del check-in, estancia cancelada (401), extensión de
check-out con el **mismo** token (sin reemitir), y `token_version` como freno de
emergencia. El detalle de cómo reproducirlo está en `pruebas-locales.md`, en esta misma
carpeta — no se sube al repositorio porque referencia datos y secretos de un entorno
local concreto.
