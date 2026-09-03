# Procedimiento de rollback

Cierra BP-004 del [Backlog Post-Piloto](backlog-post-piloto.md). Hasta ahora, si una versión desplegada resultaba defectuosa, no había un documento que dijera qué hacer y en qué orden — se improvisaba. Esto define los pasos para los casos reales que puede tener el GDGI, y en particular el que es fácil hacer mal: revertir código cuando la versión rota **ya aplicó una migración** a la base de datos.

No es un documento teórico: los comandos y el ejemplo del final son los reales de este proyecto.

---

## 1. Primero, la pregunta que decide todo

> **¿La versión que se quiere retirar aplicó una migración nueva?**

- **No** → [Caso A](#2-caso-a-rollback-sin-migración-de-por-medio). Es el caso simple: basta con volver al código anterior.
- **Sí** → [Caso B](#3-caso-b-rollback-con-migración-aplicada). El código viejo puede no entender la forma nueva de la base de datos: revertir solo el código no alcanza, y el orden de los pasos importa.

Para saberlo: `npm run migration:show:prod` (con `DATABASE_URL_DIRECT` apuntando al entorno afectado) lista qué migraciones están aplicadas. Si la última migración del repo aparece marcada como aplicada y es posterior al último commit "bueno" conocido, es Caso B.

Esto solo aplica a **Neon**, la base propia del backend (push, notificaciones, idempotencia). **openMAINT no entra en este procedimiento** — ver la [sección 5](#5-lo-que-este-procedimiento-no-puede-revertir).

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

## 5. Lo que este procedimiento NO puede revertir

**openMAINT no tiene rollback.** Es la fuente de verdad de todo el negocio (activos, correctivos, preventivos, propietarios) y no tiene control de versiones sobre su base de datos como Neon: si un correctivo avanzó de fase, o un pago quedó registrado, o un usuario se creó, revertir el código del backend **no deshace nada de eso**. Un `POST` mal hecho que ya llegó a openMAINT es un hecho consumado.

Esto no es un defecto de este procedimiento: es la razón por la que la certificación pone tanto peso en probar antes de desplegar, no en poder deshacer después.

Si algún día openMAINT necesita un respaldo/restauración a un punto en el tiempo, es responsabilidad del equipo que administra el VPS (ver la fila «openMAINT (VPS)» en el [inventario RC1, §5](rc1-inventario.md#5-bases-de-datos)) — está fuera del alcance de este documento, que cubre únicamente Neon y el código del backend.

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

openMAINT queda fuera de los dos casos: lo que ya escribió ahí no se deshace con nada de este documento.
