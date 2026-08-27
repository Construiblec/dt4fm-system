# Notificaciones de Pagos – Backend

**DT4FM – Digital Twin for Facility Management**

## 1. Introducción

Este documento describe los **correos automáticos relacionados con las expensas**: el recordatorio previo al vencimiento y el aviso de valores vencidos con advertencia de mora.

Aunque son notificaciones por correo, **el código vive en `src/modules/payments/`**, no en el módulo de notificaciones. La razón es la separación de responsabilidades que ya establece el [módulo de notificaciones](notifications-module.md): ese módulo es el **motor de envío** y no conoce el negocio; cada dominio arma sus propios mensajes y delega el envío en `MailerService`.

---

## 2. Las dos notificaciones

| | Recordatorio de vencimiento | Aviso de valores vencidos |
|---|---|---|
| Servicio | `PaymentReminderService` | `OverdueNoticeService` |
| Cuándo | Un día antes del `DiaVencimiento` | Días **1 y 15** de cada mes |
| Qué lista | **Todo** lo pendiente | Solo lo **ya vencido** |
| Tono | Preventivo: "vence mañana" | Cobranza: "registra valores vencidos" |
| Mora | No la menciona | Advertencia informativa |
| Endpoint manual | `POST /payments/reminders` | `POST /payments/overdue-notices` |

Se complementan: uno avisa **antes** del vencimiento, el otro **después**.

---

## 3. Pendiente no es lo mismo que vencido

Es la distinción central del aviso de mora y conviene tenerla clara.

* **Pendiente** — el pago existe en openMAINT con `Estado = Pendiente`. Incluye la expensa del mes en curso, que todavía no vence.
* **Vencido** — pendiente **y** con su fecha de vencimiento ya pasada.

La clase `Pagos` **no guarda fecha de vencimiento**. Se deriva:

```text
vencimiento = Periodo (YYYY-MM) + ConfigExpensa.DiaVencimiento
```

Con `DiaVencimiento = 20`, el período `2026-06` vence el `2026-06-20`.

| Caso (hoy 15/08, DiaVencimiento 20) | ¿Vencido? |
|---|---|
| Período 2026-06 (venció el 20/06) | Sí |
| Período 2026-08 (vence el 20/08) | No: pendiente, aún no vencido |
| Hoy es exactamente el día 20 | **No**: el día del vencimiento todavía no es mora |
| Período ilegible | Se omite, con advertencia en el log |

El aviso recorre **todos** los períodos adeudados, no solo el mes en curso: un propietario puede arrastrar junio, julio y agosto, y recibe un único correo con los tres.

---

## 4. Cómo se disparan

Los tres procesos de pagos cuelgan del **mismo scheduler diario**. Cada uno decide internamente si hoy le toca:

```text
PaymentsSchedulerService          corre todos los días a la hora configurada
   └─ runGeneration()
        ├─ 1. generateMonthlyPayments()   solo el DiaEmision
        ├─ 2. sendDueReminders()          solo el DiaVencimiento − 1
        └─ 3. sendOverdueNotices()        solo los días 1 y 15
```

Los tres pasos son **independientes**: un fallo en uno no impide los siguientes; cada uno atrapa sus errores y los registra.

> **El scheduler está gobernado por `PAYMENTS_SCHEDULER_ENABLED`.** Si la variable no existe o no vale exactamente `"true"`, **ninguno de los tres se ejecuta**. Ver la sección 7.

---

## 5. Flujo interno

Ambas notificaciones siguen el mismo camino:

```text
Servicio (Reminder / OverdueNotice)
   │
   ├─ 1. Sesión de servicio con openMAINT      repo.getSession()
   ├─ 2. Configuración                          repo.getConfigExpensa()
   ├─ 3. Pagos pendientes                       repo.getPendingPayments()
   ├─ 4. (mora) filtra los ya vencidos
   ├─ 5. Agrupa por propietario y suma el total
   ├─ 6. Correos de los propietarios            repo.getTenantsEmailMap()
   ├─ 7. Arma un MailMessage por propietario
   │
   ▼
MailerService.sendBulk()  ──►  Resend / SMTP  ──►  bandeja del propietario
   │
   └─ registra cada envío exitoso en HistorialEmail (openMAINT)
```

Todo el acceso a openMAINT está en `PaymentsOpenmaintRepository`: los servicios no consultan la API directamente.

Un propietario **sin correo registrado** no interrumpe el lote: se cuenta en `emailsSkipped`, se registra una advertencia y el resto se envía igual.

---

## 6. Endpoints de disparo manual

Ambos aceptan `force` para saltarse la validación de fecha y poder probar cualquier día.

```text
POST /payments/reminders          { "periodo": "2026-06", "force": true }
POST /payments/overdue-notices    { "force": true }
```

Respuesta del aviso de mora:

