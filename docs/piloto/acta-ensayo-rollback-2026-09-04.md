# Acta del ensayo de rollback

**Fecha de ejecución:** 2026-09-03 (tarde) y 2026-09-04 (mañana)
**Entorno:** staging — `dt4fm-system-develop.onrender.com`, `dt4fm-staging.vercel.app`, rama `development` de Neon
**Responsable:** Angel Pastaz

Registro de evidencia del ensayo que valida el [procedimiento de rollback](procedimiento-rollback.md) y cierra BP-004. Su función es que cada afirmación de ese documento y de los informes de certificación tenga detrás una marca de tiempo y una salida real, verificable meses después.


---

## 1. Método y alcance

Se ejecutaron tres bloques sobre staging, sin tocar producción ni datos reales de clientes:

| Bloque | Qué se probó |
|---|---|
| 1 | Rollback del backend y del frontend, cronometrada |
| 2 | Recuperación automática de cada servicio, sin intervención humana |
| 3 | El caso difícil: revertir una versión que ya aplicó una migración |

**Lo que este ensayo NO prueba**, y conviene no leer de más:

- **No se probó el escenario de incompatibilidad real.** La migración de ensayo creaba una tabla vacía que ningún código consulta, así que se midió la *mecánica y los tiempos* del procedimiento, no el caso en que el código viejo se rompe contra el esquema nuevo. Provocar eso exigía romper staging a propósito y no se consideró justificado.
- **En staging no se pudo forzar una caída del backend** (el plan Free no da acceso a consola), así que allí se midió el ciclo dormir/despertar — que es, además, la interrupción más frecuente que sufre ese servicio. La caída forzada **sí se probó en producción**, ver punto 3.
- **Salvo la caída forzada del backend (punto 3), no se probó nada más en producción.** Los tiempos de staging no son extrapolables sin más: producción está en otro plan y con distinta configuración de migraciones. Ningún rollback ni ninguna migración se ejecutó contra producción.
- **No se ensayó la restauración de openMAINT.** Documentada en la §5 del procedimiento a partir de los scripts reales del VPS, pero nunca ejecutada.

---

## 2. Bloque 1 — rollback con tiempos medidos

Evento común de referencia: el merge del PR #62 (`997840f`), a las **15:51:19** del 2026-09-03. Las dos mediciones parten del mismo instante, así que son directamente comparables.

### Backend (Render)

| Fase | Hora | Δ desde el merge |
|---|---|---|
| Merge del PR #62 | 15:51:19 | 0 |
| CI en verde (pruebas 1m 05s + webhook 4s) | ~15:52:35 | 1m 16s |
| `Nest application successfully started` | 15:54:00.441 | 2m 41,4s |
| `==> Your service is live` | **15:54:02.798** | **2m 43,8s** |
| Detectado por sondeo externo (granularidad 5 s) | 15:54:05 | 2m 46s |

**Ciclo completo, de punta a punta (E2E):** creación del revert 15:49:12 → versión anterior sirviendo 15:54:05 = **4m 53s**. De esos, **2m 07s fueron intervención humana** (crear la rama, abrir el PR, esperar al CI, pulsar *merge*).

### Frontend (Vercel)

| Fase | Hora | Δ desde el merge |
|---|---|---|
| Merge del PR #62 | 15:51:19.000 | 0 |
| Vercel arranca el build | 15:51:24.687 | 5,7 s |
| Build terminado (15 s) | 15:51:41.564 | 22,6 s |
| `Deployment completed` | **15:51:42.681** | **23,7 s** |

Build **con caché restaurada**; uno en frío sería más lento.

### Referencia: despliegue normal

Merge del PR #61 a las 15:45:49 → sirviendo a las 15:48:26 = **2m 37s**.

> **Conclusión:** Un rollback cuesta lo mismo que un despliegue normal (2m 43,8s frente a 2m 37s). No hay penalización técnica por revertir. El frontend es ~7x más rápido, y la diferencia está casi toda en que el backend corre la suit de pruebas antes de publicar.

---

## 3. Bloque 2 — Recuperación automática

### Backend

Sin acceso a consola en el plan Free, se midió el ciclo real de suspensión y despertar:

```
17 min sin tráfico  ->  Render suspende el servicio
09:02:25  una sola petición
09:03:06  respondió 200
```

**Arranque en frío: 41,6 s**, sin ninguna intervención humana. Coincide con el aviso del propio panel de Render (*"can delay requests by 50 seconds or more"*).

#### Caída forzada en producción (2026-09-04, 13:23)

Producción sí dispone de consola, así que se ejecutó la prueba en su forma fuerte: **matar el proceso principal** (`kill 1`) y medir cuánto tarda en volver sin que nadie intervenga.

Comprobación previa, derivada de BP-021: se verificó que openMAINT respondía (`302` en 0,47 s) antes de provocar la caída. Si hubiera estado caído, el backend no habría podido arrancar y la interrupción se habría prolongado hasta el tope de Render.

