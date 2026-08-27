# Neon — Base de datos propia del backend

**DT4FM – Digital Twin for Facility Management**

Guía operativa para poner la base de datos del backend en Neon y mantenerla en los dos entornos de nube. El *porqué* de haber elegido Neon está en el [ADR-004](../../docs/architecture/ADR-004-alojamiento-base-datos-propia.md); aquí solo está el *cómo*.

Hoy esta base sostiene únicamente las [notificaciones push](push-notifications%20module/push-notifications-module.md): suscripciones, historial e idempotencia de los avisos programados. Todo lo demás sigue viviendo en openMAINT.

---

## 1. Topología

Un solo proyecto de Neon con **una rama por entorno**, más el contenedor local que ya existe:

| Entorno | Base de datos | Se despliega desde |
|---|---|---|
| Local | Contenedor `dt4fm-pg` (`backend/docker-compose.yml`) | — |
| Staging | Rama `development` de Neon | Rama `develop` → servicio de staging en Render |
| Producción | Rama `production` de Neon (rama por defecto) | Rama `main` → servicio de producción en Render |

Ramas y no proyectos separados porque el plan gratuito admite varias ramas dentro del mismo proyecto, y porque una rama es copia sobre escritura de su padre: el esquema arranca idéntico al de producción.

---

## 2. Las dos cadenas de conexión

Cada rama expone dos cadenas, y **las dos se necesitan**:

| Variable | Host | Para qué |
|---|---|---|
| `DATABASE_URL` | `...-pooler...` | La aplicación en runtime |
| `DATABASE_URL_DIRECT` | sin `-pooler` | Solo migraciones |

En el panel de conexión de Neon, el interruptor **Connection pooling** alterna entre ambas.

La separación no es opcional: el *pooler* es PgBouncer en modo transacción y rompe los *advisory locks* con los que TypeORM serializa las migraciones. Ejecutarlas a través del pooler falla o, peor, deja dos despliegues migrando a la vez.

El TLS se deriva de la propia cadena: `resolveDatabaseSsl` activa verificación completa de certificado en cuanto la URL trae `sslmode=require`, que es como Neon las entrega. No hay una variable aparte que pueda quedar desalineada entre entornos.

---

## 3. Variables en Render

Por **cada uno de los dos servicios**, en *Environment*, con las cadenas de **su** rama:

```
DATABASE_URL=<cadena con pooler de la rama del entorno>
DATABASE_URL_DIRECT=<cadena sin pooler de la misma rama>
VAPID_PUBLIC_KEY=<par propio del entorno>
VAPID_PRIVATE_KEY=<par propio del entorno>
VAPID_SUBJECT=mailto:no-reply@tu-dominio.com
PUSH_SCHEDULER_ENABLED=true
```

**Un par VAPID distinto por entorno.** Las suscripciones quedan atadas a la clave pública con la que se crearon, así que claves separadas garantizan que un dispositivo suscrito en staging no pueda recibir avisos de producción. El frontend no necesita configuración: pide la clave a `GET /push/vapid-public-key` de su propio backend.

Dentro de un mismo entorno, en cambio, **las claves no se rotan nunca**: cambiarlas invalida todas las suscripciones vivas y obliga a que cada usuario vuelva a activar las notificaciones. Respáldalas fuera del panel de Render.

---

## 4. Migraciones en el despliegue

En **producción**, el campo *Pre-Deploy Command*:

```bash
npm run migration:run:prod
```

Render lo ejecuta después de compilar y antes de que la versión nueva reciba tráfico; si falla, aborta el despliegue y la versión anterior sigue sirviendo.

*Pre-Deploy Command* es una prestación de los planes de pago, así que el servicio de **desarrollo** no dispone de ese campo. Allí las migraciones se encadenan al *Start Command*:

```bash
npm run migration:run:prod && node dist/main.js
```

Equivalente en efecto, peor en garantías: si la migración falla, el servicio entra en ciclo de reinicio en vez de conservar la versión anterior. Aceptable en un entorno de pruebas, donde el fallo se ve enseguida en los registros. Se ejecuta también en cada reinicio del servicio, lo cual es inocuo: sin migraciones pendientes es una consulta y sale.

Ese script usa el `data-source` **compilado** (`dist/database/data-source.js`) y el CLI de `typeorm`, no `typeorm-ts-node-commonjs`: `ts-node` es una dependencia de desarrollo y no está en el contenedor de producción. Lee `DATABASE_URL_DIRECT`, con `DATABASE_URL` como respaldo.

Para diagnosticar sin aplicar nada, `npm run migration:show:prod` lista qué migraciones están puestas.

---

## 5. Guardarraíles de la cuota gratuita

Los límites del plan y su justificación están en el ADR-004. Lo que hay que **no romper**:

* **El endpoint de salud no consulta la base de datos.** [`health.controller.ts`](../src/modules/health/health.controller.ts) devuelve un objeto fijo, y así debe seguir. Render comprueba salud periódicamente: una sola consulta ahí mantiene el compute despierto las 24 horas y agota la cuota sin tráfico real.
* **Las conexiones ociosas se sueltan.** `idleTimeoutMillis: 10_000` en [`database.config.ts`](../src/config/database.config.ts). Una conexión abierta impide la suspensión, y cada una reinicia el temporizador.
* **El autoescalado fijo en 0,25 CU**, en las dos ramas.
* **El scheduler de limpiezas consulta openMAINT primero** y solo toca PostgreSQL cuando encuentra algo atrasado. Da igual que corra cada 15 minutos: no despierta el compute en la mayoría de las ejecuciones.
* **Hay 0,5 GB de almacenamiento y son para las dos ramas.** El historial de notificaciones y el registro de idempotencia crecen sin techo; habrá que podarlos.

Los arranques en frío rondan el segundo. `connectionTimeoutMillis: 15_000` da margen de sobra para que el compute despierte y, a la vez, evita que una caída de Neon deje una petición colgada para siempre.

---

## 6. Verificación de la primera puesta en marcha

1. `npm run migration:show:prod` con las variables apuntando a la rama de Neon: debe listar las migraciones como pendientes.
2. Desplegar y confirmar en los registros de Render que el *Pre-Deploy* las aplicó.
3. En la consola de Neon, comprobar que existen `push_subscriptions`, `notifications` y `notification_dispatch_log`.
4. Activar las notificaciones desde la aplicación desplegada y verificar que aparece la fila en `push_subscriptions`, con `roles` y `employee_id` resueltos.
5. **Revisar el gráfico de consumo la primera semana.** Si es plano las 24 horas en vez de tener picos en horario laboral, algo mantiene el compute despierto: casi siempre un monitor externo que consulta la base, o conexiones que no se sueltan.

Durante el arranque puede aparecer en los registros un aviso de que la extensión `uuid-ossp` no pudo instalarse. Es inocuo: TypeORM lo intenta al detectar columnas UUID y captura el fallo, y nuestras migraciones usan `gen_random_uuid()`, nativo desde PostgreSQL 13.

---

## 7. Qué no hacer

| No | Por qué |
|---|---|
| Apuntar staging y producción a la misma rama | Las migraciones de staging operarían sobre datos reales |
| Usar la cadena con *pooler* para migraciones | PgBouncer rompe los *advisory locks* de DDL |
| Poner `synchronize: true` | El esquema lo gobiernan las migraciones versionadas |
| Añadir una consulta al endpoint de salud | Mantiene el compute despierto y agota la cuota |
| Rotar las claves VAPID de un entorno | Invalida todas sus suscripciones vivas |
| Editar una migración ya aplicada | Genera divergencia entre entornos; corrige con una nueva |
