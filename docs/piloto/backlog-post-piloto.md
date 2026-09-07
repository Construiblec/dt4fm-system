# Backlog Post-Piloto

Lista abierta el **2026-08-31** junto con el congelamiento de `v0.1.0-rc1`.

Su función, según el **5.2** del procedimiento, es evitar que el GDGI se quede indefinidamente en estado de prototipo: a partir del congelamiento **no se incorporan funcionalidades nuevas**, y todo lo que aparezca durante la certificación o el piloto entra aquí en vez de al código.

---

## Cómo se clasifica lo que entra

Todo hallazgo o petición se etiqueta con **dos** cosas: su severidad y su naturaleza.

### Severidad — 16

| | | Tratamiento |
|---|---|---|
| **P1** | Impide operar o compromete información | Atención inmediata. Bloquea el piloto |
| **P2** | Una función importante falla, pero hay alternativa | Corrección prioritaria |
| **P3** | Problema funcional que no impide trabajar | Entra en la próxima versión |
| **P4** | Detalle visual o mejora menor | Backlog |
| **RF** | Funcionalidad nueva pedida por el cliente | Backlog de producto |

### Naturaleza — 23

| | |
|---|---|
| **A** | Corrección del producto: se incorpora al GDGI |
| **B** | Mejora general: entra al road map |
| **C** | Configuración específica del cliente: **no debe convertirse en código** si se resuelve configurando |
| **D** | Desarrollo particular: se evalúa aparte |

La clasificación **C** es la que más protege el producto. Sin ella, cada petición del cliente termina siendo una rama de código y el GDGI se convierte en un software distinto por cada cliente.

---

## Regla de admisión durante la certificación

Dentro de la quincena de certificación **solo se corrigen P1 y P2**. Todo lo demás se anota aquí y se queda aquí, aunque sea barato de arreglar. Es la regla que evita que la certificación se convierta en otra ronda de desarrollo.

---

## Abierto al congelamiento

Cuatro defectos conocidos, heredados del estado del prototipo. Los cuatro son la puerta de entrada del D3: la certificación no empieza a medir hasta cerrarlos.

| ID | Sev. | Nat. | Asunto | Estado |
|---|---|---|---|---|
| BP-001 | **P1** | A | Los endpoints de propietarios no exigen sesión. La identidad sale de un número en la URL, y los números son secuenciales: se puede leer el estado de cuenta de cualquier residente sin iniciar sesión. El endpoint de registro de pago además ignora el identificador de la ruta | **Cerrado parcialmente — ver abajo** |
| BP-002 | **P1** | A | CORS refleja cualquier `Origin` recibido y responde `Allow-Credentials: true`. Cualquier sitio puede llamar a la API desde el navegador de un usuario con sesión abierta | **Cerrado — ver abajo** |
| BP-003 | **P2** | A | El rol se valida contra la cabecera `x-role`, que el frontend toma de `localStorage`. Un usuario autenticado puede enviar el rol que quiera. Afecta a limpieza y a supervisión de mantenimiento | **Cerrado — ver abajo** |
| BP-004 | **P2** | A | No existe procedimiento de rollback escrito. El caso sin resolver es revertir una versión que ya aplicó una migración: deshacer el código no deshace el esquema | **Cerrado — ver abajo** |

### BP-001 · avance del 2026-08-31

**Hecho:**

- `OwnersIdentityService` resuelve la identidad del residente desde su sesión de openMAINT —nunca desde la URL—, con caché de 5 minutos porque resolver la ficha `Tenant` cuesta dos llamadas.
- `OwnerSessionGuard` exige sesión y comprueba que el `:tenantId` o `:userId` de la ruta sea el de quien llama. Cubierto por 12 pruebas unitarias.
- Aplicado a los **8 endpoints** que exponen datos de una persona concreta. Los públicos por diseño (login, registro, verificación, edificios, áreas comunes) siguen sin pedir sesión.
- Frontend: interceptor en `authApi` que adjunta la sesión, y la subida de comprobante pasa a usarlo en vez de `axios` suelto.