```
[13:23:08]  CAYÓ
[13:23:16]  VOLVIÓ SOLO tras 8s
```

| Entorno | Escenario | Recuperación |
|---|---|---|
| Staging (plan Free) | Despertar tras suspensión por inactividad | 41,6 s |
| Producción (plan de pago) | Caída forzada del proceso principal | 8 s |

La diferencia es esperable: producción no se suspende, así que no paga el arranque en frío del contenedor — solo el arranque de la aplicación.

> **Interrupción total observada en producción: 8 segundos**, sin ninguna acción humana. Es la evidencia más sólida del bloque, porque es el escenario real (un proceso que muere) y en el entorno que importa.

### openMAINT (VPS)

```
$ docker inspect --format '{{.Name}} -> {{.HostConfig.RestartPolicy.Name}}' $(docker ps -q)
/openmaint-bimserver-clone -> unless-stopped
/openmaint-db-clone        -> unless-stopped
/openmaint-app-clone       -> unless-stopped
/openmaint-db              -> unless-stopped
/openmaint-app             -> unless-stopped
/openmaint-bimserver       -> unless-stopped
/geoserver                 -> unless-stopped
/alfresco                  -> unless-stopped
/alfresco-clone            -> unless-stopped

$ systemctl is-enabled docker
enabled
```

Los **9 contenedores** —producción y clon— se levantan solos, y Docker arranca con el sistema, que es el eslabón que suele faltar. Cubre caída del contenedor y reinicio del VPS.

> **Lo que NO cubre:** un contenedor detenido a propósito. `db-restore.sh` hace `docker compose stop openmaint-app`, y `unless-stopped` respeta esa parada deliberada — la política no rescata un rollback de openMAINT cortado a la mitad (ver BP-017).

---

## 4. Bloque 3 — El caso difícil

### 4.1 Preparación

```
09:09:12  merge del PR #63 - migración de ensayo RollbackDrill1788530000000
09:11:57  desplegada en staging (~2m 45s, consistente con el bloque 1)
```

La migración se aplicó sola al arrancar el servicio, sin que nadie ejecutara ningún comando. Confirmado por consulta directa a la base: fila `id 3` en `migrations`, tabla `rollback_drill` creada.

### 4.2 Primer intento — FALLO

```
09:13:18  npm run migration:revert:prod
09:13:22  falló a los 4,1 s:

          query: DROP TABLE "rollback_drill"
          error: must be owner of table rollback_drill
          query: ROLLBACK
```

La transacción hizo `ROLLBACK` limpio: la base quedó intacta.

**Causa, diagnosticada por consulta directa:**

```
conectado como            : neondb_owner
dueño de TODAS las tablas : dt4fm
roles existentes          : cloud_admin, dt4fm, neon_service, neon_superuser, neondb_owner
```

La cadena de conexión directa de Neon conecta como `neondb_owner`, que **no es propietario de ninguna tabla**. En PostgreSQL, `DROP TABLE` y `ALTER TABLE` exigen la propiedad.

> **Alcance del defecto:** no es específico de la tabla de ensayo. Las cuatro tablas reales (`migrations`, `notification_dispatch_log`, `notifications`, `push_subscriptions`) también pertenecen a `dt4fm`, y el `down()` de `PushSubscriptionMultipleRoles` hace `ALTER TABLE push_subscriptions` — **habría fallado igual en el caso real**.

### 4.3 Segundo intento — correcto

Con la `DATABASE_URL_DIRECT` **del panel de variables de entorno de Render** (rol `dt4fm`):

```
RollbackDrill1788530000000 is the last executed migration.
Now reverting it...
query: START TRANSACTION
query: DROP TABLE "rollback_drill"
query: DELETE FROM "migrations" WHERE "timestamp" = $1 AND "name" = $2
Migration RollbackDrill1788530000000 has been reverted successfully.
query: COMMIT
```

**~4 segundos**, sobre una tabla vacía. **No extrapolable:** el `down()` real recorre `push_subscriptions` fila por fila.

Estado verificado tras el revert: 2 migraciones, tabla eliminada.

### 4.4 La migración revertida vuelve sola

```
[09:32:09]  ANTES    ->  RollbackDrill registrada: false | tabla existe: false
[09:49:11]  una sola petición al servicio (+ reinicio desde el panel)
[09:51:34]  DESPUÉS  ->  RollbackDrill registrada: true  | tabla existe: true
```

Confirmado además por tres consultas directas independientes. **Nadie ejecutó ningún comando de migración**: bastó con que el servicio se reiniciara.

**Causa:** en staging el *Start Command* es `npm run migration:run:prod && node dist/main.js`, así que cada arranque aplica las migraciones pendientes. Y el servicio se suspende solo cada 15 minutos sin tráfico.

**Asimetría entre entornos, no documentada hasta ahora:**

