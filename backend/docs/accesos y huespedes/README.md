# Control de accesos

Emite, sincroniza y revoca los PINes que abren las puertas de los edificios, y proyecta las reservas
de Hostaway sobre las que se apoyará el portal del huésped.

| Documento | Para qué |
|---|---|
| Este | Qué hace el módulo y cómo está construido |
| [decisiones-arquitectura-y-seguridad.md](decisiones-arquitectura-y-seguridad.md) | Por qué está construido así. D-01 a D-17, cerradas |
| [guia-servidor-vps-accesos.md](guia-servidor-vps-accesos.md) | Contrato para Ingeniería IoT: qué debe implementar la VPS |

---

## 1. Las tres capas

```text
Backend DT4FM (Render + Postgres)        AUTORIDAD DE NEGOCIO
  reserva, huésped, ciclo de vida, PIN, portal
        │  HTTPS · Cloudflare Access · service token
        ▼
VPS central (Cloudflare Tunnel)          AUTORIDAD DE DISPOSITIVOS
  inventario, employeeNo, orquestación
        │  credencial propia por gateway
        ▼
Gateway por edificio                     EJECUCIÓN
  ISAPI dentro de la LAN aislada
        ▼
Terminales Hikvision                     DECISIÓN SIN RED
```

El backend habla **solo** con la VPS: una URL y un service token. Nunca alcanza un terminal, y la
VPS nunca llama al backend.

**La VPS todavía no existe.** Todo el módulo funciona hoy contra
[access-iot.mock.ts](../../src/modules/access-control/access-iot.mock.ts), gobernado por
`ACCESS_IOT_USE_MOCK`.

## 2. Qué abre un PIN

No hay cerraduras por departamento. El control está solo en la **entrada peatonal** del edificio y
en la **vehicular**; lo demás se abre con llave física. De ahí que `scope` sea
`pedestrian` / `vehicular` / `both` y que `openmaint_unit_id` **no decida nada**: es contexto para
soporte y para el portal.

**Solo Inglaterra (`ING`, `3025058`) y Pradera (`PRA`, `3019998`) tienen puertas con PIN.** Republica
(`564939`) tiene reservas de Hostaway pero no lectores, así que una estancia sin credencial es el
caso normal, no una anomalía. La cobertura se consulta a `GET /v1/buildings` y se cachea 10 minutos
([building-catalog.service.ts](../../src/modules/access-control/building-catalog.service.ts)):
añadir hardware a un edificio nuevo es una operación del lado IoT, no un despliegue del backend.

Un edificio sin cobertura tiene **dos respuestas correctas**, y confundirlas ensucia el log o
esconde un fallo real:

| Origen | Comportamiento |
|---|---|
| Manual, `POST /access/credentials` | **Error explícito.** Pedir un PIN donde no hay lector es un error del operador |
| Automático, desde una reserva | **No se emite, y ya.** Nivel informativo. La estancia se crea igual |

## 3. Modelo de datos

Dos tablas.
[Migración `1788826000000`](../../src/database/migrations/1788826000000-CreateAccessControlTables.ts).

### `access_credential` — la autoridad

`subject_type` (`guest`/`tenant`/`employee`) + `subject_ref` identifican al dueño; para un huésped,
`subject_ref` es el id de reserva de Hostaway. El PIN vive cifrado en `pin_ciphertext` y su huella
HMAC en `pin_fingerprint`, que es lo que permite comprobar unicidad sin descifrar nada.

**Dos ejes de estado que no hay que confundir:**

- `status` — `pending` → `active` → `revoked` / `expired`. Es la **intención**.
- `sync_state` — `pending` / `synced` / `failed`. Es si esa intención llegó **al aparato**.

`sync_detail` (jsonb) guarda el resultado por dispositivo tal como lo devolvió la VPS. `failed`
significa que la credencial existe en el sistema pero no en la puerta, o al revés: pide atención
humana y es lo que cuenta `GET /access/health`.

**Tres índices llevan el peso:**

```sql
-- Unicidad del PIN por edificio, NO por (edificio, ámbito): un `both` y un
-- `pedestrian` con el mismo PIN no colisionan en el índice, pero sí en el
-- terminal peatonal, que es donde importa.
UNIQUE (building_id, pin_fingerprint)          WHERE status IN ('pending','active')

-- Impide la doble emisión cuando el webhook y el barrido coinciden.
UNIQUE (subject_type, subject_ref, scope)      WHERE status IN ('pending','active')

-- La cola de reintentos.
INDEX  (sync_state, updated_at)                WHERE sync_state <> 'synced'
```