**Verificado el 2026-08-31:** suite E2E ejecutada contra Postgres real — **21/21 en verde**, incluidos los 8 casos nuevos (401 sin sesión, 403 al tenant ajeno, 403 sin ficha de propietario, 401 con sesión inválida). Las 15 suites del backend pasan completas (145/145, 2 `it.todo` intencionales).

**Pendiente:**

1. **Comprobar contra el servidor desplegado** que el acceso anónimo ya no funciona. La detección original fue por lectura de código y la corrección se verificó en local; falta la confirmación en Render.
2. **Propiedad del pago en el comprobante.** `POST /owners/payments/:paymentId/voucher` ya exige sesión, pero no verifica que el pago sea de quien lo sube: la ruta no lleva `tenantId`. Hay que resolver el propietario del pago desde openMAINT y compararlo. Es el resto de BP-001.
3. **Rutas `/owners/me/...`.** Hoy se conserva el identificador en la URL para no romper el frontend, pero ya no es una credencial. Migrar a rutas sin identificador elimina la comparación por completo.

### BP-002 · avance del 2026-09-03

**Hecho:** `main.ts` deja de reflejar cualquier `Origin` recibido. `app.enableCors()` valida contra una lista blanca (`CORS_ALLOWED_ORIGINS`, ver [`cors.config.ts`](../../backend/src/config/cors.config.ts)); sin la variable, usa por defecto los tres dominios reales del piloto (local, staging, producción — los mismos ya documentados en `APP_BASE_URL` de `.env.example`). Cada servicio de Render debería declarar solo los suyos (ver la tabla de variables en [backend-ci-cd.md](../../backend/docs/backend-ci-cd.md)), pero el valor por defecto ya cierra el hueco aunque no se configure.

**Verificado:** `cors.config.spec.ts`, 3 pruebas — sin variable, variable vacía, y parseo de una lista con espacios.

**Pendiente:** confirmar en el navegador, contra el servidor desplegado, que un origen fuera de la lista recibe la petición sin la cabecera `Access-Control-Allow-Origin` (la prueba real la hace el navegador, no un curl).

### BP-003 · avance del 2026-09-03

**Hecho:** nuevo `SessionRoleService` ([`session-role.service.ts`](../../backend/src/integrations/openmaint/session-role.service.ts)) resuelve el rol activo contra `GET /sessions/current` de openMAINT — no se cachea a propósito, porque el rol puede cambiar en cualquier momento vía `PUT /auth/role`. `cleaning-tasks` y `maintenance-supervision` dejan de leer `x-role`: el parámetro y las cabeceras Swagger que lo documentaban se retiraron de los 12 endpoints de supervisión de mantenimiento y de los 6 de limpieza que lo usaban. Mismo criterio que BP-001: la identidad (aquí, el rol) se resuelve del lado del servidor, nunca de un dato que declara el cliente.

**Verificado:** `session-role.service.spec.ts` (6 pruebas unitarias) más las suites E2E de ambos módulos — los dos `it.todo` de BP-012 se convirtieron en pruebas reales que fuerzan `x-role` con un valor de supervisor mientras la sesión real resuelve un rol sin privilegios, y confirman 403. 147/147 tests E2E en verde, 199/199 unitarios.

**Pendiente:** ninguno. La cabecera `x-role` puede seguir llegando desde el frontend durante la transición — el backend ya no la lee, así que no molesta ni hace falta coordinarlo con un despliegue del frontend.

### BP-004 · avance del 2026-09-03, ensayado el 2026-09-04