| | Cuándo corre las migraciones | ¿Un reinicio las re-aplica? |
|---|---|---|
| Staging | Encadenadas al *Start Command* | **Sí, siempre** |
| Producción | En el *Pre-Deploy Command* | No — solo un despliegue |

---

## 5. La cadena de fallo observada

Al intentar cerrar el ensayo desplegando el código sin la migración, se produjo espontáneamente el escenario completo que el procedimiento no contemplaba:

```
10:00:27  merge del PR #64 (retira la migración del código)
10:01:58  Render dispara el Auto-Deploy de 903f6b6
10:02:33  Build successful (35 s)
10:02:34  "==> Deploying..."  -> arranca el Start Command
          (en ese momento los contenedores de openMAINT estaban reiniciándose)
10:17:35  "==> Timed Out"     -> DESPLIEGUE FALLIDO tras 15m 37s
```

**Causa:** el arranque del backend se bloquea en el login inicial contra openMAINT (`CleaningTasksSessionService.onModuleInit`), y Render agota su tope de ~15 minutos.

**Consecuencias encadenadas:**

1. La instancia anterior siguió sirviendo — **no hubo caída del servicio**.
2. Pero esa instancia contenía la migración recién revertida y, al reiniciarse, **la volvió a aplicar**. Segunda vez en el mismo ensayo.
3. GitHub Actions mostró Success desde el minuto 1:24. El webhook se disparó correctamente. El smoke test que lo habría detectado se omitió por falta del secret `RENDER_SERVICE_URL_STAGING`.

> **Conclusión que corrige el procedimiento:** la ventana de riesgo del caso difícil **no dura lo que tarda un despliegue** (~2m 45s). Dura hasta que el despliegue tenga éxito, y puede no tenerlo nunca. Observado dos veces en el mismo ensayo.

---

## 6. Experimento de control

Para descartar que las reapariciones fueran casualidad, se repitió la misma acción con el código correcto ya desplegado (`903f6b6`, sin la migración):

```
[10:46:32]  ANTES    ->  RollbackDrill ausente | tabla ausente
[11:03:34]  suspensión por inactividad + despertar
[11:04:36]  DESPUÉS  ->  RollbackDrill ausente | tabla ausente
```

| Código desplegado | Misma acción | Resultado |
|---|---|---|
| **Contiene** la migración | reinicio | Se re-aplica — observado 2 veces |
| **No la contiene** | reinicio | No se re-aplica — confirmado |

Resultado opuesto ante la misma acción, según el código desplegado. **Causa confirmada**, no inferida.

---

## 7. Hallazgos

Los tres primeros son defectos del propio procedimiento, ya corregidos en el documento. El resto quedó registrado en el [Backlog Post-Piloto](backlog-post-piloto.md).

| ID | Sev. | Hallazgo |
|---|---|---|
| — | — | El procedimiento exigía una credencial que no especificaba. Corregido en el punto 3 |
| — | — | **`main` y `develop` están protegidas:** el `git push` que indicaba el documento no funciona. Corregido en el punto 2 |
| — | — | **La ventana de riesgo dura hasta que el despliegue tenga éxito.** Corregido en la §3 |
| BP-020 | **P2** | El smoke test posterior al despliegue está desactivado por falta del secret `RENDER_SERVICE_URL_STAGING`. Demostrado en vivo: pipeline en verde, despliegue fallido |
| BP-021 | **P2** | El backend no puede desplegarse si openMAINT no responde. Muere por `Timed Out` a los ~15 min, sin indicar la causa |
| BP-022 | P3 | Asimetría staging/producción en cuándo corren las migraciones, no documentada |
| BP-023 | P3 | Sin definir quién autoriza un PR de reversión fuera de horario |
| BP-024 | P3 | Arranque en frío de 41,6 s en staging: contaminaría las sesiones de usabilidad |
| BP-025 | P3 | El *Instant Rollback* del frontend solo aplica a producción y nunca se ha probado |
| BP-026 | P4 | Staging tras el SSO de Vercel: ninguna verificación automática puede comprobarlo |

**Hallazgo incidental, corregido el mismo día:** revisando los registros de arranque se detectó que staging tenía **activos los dos schedulers que envían correo** (pagos y recordatorios de reuniones), programados para las 03:00, apuntando a la instancia de openMAINT de desarrollo — que es el clon refrescado con datos de producción, es decir, con direcciones de correo reales. Se desactivaron antes de que llegaran a ejecutarse.

---

## 8. Estado final

Staging quedó limpio: 2 migraciones, sin la tabla de ensayo, ramas `drill/` eliminadas del remoto. No quedó nada que revertir.

Trazabilidad de los cambios del ensayo: PR **#61** (cambio inofensivo), **#62** (su reversión), **#63** (migración de ensayo), **#64** (retirada de la migración), **#65** (correcciones al procedimiento).

**Pendiente:** ensayar la restauración de openMAINT sobre el clon — documentada en el punto 5 del procedimiento, nunca ejecutada.