```json
{
  "fecha": "2026-08-19",
  "propietariosConVencidos": 1,
  "propietariosNotificados": 1,
  "emailsSent": 1,
  "emailsFailed": 0,
  "emailsSkipped": 0,
  "errors": []
}
```

Cuando no corresponde enviar, la respuesta trae `skippedReason`:

```json
{ "skippedReason": "Hoy (día 19) no es día de aviso (1 y 15) - no se notifica" }
```

Estos endpoints **envían correo de verdad**. Antes de usarlos conviene comprobar a quién le llegaría.

---

## 7. Configuración

```env
# Los tres procesos de pagos dependen de esta variable.
PAYMENTS_SCHEDULER_ENABLED=false
PAYMENTS_SCHEDULER_HOUR=8
PAYMENTS_SCHEDULER_MINUTE=0
```

El resto de la configuración **vive en openMAINT**, en la clase `ConfigExpensa`, no en variables de entorno:

| Campo | Uso | Valor actual |
|---|---|---|
| `DiaEmision` | Día en que se generan los pagos del mes | 16 |
| `DiaVencimiento` | Día de vencimiento; base del cálculo de mora | 20 |
| `Tiempo` | Año de referencia | 2026 |

Los días del aviso de mora (**1 y 15**) están en el código, en la constante `OVERDUE_NOTICE_DAYS`. Si llegan a cambiar con frecuencia, el sitio natural para moverlos es `ConfigExpensa`, por coherencia con los otros dos.

---

## 8. La mora no se calcula

El correo **menciona** que los valores vencidos generan multa, pero **no dice cuánto**.

No es una simplificación: `ConfigExpensa` no tiene ningún campo de mora — solo `DiaEmision`, `DiaVencimiento` y `Tiempo` — y `Pagos` tampoco. Codificar un porcentaje en el backend contradiría el principio de que los datos del negocio viven en openMAINT.

Para que el correo calcule el monto haría falta:

1. Agregar los campos a `ConfigExpensa` desde la administración de openMAINT (por ejemplo `PorcentajeMora` y `DiasGracia`).
2. Leerlos en `buildNoticeEmail`, nunca escribirlos en el código.

Hay una prueba que verifica que el texto visible del correo **no contenga ningún porcentaje**, precisamente para que nadie complete el hueco inventando una cifra.

---

## 9. Trampa conocida: el parámetro `cql` no filtra

Esta versión de openMAINT **acepta el parámetro `cql` pero lo ignora en silencio** y devuelve todas las cards. No responde error ni advertencia.

`getPendingPayments()` lo usaba, así que devolvía **todos los pagos, incluidos los ya pagados**. Verificado contra la instancia:

```text
cql "Estado = 3166839"   → 4 cards :: Pendiente, Pagado, Pagado, Pagado
filter JSON equivalente  → 1 card  :: Pendiente
```

Se corrigió cambiando a `filter` con JSON, que es el patrón usado en el resto del backend:

```ts
const filter = {
  attribute: {
    simple: { attribute: 'Estado', operator: 'equal', value: LOOKUP_ESTADO_PENDIENTE },
  },
};
```

**Al escribir una consulta nueva a openMAINT, usar `filter` y no `cql`**, y comprobar el resultado: un filtro ignorado no se nota hasta que alguien recibe un correo que no le correspondía.

---

## 10. Manejo de errores

| Situación | Comportamiento |
|---|---|
| Hoy no es día de envío | Respuesta con `skippedReason`; no se abre sesión con openMAINT |
| `ConfigExpensa` vacío o sin `DiaVencimiento` | `skippedReason`; no se envía nada |
| No hay pagos vencidos | Resultado en cero, sin correos |
| Propietario sin correo | Se cuenta en `emailsSkipped`; el resto se envía |
| Período ilegible | Se omite ese pago, con advertencia en el log |
| Fallo del envío masivo | Se contabiliza en `emailsFailed` y `errors`; no interrumpe el scheduler |

Todos los mensajes de log de la mora van prefijados con `[Mora]`, y los del recordatorio con `[Reminders]`, para poder seguirlos por separado.

---

## 11. Limitaciones actuales

**El scheduler está deshabilitado en producción.** No existe `PAYMENTS_SCHEDULER_ENABLED` en Render, así que hoy ninguna de las dos notificaciones se envía automáticamente. Solo funcionan por endpoint manual.

**Al activarlo se encienden tres procesos a la vez**: generación de pagos, recordatorio y aviso de mora. Conviene revisar antes que los datos de producción estén al día, porque el primer día de emisión posterior a la activación generará pagos y podría disparar correos a todos los propietarios.

**Los propietarios sin `Email` en la clase `Tenant` nunca reciben nada.** El envío no falla, simplemente los omite. Se resuelve completando el campo en openMAINT.