**Hecho:** [`procedimiento-rollback.md`](procedimiento-rollback.md) — cubre el caso simple (sin migración) y el difícil (con migración aplicada, con el orden obligatorio: revertir la migración primero, redesplegar el código después), el rollback del frontend en Vercel, y el de **openMAINT** (§5): resulta que sí existe — un `pg_dump`/`pg_restore` automatizado en el VPS, con cron diario a las 3am y 14 días de retención, que se documentó al detalle una vez el equipo compartió los scripts reales (`/opt/OpenMaintCore/scripts/`). Incluye dos ejemplos reales de este proyecto: el `down()` de `PushSubscriptionMultipleRoles`, que pierde los roles adicionales de una suscripción multi-rol al revertir, y los tres detalles no obvios que hacen funcionar el `pg_restore` de openMAINT (`-j 1`, sin `--no-owner`, y el `search_path` de la base).

**Ensayado el 2026-09-04 contra staging y la rama `development` de Neon.** El ensayo **falló en el primer comando** y destapó tres defectos del procedimiento escrito, ya corregidos en el documento: (1) la reversión exige la `DATABASE_URL_DIRECT` del panel de Render — la cadena directa de Neon conecta como `neondb_owner`, que no es dueño de las tablas, y falla con `must be owner of table`; (2) `main`/`develop` están protegidas, así que el `git push` que indicaba el documento no funciona: hace falta PR y merge; (3) la ventana entre revertir y redesplegar no dura ~3 min sino **hasta que el despliegue tenga éxito** — durante el ensayo la migración revertida reapareció sola **dos veces**. Tiempos medidos en la §6 del documento. Hallazgos nuevos registrados como BP-020 a BP-026.

**Pendiente:** el rollback de **openMAINT** (§5 del documento) sigue sin ensayarse — se documentó a partir de los scripts reales, pero no se ha ejecutado una restauración de prueba sobre el clon. Al revisar esos scripts salieron además 6 riesgos operativos (BP-014 a BP-019), ninguno bloqueante para usarlo hoy.

---

## Funcionalidad congelada

Trabajo terminado o en curso que **no entra** en la RC1 por aplicación del 5.2.

| ID | Nat. | Asunto | Origen |
|---|---|---|---|
| BP-005 | B | Mejora del filtro de reservas de áreas comunales | Rama `feature/reserva-filtro`, un commit sin fusionar al momento del congelamiento |

> Si se decide incluirla en la RC1, debe fusionarse **antes** de empujar el tag y salir de esta lista. Ver la nota de decisión en el acta de congelamiento.

---

## Mejoras detectadas, sin bloquear

Salidas de la revisión técnica previa. Ninguna impide certificar.

| ID | Sev. | Nat. | Asunto |
|---|---|---|---|
| BP-006 | P3 | A | `.gitignore` no cubre `node_modules`: 584 de 975 archivos versionados provienen de la carpeta de documentación de Hostaway |
| BP-007 | P3 | A | `backend/.env.example` contiene lo que parecen credenciales reales (`admin`, contraseña de cuatro dígitos) apuntando a una IP concreta, en vez de valores de ejemplo |
| BP-008 | P4 | A | Quedan en el repositorio `backend/typescript-errors.txt` con errores de compilación y un `sid.tmp` vacío en la raíz |
| BP-009 | P4 | A | `console.log('complete incident')` olvidado en el controlador de incidencias |
| BP-010 | P3 | A | El paso de lint del frontend lleva `continue-on-error`, así que el gate de calidad no bloquea nada |
| BP-011 | P3 | B | El `/health` no expone versión de aplicación, solo el SHA del commit. Convendría añadir la versión semántica al declarar la v1.0 |
| BP-014 | **P1** | A | En `db-restore.sh` (rollback de openMAINT), un `pg_restore` fallido se degrada a advertencia y el script igual reporta éxito: un rollback parcialmente restaurado puede quedar online sin que nadie se entere |
| BP-015 | P2 | A | Los scripts de respaldo/rollback de openMAINT (VPS) no tienen bloqueo entre sí: un rollback que coincide con el backup de las 3am puede truncar el dump del día, y `backup-check.sh` no lo detecta (solo mira fecha y cabecera) |
| BP-016 | P2 | A | `refresh-clon.sh` recorta sin avisar el historial de respaldos de producción de 14 a 8 días, porque no pasa `--retention` al llamar a `db-backup.sh` |
| BP-017 | P2 | A | Si el rollback de openMAINT se corta a la mitad (entre parar la app y terminar la restauración), no hay limpieza automática ni mensaje de qué hacer — producción puede quedar caída y sin base utilizable |
| BP-018 | P2 | B | El respaldo de openMAINT es diario (RPO de hasta 24h) y vive en el mismo disco que producción, sin copia automática fuera del VPS |
| BP-019 | P4 | A | Detalles menores de los scripts de respaldo de openMAINT: el horario del cron depende de que el VPS esté en UTC sin ninguna alerta si cambia, y `ensure_role` no actualiza la contraseña de `cmdbuild` si el rol ya existe |