### `guest_stay` — la estancia

Se crea para **toda** reserva, haya cobertura o no: es el cimiento del portal, no un accesorio de
los PINes. Guarda huésped, fechas, unidad y edificio resueltos, y la vigencia calculada.
`token_version` y `guest_last_name_hash` están desde ya para no pagar una segunda migración cuando
llegue el portal.

## 4. Ciclo de una credencial

```text
issue()  ──▶ pending/pending ──▶ PUT a la VPS ──▶ written ──▶ active/synced
                                              └─▶ partial/unreachable ──▶ reintento cada 10 min
revoke() ──▶ revoked/pending ──▶ DELETE a la VPS ──▶ revoked/synced
```

Las reglas que no son obvias, todas en
[credential.service.ts](../../src/modules/access-control/credential.service.ts):

- **`issue()` es idempotente** por `(sujeto, ámbito)`: si ya hay credencial viva, la devuelve.
- **`reschedule()` y `changeScope()` no tocan el PIN.** El dueño ya lo tiene anotado; cambiarlo por
  un cambio de fechas lo dejaría fuera.
- **`pin_conflict` regenera y reemite**, hasta 3 veces. El terminal comparte espacio de PINes con
  residentes cargados a mano que el backend no conoce, así que el índice único de Postgres no basta.
- **La llamada a la VPS queda fuera de toda transacción.** Si el proceso muere ahí, la fila ya está
  en `pending` y el barrido la recoge.
- **`partial` no es un error**: el PIN escrito en el portal peatonal pero no en la barrera deja
  entrar a pie, y el panel debe poder decirlo.

## 5. De dónde salen las credenciales

**Automático — `POST /webhooks/hostaway`.** Responde `200` siempre y trabaja en segundo plano: un
fallo de accesos no puede romper nada aguas arriba. Protegido por `HOSTAWAY_WEBHOOK_SECRET` con
`timingSafeEqual`; sin secreto configurado responde `503` en vez de quedar abierto.
[guest-stay.service.ts](../../src/modules/access-control/guest-stay.service.ts) resuelve el edificio
por `Unit.HostawayListingID` en openMAINT, calcula la vigencia y emite. Reserva cancelada
(`cancelled` / `declined` / `expired`) revoca en bloque.

Emite **siempre `pedestrian`**: no hay ninguna fuente que diga si el huésped trae vehículo. Ampliarlo
es manual, con `POST /access/credentials/:id/scope`.

**Manual — `POST /access/credentials`.** Para residentes y personal, y para cualquier caso que el
webhook no cubra.

**Vigencia.** `arrival_date` a las `ACCESS_CHECKIN_HOUR` menos `ACCESS_GUEST_LEAD_HOURS`, hasta
`departure_date` a las `ACCESS_CHECKOUT_HOUR` más `ACCESS_GUEST_GRACE_HOURS`. Hostaway solo da
fechas, no horas. La conversión a instante ocurre en **un único punto** (`LOCAL_UTC_OFFSET = '-05:00'`,
Ecuador no tiene horario de verano); si algún día hay un edificio en otra zona, se cambia ahí.

## 6. Endpoints

Todos bajo sesión de openMAINT (`x-session-token`) y rol `SuperUser` — no existe un rol con code
`Admin`.

| Ruta | Nota |
|---|---|
| `GET /access/credentials` | Filtra por `subject`, `status`, `buildingId`. **Nunca devuelve el PIN**: expone `pinConfigured` booleano |
| `POST /access/credentials` | Alta manual. `400` si el edificio no tiene cobertura |
| `POST /access/credentials/:id/revoke` | Con motivo |
| `POST /access/credentials/:id/scope` | Asignación manual de ámbito vehicular. El PIN no cambia |
| `GET /access/credentials/:id/pin` | **Excepción temporal.** Ver abajo |
| `GET /access/health` | Estado por edificio + credenciales en `failed` |
| `POST /webhooks/hostaway` | Sin sesión: secreto compartido en cabecera |

**`GET /access/credentials/:id/pin` es deliberadamente una excepción.** Sin portal no hay canal de
entrega y soporte necesita poder leer el PIN. Está detrás de `ACCESS_ALLOW_PIN_REVEAL` (`false` por
defecto), exige rol de administración y deja `logger.warn` con credencial y usuario en cada lectura.
Se apaga el día que el portal entre en servicio.

## 7. Barridos

