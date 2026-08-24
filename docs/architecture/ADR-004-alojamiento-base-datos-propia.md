# ADR-004 — Alojamiento de la base de datos propia del backend

## Fecha

2026-08-24

---

# Contexto

El [ADR-003](ADR-003-seleccion-base-datos-backend.md) seleccionó **PostgreSQL** como base de datos del backend, pero nunca llegó a implementarse: hasta esta fecha el backend no tenía base de datos propia, ni ORM, ni driver. Toda la persistencia se delegaba en openMAINT vía REST, incluso para datos que no son de gestión de activos (plantillas de correo en la clase `EmailTemplate`, bitácora de envíos en `HistorialEmail`).

La implementación de **notificaciones push** obliga a resolverlo, porque introduce estado que openMAINT no puede sostener razonablemente:

| Necesidad | Perfil de acceso |
|---|---|
| Suscripciones push (endpoint + claves por dispositivo) | Lectura en cada envío, escritura ocasional, unicidad por endpoint |
| Idempotencia de avisos programados | Upsert con restricción única, alta frecuencia |
| Historial de notificaciones | Alta escritura, alta lectura, estado mutable (leído/no leído) |
| Preferencias por usuario y tipo de evento | Lectura en cada envío |

El ADR-003 decidió *qué* motor usar. Este decide **dónde alojarlo**, que era la pregunta abierta.

El requisito adicional del negocio fue explícito: preferentemente **sin costo adicional**.

---

# Decisión

Se aloja la base de datos propia del backend en **Neon** (PostgreSQL gestionado), en su plan gratuito, con la región alineada a la del servicio de Render que ejecuta el backend.

El desarrollo local usa un **contenedor Docker de PostgreSQL** independiente (`backend/docker-compose.yml`), con la misma versión mayor que Neon. Las migraciones son portables entre ambos porque es el mismo motor.

---

# Justificación

## El plan gratuito de Render no es viable

Las instancias gratuitas de PostgreSQL en Render **expiran a los 30 días** de creadas, con 14 días de gracia antes de que la base y sus datos se borren. Sirve para prototipos, no para un entorno que debe sostenerse. El plan pagado más pequeño ronda los 6–7 USD/mes.

## Exponer PostgreSQL en el VPS no tiene un perímetro real

La opción de levantar un contenedor de PostgreSQL en el mismo VPS que aloja openMAINT es gratuita en dinero, pero obliga a **abrir el puerto 5432 a Internet** para que el backend en Render lo alcance.

El problema es que Render solo ofrece **IPs de salida estáticas y dedicadas como complemento pagado**. Las IPs de salida normales son **compartidas por región** entre todos sus clientes y pueden cambiar en despliegues o escalados. Una lista blanca sobre esos rangos autorizaría en la práctica a cualquier cliente de Render en esa región: no es un perímetro.

A eso se suma que el VPS aloja el sistema de registro de todo el negocio (openMAINT), por lo que ampliar su superficie de ataque con un puerto de base de datos tiene un costo desproporcionado frente al ahorro.

## Compartir la base de openMAINT acopla ciclos de vida

Se descartó por dos motivos distintos según la variante:

- **Misma base de datos que CMDBuild**: el backend necesitaría credenciales con escritura sobre todo el esquema del CMDB. Un fallo o un compromiso del backend podría corromper el sistema de registro, y las herramientas de actualización de CMDBuild son dueñas de ese esquema. El radio de daño no se justifica.
- **Misma instancia, base separada**: es aceptable en aislamiento de seguridad, pero acopla el ciclo de vida. Los procedimientos de respaldo y actualización de CMDBuild operan sobre *su* base, no sobre la nuestra: quedarían datos que nadie respalda y que se pierden en un `docker compose down -v`. También introduce contención de recursos con el sistema de registro.

## Latencia

El backend en Render ya paga un salto a Internet contra openMAINT en cada petición. Alojar la base también en el VPS supondría **dos saltos lentos en serie** para operaciones que consultan ambos. Con Neon en la misma región que Render, uno de los dos saltos pasa a ser local.