| BP-020 | **P2** | A | El smoke test posterior al despliegue está desactivado por falta del secret `RENDER_SERVICE_URL_STAGING`: el pipeline reporta ✅ *Success* sin comprobar nada. Demostrado el 2026-09-04 — GitHub en verde mientras el despliegue se colgaba 15 min y acababa en `Timed Out` |
| BP-021 | **P2** | A | El arranque del backend se bloquea si openMAINT no responde (`CleaningTasksSessionService.onModuleInit` hace un login real). El despliegue muere por `Timed Out` de Render a los ~15 min, sin mensaje que indique la causa. **Impide desplegar —y por tanto hacer rollback— mientras openMAINT esté caído** |
| BP-022 | P3 | C | En staging las migraciones van encadenadas al *Start Command*, así que **cada reinicio re-aplica** lo que se acabe de revertir; en producción van en *Pre-Deploy* y no ocurre. La asimetría no estaba documentada y hace que ensayar el procedimiento en staging dé resultados engañosos |
| BP-023 | P3 | B | No hay definido quién puede aprobar un PR de reversión fuera de horario. `main` y `develop` están protegidas, así que todo rollback exige un merge humano — en el ensayo fue el tramo más lento (2m 07s de 4m 53s) |
| BP-024 | P3 | B | Arranque en frío de **41,6 s** en el plan Free de Render tras 15 min sin tráfico. Si las sesiones de usabilidad de la certificación se hacen contra staging, los participantes reportarán lentitud que no dice nada del producto |
| BP-025 | P3 | B | El *Instant Rollback* de Vercel solo aplica a producción; en staging está deshabilitado por ser entorno *Preview*. El mecanismo más rápido de recuperación del frontend **nunca se ha probado** |
| BP-026 | P4 | B | Staging está tras el SSO de Vercel y responde `302` a peticiones anónimas: ninguna verificación automática puede comprobar el frontend de staging. Vercel ofrece *Protection Bypass for Automation* si se quisiera |

Detalle completo de los seis en [`procedimiento-rollback.md`, §5.4](procedimiento-rollback.md#54-riesgos-conocidos--todavía-sin-arreglar).

---

## Cobertura de pruebas pendiente

| ID | Nat. | Asunto | Estado |
|---|---|---|---|
| BP-012 | A | Dos `it.todo()` marcados en las suites de limpieza y supervisión, a la espera de que el rol se resuelva desde la sesión (BP-003). Al corregirse, se convierten en pruebas reales | **Cerrado el 2026-09-03** — resuelto junto con BP-003, ver su avance arriba |
| BP-013 | B | El frontend no tiene pruebas automatizadas de ningún tipo. Fuera del alcance de la certificación, pero es el hueco más grande que queda | Pendiente |

---

## Añadidos durante la certificación

_Vacío. Se completa entre el D1 y el D10._

| ID | Sev. | Nat. | Asunto | Origen | Fecha |
|---|---|---|---|---|---|

---

## Añadidos durante el piloto

_Vacío. Se completa durante las dos semanas de operación controlada del 15._

| ID | Sev. | Nat. | Asunto | Origen | Fecha |
|---|---|---|---|---|---|
