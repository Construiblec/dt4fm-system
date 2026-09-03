# Procedimiento de rollback

Cierra BP-004 del [Backlog Post-Piloto](backlog-post-piloto.md). Hasta ahora, si una versión desplegada resultaba defectuosa, no había un documento que dijera qué hacer y en qué orden — se improvisaba. Esto define los pasos para los casos reales que puede tener el GDGI, y en particular el que es fácil hacer mal: revertir código cuando la versión rota **ya aplicó una migración** a la base de datos.

No es un documento teórico: los comandos y el ejemplo del final son los reales de este proyecto.

---

## 1. Primero, la pregunta que decide todo

> **¿La versión que se quiere retirar aplicó una migración nueva?**

- **No** → [Caso A](#2-caso-a-rollback-sin-migración-de-por-medio). Es el caso simple: basta con volver al código anterior.
- **Sí** → [Caso B](#3-caso-b-rollback-con-migración-aplicada). El código viejo puede no entender la forma nueva de la base de datos: revertir solo el código no alcanza, y el orden de los pasos importa.

Para saberlo: `npm run migration:show:prod` (con `DATABASE_URL_DIRECT` apuntando al entorno afectado) lista qué migraciones están aplicadas. Si la última migración del repo aparece marcada como aplicada y es posterior al último commit "bueno" conocido, es Caso B.

Esto solo aplica a **Neon**, la base propia del backend (push, notificaciones, idempotencia). **openMAINT tiene su propio mecanismo, separado y más pesado** — ver la [sección 5](#5-openmaint-vps).

---

## 2. Caso A: rollback sin migración de por medio

El caso normal: un despliegue rompió algo (un bug de lógica, una regresión), pero el esquema de la base de datos no cambió desde la última versión buena.

1. **Identificar el último commit bueno** — el que estaba en producción antes del despliegue problemático. `git log --oneline` sobre `main`, o el campo `commit` de `GET /health` de un despliegue anterior si quedó registrado en algún sitio.
2. **Revertir el código:**
   ```bash
   git revert <commit-o-rango-problemático>
   git push origin main
   ```
   Se usa `git revert`, no `git reset --hard` + `push --force`: el historial de `main` no se reescribe, y el CI vuelve a correr sobre el commit de reversión como cualquier otro (test → build → deploy), que es la garantía que ya existe en el pipeline.
3. El job `deploy` de GitHub Actions dispara el webhook de Render y corre el smoke test contra `/health` como en cualquier despliegue normal (ver [backend-ci-cd.md](../../backend/docs/backend-ci-cd.md)).
4. Confirmar en `/health` que el campo `commit` coincide con el commit de reversión.

No hace falta tocar Neon: el esquema no cambió, así que el código anterior sigue siendo compatible con él.

---

## 3. Caso B: rollback con migración aplicada

Aquí está el riesgo real. Si la versión rota ya corrió `npm run migration:run:prod` (el *Pre-Deploy Command* de producción, ver [backend-ci-cd.md](../../backend/docs/backend-ci-cd.md#2-configuración-de-los-servicios-en-render)), la base de datos tiene una forma nueva. El código anterior fue escrito contra la forma vieja: si la migración cambió una columna o una tabla que ese código usa, sus consultas fallan en cuanto reciban tráfico.

### El orden no es negociable

```
1. Revertir la migración (Neon vuelve a la forma vieja)
2. Recién entonces, redesplegar el código viejo
```

**Nunca al revés.** Si se redespliega el código viejo primero, hay una ventana — por corta que sea — en la que código viejo corre contra esquema nuevo, y ahí es donde se cae.

### Paso a paso

1. **Revertir la migración**, con `DATABASE_URL_DIRECT` (nunca la de pooler — rompe los *advisory locks* de DDL, ver [neon-postgres.md](../../backend/docs/neon-postgres.md#2-las-dos-cadenas-de-conexión)) apuntando a la rama de Neon del entorno afectado:
   ```bash
   npm run migration:revert:prod
   ```
   Revierte **una sola migración**, la última aplicada. Si hay que retroceder varias, se corre tantas veces como migraciones haya que deshacer, de la más reciente hacia atrás. `npm run migration:show:prod` confirma el estado en cada paso.

2. **Antes de revertir, evaluar si hay datos que perder.** El `down()` de una migración no siempre es el inverso perfecto del `up()` — puede haber datos escritos por la versión nueva que el `down()` descarta. Ver el [ejemplo real](#4-ejemplo-real-de-este-proyecto) más abajo: no es hipotético, ya existe una migración en este repo con ese problema. Si la pérdida es inaceptable, **exportar esas filas antes de revertir** (`COPY` a un archivo, o una consulta puntual guardada aparte) para poder reconstruirlas a mano después.

3. **Recién ahora, redesplegar el código anterior** — mismos pasos que el [Caso A](#2-caso-a-rollback-sin-migración-de-por-medio): `git revert` + push a `main`.

4. El *Pre-Deploy Command* (`npm run migration:run:prod`) vuelve a correr en el despliegue del código viejo. Es inocuo: como la migración ya se revirtió en el paso 1, no hay nada pendiente que aplicar — es una consulta de verificación y sale.

5. Confirmar `/health` (`commit`) y, en la consola de Neon, que la tabla afectada volvió a su forma anterior.

### Si el plan de Render no tiene *Pre-Deploy Command* (staging)

En desarrollo las migraciones se encadenan al *Start Command* (`npm run migration:run:prod && node dist/main.js`, ver [backend-ci-cd.md](../../backend/docs/backend-ci-cd.md)). El orden de los pasos 1–3 no cambia: se revierte la migración a mano contra la rama `development` de Neon **antes** de desplegar el código viejo, exactamente igual que en producción.

---

## 4. Ejemplo real de este proyecto

La migración `PushSubscriptionMultipleRoles1787600000000` cambió `push_subscriptions.role` (texto) a `roles` (array), para que una cuenta con varios grupos de openMAINT reciba avisos de todos y no solo del rol activo.

Su `down()` (código completo en [`1787600000000-PushSubscriptionMultipleRoles.ts`](../../backend/src/database/migrations/1787600000000-PushSubscriptionMultipleRoles.ts)) hace esto para volver a la forma vieja:

```sql
UPDATE "push_subscriptions" SET "role" = "roles"[1]
```

**Solo sobrevive el primer rol de cada suscripción.** Si entre que se aplicó la migración y que se decide revertirla alguna cuenta multi-rol se suscribió o actualizó su suscripción con más de un rol, revertir pierde esa información — no hay forma de reconstruir cuáles eran los roles adicionales a partir de la tabla ya reducida. Es exactamente el caso de la [sección 3, paso 2](#paso-a-paso): antes de correr `migration:revert:prod` sobre esta migración en particular, conviene:

```sql
-- Antes de revertir: registrar qué suscripciones tenían más de un rol.
SELECT endpoint, roles FROM push_subscriptions WHERE array_length(roles, 1) > 1;
```

y guardar el resultado aparte. Después de revertir, si hace falta reaplicar la migración más adelante, esas filas se pueden actualizar a mano con los roles que tenían.

---

## 5. openMAINT (VPS)

A diferencia de Neon, openMAINT **sí tiene un mecanismo de rollback** — pero vive fuera de este repositorio, en el propio VPS, y es de otra naturaleza: en vez de revertir un cambio puntual de esquema, **reemplaza la base de datos entera** por la copia más reciente. Es la fuente de verdad de todo el negocio (activos, correctivos, preventivos, propietarios), así que este es el rollback de mayor impacto de los tres que cubre este documento.

### 5.1 Qué existe

Scripts en `/opt/OpenMaintCore/scripts/` del VPS (repo Git aparte, salvo `backup.env`, que queda fuera con `.gitignore` porque tiene la contraseña del rol de la app):

| Script | Qué hace |
|---|---|
| `_lib.sh` | Config compartida (lee `backup.env`) y helpers comunes a los demás scripts |
| `db-backup.sh` | Respaldo: `pg_dump -Fc` en caliente (no apaga la app), valida que el archivo no sea sospechosamente chico, rota según `RETENTION` |
| `db-restore.sh` | **El rollback.** Reemplaza la base de un entorno (`prod` o `clon`) por un dump |
| `refresh-clon.sh` | Respalda `prod` y lo restaura en `clon`, para que el clon quede al día |
| `backup-check.sh` | Verifica que el último dump exista, no esté vencido y tenga cabecera válida |
| `backup-cron.sh` | El que dispara el cron — envuelve `db-backup.sh` y deja rastro en el log |

### 5.2 El respaldo diario

```
0 8 * * * bash /opt/OpenMaintCore/scripts/backup-cron.sh prod 14 >> /var/log/openmaint-backup.log 2>&1
```

08:00 UTC = 03:00 Guayaquil (el host corre en UTC). Retención: 14 copias de producción, en `/var/backups/openmaint/prod`. Estado real al 2026-09-03: 14 dumps, ~450 MB cada uno (~6,3 GB en total, disco al 24 %), el último de hoy a las 08:01, sin ningún `FAIL` en el log en las últimas dos semanas.

### 5.3 Cómo hacer el rollback

```bash
# 1. Verificar que hay un dump sano y reciente
bash backup-check.sh --target prod

# 2. Elegir el dump (por fecha, en /var/backups/openmaint/prod/)
ls -1t /var/backups/openmaint/prod/openmaint_prod_*.dump

# 3. Restaurar — pide confirmación escribiendo "prod" a propósito, para que no
#    sea un accidente de copiar/pegar
bash db-restore.sh --target prod --file /var/backups/openmaint/prod/openmaint_prod_<fecha>.dump
```

`db-restore.sh` hace, en este orden: **(1)** un backup de seguridad del destino antes de tocar nada, **(2)** para la app, **(3)** corta conexiones activas y recrea la base vacía, **(4)** restaura con `pg_restore`, **(5)** levanta la app de nuevo.

**Tres detalles que hacen que funcione, ya documentados en el propio script porque le costaron una tarde de depuración al equipo (2026-07-30) — un `pg_restore` a mano, sin este script, muy probablemente pisa alguno de los tres:**

- `pg_restore` corre con **un solo job (`-j 1`)**, nunca en paralelo. Con `-j 3` fallaron 4 tablas (`CorrectiveMaint`/`PreventiveMaint` y sus históricos): `pg_restore` paraleliza los `COPY` sin conocer dependencias escondidas dentro de funciones SQL (`_cm3_lookup_code()`), y cada `COPY` es su propia transacción — la tabla queda vacía **en silencio**, sin ningún error visible.
- **Sin `--no-owner`**, a propósito: con esa bandera todo queda propiedad de `postgres` en vez de `cmdbuild`, y la app arranca con "permission denied" en tablas como `_Patch` — la vez que pasó hubo que reasignar el dueño a mano en ~800 objetos.
- Después de crear la base hace falta `ALTER DATABASE ... SET search_path TO "$user", public, gis` — `pg_dump` no lo incluye, y sin esto `postgis_lib_version()` no resuelve y falla el chequeo "GIS Service" al arrancar.

### 5.4 Riesgos conocidos — todavía sin arreglar

Detectados al revisar los scripts. Ninguno impide usar el rollback hoy, pero conviene tenerlos presentes antes de operarlo bajo presión:

1. **Sin bloqueo entre los tres scripts.** Si un rollback arranca mientras el backup de las 3am está corriendo (o se solapan por unos segundos), el paso que corta conexiones mata también al `pg_dump` a mitad de escritura. El archivo queda truncado en disco, y `backup-check.sh` lo da por sano porque solo mira la fecha y los primeros 5 bytes — nunca valida el resto del archivo. Arreglo simple pendiente: un `flock` por entorno al principio de `db-backup.sh` y `db-restore.sh`.
2. **`refresh-clon.sh` recorta el historial de producción sin avisar.** Llama a `db-backup.sh --target prod` sin pasar `--retention`, así que usa el `RETENTION=8` de `backup.env` en vez del `14` que usa el cron — cada sincronización al clon poda el historial de producción de 14 a 8 días de golpe.
3. **Un `pg_restore` fallido no aborta el rollback.** El error se degrada a advertencia (`|| warn`), el script sigue, levanta la app y termina reportando éxito — un rollback parcialmente restaurado queda online sin que nadie se entere, salvo revisión manual. No hay verificación posterior (conteo de filas, arranque real de la app).
4. **Si el proceso se corta a la mitad, no hay limpieza automática.** Entre parar la app y terminar la restauración, producción puede quedar caída y sin base utilizable, sin ningún mensaje que diga qué hacer a continuación.
5. **Un solo respaldo diario, en el mismo disco que producción.** Hasta 24 horas de trabajo se pueden perder en un rollback (el RPO es de un día, no de minutos), y si se pierde el VPS se pierden los 14 dumps con él — no hay copia automática fuera del servidor.
6. Detalles menores: el horario del cron depende de que el VPS esté en UTC; `ensure_role` no actualiza la contraseña de `cmdbuild` si el rol ya existe, así que un clon restaurado en una base vacía puede quedar con una contraseña distinta a la del `.env` de la app.

**Mientras esto no se corrija:** evitar disparar un rollback manual cerca de las 08:00 UTC (para no chocar con el cron), y **revisar a ojo el arranque de la app** (`docker compose logs -f openmaint-app`) después de restaurar, en vez de confiar solo en que el script terminó con éxito.

### 5.5 El límite real, incluso con esto funcionando

Aunque el rollback de openMAINT esté sano y se ejecute sin tropiezos, sigue habiendo una ventana que nada de esto cierra: **todo lo que se escribió en openMAINT entre el último respaldo (las 3am) y el momento del incidente se pierde al restaurar.** Un correctivo avanzado, un pago registrado, un usuario creado esa mañana — no están en el dump de ayer. Por eso la certificación pone tanto peso en probar *antes* de desplegar: el rollback de openMAINT es una red de seguridad para un desastre, no una forma de deshacer un error puntual del día.

---

## 6. Frontend (Vercel)

El frontend no tiene estado propio ni migraciones — un rollback ahí es solo volver a servir una build anterior:

- **Redeploy de un build anterior**: en el dashboard de Vercel, pestaña *Deployments* del proyecto, seleccionar el despliegue de producción anterior y usar *Promote to Production* (o el equivalente vigente en la UI). No pasa por GitHub Actions ni por el CI del backend — es independiente.
- **Alternativa equivalente**: `git revert` sobre `frontend/modulo-incidentes` y push a `main`, igual que el backend. Vercel construye y despliega automáticamente (ver [frontend-ci-cd.md](../../frontend/modulo-incidentes/docs/frontend-ci-cd.md)).

Si el rollback del backend cambió qué endpoints o forma de datos expone la API, verificar que la versión del frontend a la que se vuelve sea compatible — no asumir que "la versión anterior de cada lado" es automáticamente la pareja correcta si ambos se desplegaron por separado entre medio.

---

## 7. Resumen — árbol de decisión

```
¿La versión a retirar aplicó una migración nueva?
│
├─ NO ──────────────────────────────────────────────► Caso A
│                                                       git revert + push a main
│                                                       (el pipeline hace el resto)
│
└─ SÍ
    │
    ├─ ¿Hay datos que el down() de la migración descartaría?
    │   │
    │   ├─ SÍ ──► Exportar esas filas primero
    │   └─ NO ──► seguir
    │
    ├─ 1. npm run migration:revert:prod (DATABASE_URL_DIRECT del entorno)
    ├─ 2. npm run migration:show:prod   (confirmar que revirtió)
    ├─ 3. git revert + push a main      (recién ahora)
    └─ 4. Confirmar /health (commit) y el esquema en Neon
```

**openMAINT no entra en este árbol** — es un rollback aparte, de la base entera, con sus propios scripts en el VPS (sección 5). Solo cubre lo que ya estaba en el respaldo de las 3am: lo escrito después de esa hora y antes del incidente se pierde igual.