---

# Alternativas consideradas

| Opción | Costo | Motivo del descarte |
|---|---|---|
| Render PostgreSQL gratuito | 0 | Expira a los 30 días y se borran los datos |
| Render PostgreSQL pagado | ~6–7 USD/mes | Viable; descartado solo por el requisito de costo cero |
| Contenedor propio en el VPS | 0 | Exige exponer 5432 sin lista blanca efectiva; respaldos a cargo del equipo |
| Misma instancia de openMAINT, base separada | 0 | Acopla respaldos y ciclo de vida al de CMDBuild; contención de recursos |
| Misma base de datos de CMDBuild | 0 | Radio de daño inaceptable sobre el sistema de registro |
| Supabase | 0 | Equivalente a Neon; se prefirió Neon por su modelo de suspensión a cero |

---

# Consecuencias

## Positivas

- Costo cero y permanente: el plan gratuito de Neon no expira y permite uso comercial
- Sin puertos nuevos expuestos en la máquina que contiene los datos operativos
- Respaldos y parcheo gestionados por el proveedor
- Menor latencia desde Render que la alternativa en el VPS
- Migración a Render PostgreSQL pagado, si algún día hace falta, es cambiar una variable de entorno: ambos son PostgreSQL y las migraciones están versionadas

## Negativas y límites a vigilar

- **100 CU-horas al mes.** El autoescalado debe fijarse en 0,25 CU (mínimo y máximo). A ese tamaño equivalen a unas 400 horas de actividad real, suficiente para uso en horario laboral.
- **Suspensión a cero tras 5 minutos inactivo**, con arranque en frío de ~0,5–1 s en la primera consulta posterior. Irrelevante para el envío de notificaciones, que es trabajo de fondo.
- **Las conexiones abiertas impiden la suspensión** y cada conexión reinicia el temporizador. El pool de TypeORM se configura con `idleTimeoutMillis: 10_000` para que suelte las conexiones ociosas. Sin esto el compute nunca duerme y la cuota se agota sin tráfico real.
- **0,5 GB de almacenamiento.** Requiere podar el historial de notificaciones y el registro de idempotencia.
- **El endpoint de salud no debe consultar la base de datos.** Render ejecuta comprobaciones periódicas y cualquier monitor de disponibilidad añadiría una consulta cada pocos segundos las 24 horas, manteniendo el compute despierto de forma permanente.

---

# Implementación

- ORM: **TypeORM** (`@nestjs/typeorm`), por integración nativa con NestJS y coherencia con el uso de decoradores del resto del backend.
- `synchronize: false` siempre. El esquema lo gobiernan las migraciones versionadas en `backend/src/database/migrations/`.
- Dos cadenas de conexión distintas:
  - `DATABASE_URL` — con *pooler* (host `...-pooler...`), la que usa la aplicación en runtime.
  - `DATABASE_URL_DIRECT` — sin *pooler*, exclusiva para migraciones. PgBouncer en modo transacción rompe los *advisory locks* que TypeORM usa para serializarlas.
- El TLS se deriva de la propia cadena (`sslmode=require`) y no de una variable aparte, para que no puedan quedar desalineados entre entornos.
- El acceso a datos se encapsula tras un repositorio (`PushSubscriptionRepository`), siguiendo el patrón ya establecido por `MailProvider` y `PaymentsOpenmaintRepository`, de modo que un cambio de almacén no obligue a tocar la lógica de negocio.

---

# Consideraciones futuras

Esta base habilita, además de las notificaciones push:

- el historial de notificaciones consultable desde la aplicación
- preferencias de notificación por usuario y tipo de evento
- un registro de idempotencia reutilizable por otros procesos programados
- la migración progresiva de datos hoy alojados en clases *custom* de openMAINT (`EmailTemplate`, `HistorialEmail`) que no son datos de gestión de activos