`@Cron` con `BUSINESS_TIMEZONE`, todos con el mismo interruptor `ACCESS_SCHEDULER_ENABLED`
comprobado **dentro** del método: los decoradores se evalúan al importar, antes de que Nest instancie
nada.

| Cuándo | Qué hace |
|---|---|
| `*/10 * * * *` | Reintenta lo no sincronizado. Agotado `ACCESS_SYNC_MAX_ATTEMPTS`, marca `failed` |
| `10 * * * *` | Marca `expired` lo vencido. Contabilidad: el terminal ya lo ignora solo |
| `0 3 * * *` | Purga: `DELETE` de lo `expired`/`revoked` aún escrito. Sin esto el terminal se llena y **rechaza altas** |
| `30 3 * * *` | Concilia contra el inventario real de cada dispositivo |
| `0 5 * * *` | Repasa 14 días de llegadas en Hostaway. Red de seguridad del webhook |

**La conciliación nunca borra lo que no lleva prefijo `DT4-`**: lo reporta y lo deja. Un barrido
«limpiador» dejaría a residentes fuera de su casa. Y el inventario **se pagina siempre**; un tope
fijo trunca en silencio en terminales llenos.

El barrido de reservas existe porque un webhook perdido no se nota: la reserva no se proyecta y el
huésped llega sin PIN, o peor, una cancelación no entregada deja un PIN vivo.

## 8. Variables de entorno

Definidas en [.env.example](../../.env.example).

| Variable | |
|---|---|
| `ACCESS_PIN_KEY` | **Obligatoria.** AES-256-GCM, 32 bytes en base64. Rotarla exige re-cifrar la tabla |
| `ACCESS_PIN_FINGERPRINT_KEY` | **Obligatoria.** HMAC de la huella. Distinta de la anterior, para que comprometer la huella no ayude a descifrar |
| `ACCESS_IOT_URL` | **Obligatoria.** VPS central, sin barra final |
| `ACCESS_IOT_TOKEN` | **Obligatoria.** Service token de Cloudflare Access, formato `<client-id>:<client-secret>` |
| `HOSTAWAY_WEBHOOK_SECRET` | **Obligatoria.** Vacío ⇒ el webhook responde `503` |
| `ACCESS_IOT_USE_MOCK` | `true` responde desde el mock sin salir a la red. Obligatorio en E2E |
| `ACCESS_PIN_LENGTH` | `4` por decisión del cliente |
| `ACCESS_PIN_COOLDOWN_DAYS` | `30`. Días antes de reasignar un PIN liberado |
| `ACCESS_SYNC_MAX_ATTEMPTS` | `5` |
| `ACCESS_ALLOW_PIN_REVEAL` | `false` |
| `ACCESS_SCHEDULER_ENABLED` | `false`. Solo `true` activa los barridos |
| `ACCESS_CHECKIN_HOUR` / `ACCESS_CHECKOUT_HOUR` | `15` / `11`. Deben coincidir con lo pactado con el huésped |
| `ACCESS_GUEST_LEAD_HOURS` / `ACCESS_GUEST_GRACE_HOURS` | Margen antes de llegada y después de salida |

Las dos claves se generan igual, y **no son intercambiables**:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## 9. Pruebas

```bash
docker compose up -d && npm run migration:run    # Postgres local en :5555
npm test                                          # unitarias
npm run test:e2e                                  # suite access-control
```

Las E2E fijan sus variables en `test/setup-env.ts` con `=` literal, no `??=`: el `ConfigModule`
carga el `.env` del directorio de trabajo, y sin fijarlas la suite dependía de la configuración
local de quien la ejecutara.

Para probar a mano el flujo completo, `ACCESS_IOT_USE_MOCK=true` y emitir por
`POST /access/credentials`. El mock tiene escenarios deterministas: `PRA-VEHICULAR-1` está caído a
propósito (camino `partial`) y `ING-PEATONAL-1` tiene un usuario manual con PIN `4821` (camino
`pin_conflict` y usuario ajeno para la conciliación).

## 10. Lo que aún no existe

- **Portal del huésped.** Confirmado, sprint posterior. Faltan `GuestTokenService` con HMAC propio,
  guard de sesión y entrega del enlace. En un edificio sin PIN se oculta el bloque de credenciales y
  el resto del portal se conserva.
- **Auditoría de aperturas.** Nada lee `AcsEvent` hoy, ni aquí ni en la VPS. La tabla `access_event`
  vuelve cuando exista la fuente.
- **Sensores ambientales.** El «estado de la habitación» del portal se refiere a ellos. No existen.
