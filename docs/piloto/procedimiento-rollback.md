# Procedimiento de rollback

Cierra BP-004 del [Backlog Post-Piloto](backlog-post-piloto.md). Hasta ahora, si una versión desplegada resultaba defectuosa, no había un documento que dijera qué hacer y en qué orden — se improvisaba. Esto define los pasos para los casos reales que puede tener el GDGI, y en particular el que es fácil hacer mal: revertir código cuando la versión rota **ya aplicó una migración** a la base de datos.

No es un documento teórico: los comandos y el ejemplo del final son los reales de este proyecto.

> **Validado con un ensayo real el 2026-09-04**, contra staging y la rama `development` de Neon. El ensayo destapó tres defectos en la versión anterior de este documento —el procedimiento fallaba en el primer comando— y midió cuánto tarda cada camino. Todo lo corregido lleva la marca **⚠️ del ensayo**; los tiempos están en la [sección 6](#6-tiempos-medidos-ensayo-del-2026-09-04), y la evidencia completa —marcas de tiempo, comandos y salidas literales— en el [acta del ensayo](acta-ensayo-rollback-2026-09-04.md).

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
2. **Revertir el código en una rama** — ⚠️ *del ensayo:* `main` y `develop` están **protegidas** y rechazan el push directo (`protected branch hook declined`). La versión anterior de este documento decía `git push origin main`, y eso **no funciona**:
   ```bash
   git checkout -b hotfix/rollback-<fecha>
   git revert <commit-o-rango-problemático>
   git push -u origin hotfix/rollback-<fecha>
   ```
   Se usa `git revert`, no `git reset --hard` + `push --force`: el historial no se reescribe, y el CI vuelve a correr sobre el commit de reversión como cualquier otro (test → build → deploy), que es la garantía que ya existe en el pipeline.
3. **Abrir el pull request y fusionarlo.** Este es un paso **humano y obligatorio**, y en el ensayo fue el tramo más lento de todos: 2m 07s de los 4m 53s totales. De madrugada no son dos minutos, es lo que tarde en aparecer alguien con permiso de aprobar. **Conviene decidir de antemano quién puede aprobar un rollback fuera de horario.**
4. El job `deploy` de GitHub Actions dispara el webhook de Render (ver [backend-ci-cd.md](../../backend/docs/backend-ci-cd.md)).
5. **Confirmar en `/health` que el campo `commit` es el de la reversión.** ⚠️ *del ensayo:* no te fíes del check verde de GitHub — el smoke test que debería comprobarlo está desactivado por falta del secret `RENDER_SERVICE_URL_STAGING`, y durante el ensayo el pipeline dio ✅ mientras el despliegue se colgaba 15 minutos y acababa en *Timed Out*. **La única confirmación fiable es consultar `/health` a mano.**

No hace falta tocar Neon: el esquema no cambió, así que el código anterior sigue siendo compatible con él.

---

## 3. Caso B: rollback con migración aplicada

Aquí está el riesgo real. Si la versión rota ya corrió `npm run migration:run:prod` (el *Pre-Deploy Command* de producción, ver [backend-ci-cd.md](../../backend/docs/backend-ci-cd.md#2-configuración-de-los-servicios-en-render)), la base de datos tiene una forma nueva. El código anterior fue escrito contra la forma vieja: si la migración cambió una columna o una tabla que ese código usa, sus consultas fallan en cuanto reciban tráfico.

### ⚠️ Antes de nada: la credencial correcta

**Esto es lo primero que falló en el ensayo, y es invisible hasta que te estrellas.**

`npm run migration:revert:prod` necesita conectar con un rol que sea **propietario de las tablas**. En PostgreSQL, `DROP TABLE` y `ALTER TABLE` lo exigen. Y la cadena directa de Neon que uno tiene a mano conecta como `neondb_owner`, que **no es dueño de nada**:

```
conectado como            : neondb_owner
dueño de TODAS las tablas : dt4fm
```

El intento falla a los 4 segundos con un error que no explica nada:

```
query: DROP TABLE "..."
error: must be owner of table ...
query: ROLLBACK
```

**La única cadena que sirve es la `DATABASE_URL_DIRECT` del panel de Render** (Environment del servicio correspondiente), que es la que conecta como `dt4fm`. No cualquier cadena directa de Neon: *esa*.

> **Consecuencia operativa:** quien tenga que hacer un rollback de madrugada necesita **acceso al panel de Render**, o tener esa cadena guardada de antemano en un sitio acordado. Sin eso, el procedimiento se detiene en el primer comando.

### El orden no es negociable

```
1. Revertir la migración (Neon vuelve a la forma vieja)
2. Inmediatamente después, redesplegar el código viejo
```

**Nunca al revés**, y la razón de fondo es más fuerte de lo que parece. No es solo que el código viejo pueda romperse contra el esquema nuevo: es que **si despliegas el código viejo primero, pierdes la capacidad misma de revertir**. TypeORM necesita la clase que define el `down()` de la migración, y esa clase desaparece del build en cuanto se despliega la versión que no la contiene. Te quedarías con una tabla huérfana y una fila fantasma en `migrations`.

⚠️ *del ensayo:* si eso llega a pasar, la salida **no** es escribir SQL a mano — es reconstruir la versión que sí define la migración (`git checkout <commit>` + `npm run build`) y revertir desde ahí. La herramienta vuelve a funcionar.

### Paso a paso

1. **Revertir la migración**, con la `DATABASE_URL_DIRECT` **del panel de Render** (ver el aviso de la credencial más arriba; nunca la de pooler — rompe los *advisory locks* de DDL, ver [neon-postgres.md](../../backend/docs/neon-postgres.md#2-las-dos-cadenas-de-conexión)):
   ```bash
   DATABASE_URL_DIRECT='<la de Render>' npm run migration:revert:prod
   ```
   Revierte **una sola migración**, la última aplicada. Si hay que retroceder varias, se corre tantas veces como migraciones haya que deshacer, de la más reciente hacia atrás. `npm run migration:show:prod` confirma el estado en cada paso.

2. **Antes de revertir, evaluar si hay datos que perder.** El `down()` de una migración no siempre es el inverso perfecto del `up()` — puede haber datos escritos por la versión nueva que el `down()` descarta. Ver el [ejemplo real](#4-ejemplo-real-de-este-proyecto) más abajo: no es hipotético, ya existe una migración en este repo con ese problema. Si la pérdida es inaceptable, **exportar esas filas antes de revertir** (`COPY` a un archivo, o una consulta puntual guardada aparte) para poder reconstruirlas a mano después.

3. **Inmediatamente después, redesplegar el código anterior** — mismos pasos que el [Caso A](#2-caso-a-rollback-sin-migración-de-por-medio): rama, `git revert`, PR y merge. Sin pausas entre el paso 1 y este: ver la ventana de riesgo, más abajo.

4. El *Pre-Deploy Command* (`npm run migration:run:prod`) vuelve a correr en el despliegue del código viejo. Es inocuo: como la migración ya se revirtió y el código nuevo ya no la contiene, no hay nada pendiente que aplicar.

5. **Verificar el estado final, y verificarlo de verdad:**
   - `/health` devuelve el `commit` de la reversión.
   - `npm run migration:show:prod` (o una consulta directa a `migrations`) confirma que la migración ya no figura.
   - ⚠️ *del ensayo:* **vuelve a comprobarlo unos minutos después.** Durante el ensayo la migración revertida reapareció sola **dos veces**, y ninguna de las dos habría sido evidente sin mirar.

### ⚠️ La ventana de riesgo, y por qué en staging es peor

Entre revertir la migración (paso 1) y tener el código viejo desplegado (paso 3) hay una ventana en la que **el sistema puede deshacer solo el trabajo**. En staging las migraciones van encadenadas al *Start Command* (`npm run migration:run:prod && node dist/main.js`), así que **cada arranque del servicio vuelve a aplicar lo que acabas de revertir**. Y el plan Free de Render duerme el servicio tras 15 minutos sin tráfico: basta con que alguien abra la app para que se reinicie.

Los dos entornos no se comportan igual, y eso no estaba escrito en ninguna parte:

| | Cuándo corre las migraciones | ¿Un reinicio las re-aplica? |
|---|---|---|
| **Staging** | Encadenadas al *Start Command* | **Sí, siempre** |
| **Producción** | En el *Pre-Deploy Command* | No — solo un despliegue |

**La ventana no dura lo que tarda un despliegue.** Dura **hasta que el despliegue tenga éxito**, y puede no tenerlo nunca. En el ensayo del 2026-09-04 se observó esta cadena completa:

```
1. openMAINT se reinicia (dependencia externa)
2. El arranque del backend se bloquea esperando su login inicial
3. Render agota su tope de ~15 min → "Timed Out", despliegue FALLIDO
4. La instancia anterior sigue sirviendo  (bien: no hubo caída)
5. …pero esa instancia contiene la migración recién revertida,
   y al reiniciarse la vuelve a aplicar
6. GitHub Actions sigue en ✅ Success desde el minuto 1:24. Nadie se entera.
```

**Qué hacer con esto, en la práctica:**

- No revertir una migración si no puedes desplegar el código viejo **a continuación**, sin pausa.
- Antes de empezar, comprobar que **openMAINT responde** — si está caído, el despliegue del backend no va a completarse (ver [sección 5.6](#56-el-backend-no-puede-desplegarse-si-openmaint-no-responde)).
- Después de cerrar, **volver a verificar el estado de las migraciones**. No dar por hecho que se quedó como lo dejaste.

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

### 5.6 El backend no puede desplegarse si openMAINT no responde

⚠️ *Descubierto en el ensayo del 2026-09-04, sin buscarlo.*

Al arrancar, el backend hace un **login real contra openMAINT** (`CleaningTasksSessionService.onModuleInit`). En condiciones normales cuesta ~1,5 s. Pero si openMAINT no responde, **el arranque se queda esperando**, Render agota su tope de ~15 minutos y marca el despliegue como `Timed Out`.

Ocurrió de verdad: los contenedores de openMAINT estaban reiniciándose y un despliegue del backend murió a los 15m 37s, sin ningún mensaje que señalara la causa.

**Por qué importa justo aquí:** un rollback de emergencia se hace, por definición, cuando algo va mal — y "algo va mal" puede perfectamente incluir a openMAINT. Si está caído, tu rollback del backend **no va a completarse**, y si venías del Caso B, la migración ya revertida se queda colgando en una ventana que no puedes cerrar.

**Antes de iniciar cualquier rollback del backend, comprueba que openMAINT responde:**

```bash
curl -s -o /dev/null -w "openMAINT -> HTTP %{http_code} en %{time_total}s
" http://187.77.250.224:8091/cmdbuild/
```

Un `302` rápido significa que está vivo. Si no responde, resuelve eso primero: desplegar el backend no va a funcionar hasta entonces.

---

## 6. Tiempos medidos (ensayo del 2026-09-04)

Medidos en staging, contra el mismo evento de referencia (el merge del PR), así que son directamente comparables entre sí.

| Qué | Tiempo | Nota |
|---|---|---|
| Despliegue normal del backend (ida) | **2m 37s** | Referencia |
| **Vuelta atrás del backend** (merge → versión anterior viva) | **2m 43,8s** | Sin penalización: cuesta lo mismo que un despliegue normal |
| **Vuelta atrás del backend, de punta a punta** | **4m 53s** | Incluye 2m 07s de la parte humana (crear el revert, PR, merge) |
| **Vuelta atrás del frontend** (Vercel, reconstruyendo) | **23,7 s** | ~7× más rápido que el backend |
| Recuperación sola del backend tras quedar parado | **41,6 s** | Plan Free: se duerme a los 15 min y despierta solo |
| Reversión de una migración | **~4 s** | Sobre una tabla **vacía** — no extrapolable, ver abajo |

**Tres advertencias sobre estos números, para no citarlos mal:**

1. **El número a comunicar es ~5 minutos, no 2m 44s.** Lo segundo es solo el tramo automático; el tramo humano (abrir el PR, esperar el CI, aprobar) es real y en una emergencia nocturna puede ser mucho mayor.
2. **Los 4 s de la migración no son representativos.** La migración de ensayo creaba una tabla vacía. El `down()` real de `PushSubscriptionMultipleRoles` recorre `push_subscriptions` fila por fila, así que tardará en proporción a cuántas suscripciones haya.
3. **Los 41,6 s de arranque en frío solo aplican al plan Free.** Producción está en plan de pago y no se duerme. Pero tiene una consecuencia para la certificación: si las **sesiones de usabilidad** se hacen contra staging, los participantes se van a encontrar esperas de 40 segundos que no dicen nada del producto y sí contaminan los resultados. Conviene despertar el servicio antes de cada sesión.

---

## 7. Frontend (Vercel)

El frontend no tiene estado propio ni migraciones — un rollback ahí es solo volver a servir una build anterior:

- **Instant Rollback** (lo más rápido, sin reconstruir): en el dashboard de Vercel, pestaña *Deployments*, menú `...` del despliegue anterior. ⚠️ *del ensayo:* **solo está disponible en producción.** En staging aparece deshabilitado con el aviso *"Only Deployments previously aliased to a Production domain can be rolled back"*, porque staging es entorno *Preview*. Consecuencia: **el mecanismo más rápido de recuperación del frontend nunca se ha probado**, y solo se podría probar en producción.
- **Alternativa, y la única disponible en staging**: `git revert` sobre `frontend/modulo-incidentes` y PR a la rama del entorno, igual que el backend. Vercel reconstruye y despliega automáticamente (ver [frontend-ci-cd.md](../../frontend/modulo-incidentes/docs/frontend-ci-cd.md)). **Medido: 23,7 s** desde el merge hasta la versión anterior sirviendo — 15 s de build con caché más el resto. Rápido, porque el frontend no corre pruebas antes de desplegar.

⚠️ *del ensayo:* staging está detrás del **SSO de Vercel** y responde `302` a cualquier petición anónima, así que **ninguna verificación automática puede comprobar el frontend de staging** — ni un smoke test, ni un monitor externo. Se confirma a ojo, o habilitando el *Protection Bypass for Automation* de Vercel.

Si el rollback del backend cambió qué endpoints o forma de datos expone la API, verificar que la versión del frontend a la que se vuelve sea compatible — no asumir que "la versión anterior de cada lado" es automáticamente la pareja correcta si ambos se desplegaron por separado entre medio.

---

## 8. Resumen — árbol de decisión

```
0. ¿openMAINT responde?  ──NO──► Resolver eso PRIMERO.
   │                              El backend no puede desplegarse sin él.
   SÍ
   │
¿La versión a retirar aplicó una migración nueva?
│
├─ NO ──────────────────────────────────────────────► Caso A
│                                                       rama + git revert + PR + merge
│                                                       (main/develop rechazan push directo)
│                                                       Confirmar /health A MANO
│
└─ SÍ
    │
    ├─ ¿Tienes la DATABASE_URL_DIRECT del panel de Render?
    │   │                        (la de neondb_owner NO sirve: no es dueña)
    │   └─ NO ──► Conseguirla. Sin ella el paso 1 falla.
    │
    ├─ ¿Hay datos que el down() de la migración descartaría?
    │   └─ SÍ ──► Exportar esas filas primero
    │
    ├─ 1. migration:revert:prod  (con la credencial de Render)
    ├─ 2. migration:show:prod    (confirmar que revirtió)
    ├─ 3. rama + git revert + PR + merge   ← SIN PAUSA tras el paso 1
    ├─ 4. Confirmar /health (commit) y el esquema
    └─ 5. VOLVER A CONFIRMAR unos minutos después
          (en staging, cualquier reinicio re-aplica lo revertido)
```

**openMAINT no entra en este árbol** — es un rollback aparte, de la base entera, con sus propios scripts en el VPS (sección 5). Solo cubre lo que ya estaba en el respaldo de las 3am: lo escrito después de esa hora y antes del incidente se pierde igual.
