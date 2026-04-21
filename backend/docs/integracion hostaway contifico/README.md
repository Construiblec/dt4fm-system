# Integración Hostaway → Contifico → openMAINT

## Índice

1. [Resumen general](#1-resumen-general)
2. [Arquitectura](#2-arquitectura)
3. [Flujo completo paso a paso](#3-flujo-completo-paso-a-paso)
4. [Estructura de archivos creados](#4-estructura-de-archivos-creados)
5. [Variables de entorno requeridas](#5-variables-de-entorno-requeridas)
6. [Configuración del webhook en Hostaway](#6-configuración-del-webhook-en-hostaway)
7. [Clase HostawayInvoice en openMAINT](#7-clase-hostawayinvoice-en-openmaint)
8. [Mapeo de datos Hostaway → Contifico](#8-mapeo-de-datos-hostaway--contifico)
9. [Manejo de errores](#9-manejo-de-errores)
10. [Consideraciones importantes](#10-consideraciones-importantes)
11. [Cómo probar localmente](#11-cómo-probar-localmente)

---

## 1. Resumen general

Esta integración conecta tres sistemas:

| Sistema | Rol |
|---|---|
| **Hostaway** | Origen. Notifica cuando se crea o actualiza una reservación via webhook. |
| **Contifico** | Destino de facturación. Recibe los datos y genera la factura electrónica. |
| **openMAINT** | Almacenamiento. Guarda un registro de cada factura generada (o de cada intento fallido). |

El backend en **NestJS** actúa como intermediario: recibe el webhook de Hostaway, transforma los datos, crea la factura en Contifico y guarda el resultado en openMAINT.

---

## 2. Arquitectura

```
Hostaway
   │
   │  POST /webhooks/hostaway
   ▼
Backend NestJS (Render)
   │
   ├──► ContificoService.createDocumento()
   │         │
   │         └──► POST https://api.contifico.com/sistema/api/v1/documento/
   │
   └──► OpenmaintClient.post()  (clase HostawayInvoice)
             │
             └──► POST https://<openmaint-url>/classes/HostawayInvoice/cards
```

---

## 3. Flujo completo paso a paso

1. Una reservación es creada o actualizada en Hostaway (desde cualquier canal: Airbnb, Booking.com, directo, etc.).
2. Hostaway envía un `POST` al endpoint `https://tu-backend.onrender.com/webhooks/hostaway`.
3. El `BillingController` recibe el payload y lo pasa al `BillingService`.
4. El `BillingService` verifica que el estado de la reservación sea `confirmed` o `new`. Si no, la ignora y responde `200 OK`.
5. Se construye el payload de la factura mapeando los campos de Hostaway al formato que requiere Contifico.
6. Se llama a `ContificoService.createDocumento()` que hace `POST /documento/` a Contifico.
7. Independientemente de si la factura fue exitosa o falló, se guarda un registro en openMAINT con el estado `OK` o `ERROR`.
8. El endpoint responde `200 OK` a Hostaway para confirmar la recepción (esto evita reintentos innecesarios de Hostaway).

---

## 4. Estructura de archivos creados

```
src/
├── integrations/
│   └── contifico/
│       ├── contifico.client.ts      # Cliente HTTP base para Contifico
│       ├── contifico.service.ts     # Lógica de negocio (crear/consultar documentos)
│       ├── contifico.types.ts       # Tipos TypeScript del API de Contifico
│       └── contifico.module.ts      # Módulo NestJS de Contifico
│
└── modules/
    └── billing/
        ├── dto/
        │   └── hostaway-webhook.dto.ts  # DTO del payload del webhook de Hostaway
        ├── billing.service.ts           # Orquestador del flujo completo
        ├── billing.controller.ts        # Endpoint POST /webhooks/hostaway
        └── billing.module.ts            # Módulo NestJS de Billing
```

### Descripción de cada archivo

#### `contifico.client.ts`
Cliente HTTP base. Maneja la autenticación con el API Key de Contifico en cada request (header `Authorization`). Expone métodos `get()` y `post()` genéricos con logging automático.

#### `contifico.types.ts`
Interfaces TypeScript que representan los objetos del API de Contifico: `ContificoCreateDocumentoDto`, `ContificoDocumentoResponse`, `ContificoDetalle`, `ContificoPersona`, etc.

#### `contifico.service.ts`
Contiene `createDocumento()` y `getDocumento()`. Es el único archivo que debería llamar al `ContificoClient` directamente.

#### `contifico.module.ts`
Registra y exporta `ContificoClient` y `ContificoService` para que otros módulos puedan importarlos.

#### `hostaway-webhook.dto.ts`
Define la forma esperada del payload que envía Hostaway. Incluye los campos financieros y de reservación que se usan para construir la factura.

#### `billing.service.ts`
Archivo principal de la integración. Orquesta los tres pasos: validar reservación → crear factura en Contifico → guardar en openMAINT. Aquí se encuentra el mapeo de campos.

#### `billing.controller.ts`
Expone el endpoint `POST /webhooks/hostaway`. Siempre responde `200 OK` para que Hostaway no reintente el envío.

#### `billing.module.ts`
Importa `ContificoModule` y `OpenmaintModule`, registra el controller y el service.

---

## 5. Variables de entorno requeridas

Agregar en **Render → Environment → Environment Variables**:

| Variable | Descripción | Ejemplo |
|---|---|---|
| `CONTIFICO_API_KEY` | API Key de Contifico (obtenida por soporte al cliente de Contifico) | `abc123xyz...` |
| `CONTIFICO_POS_TOKEN` | Token del POS configurado en Contifico | `ceaa9097-1d76-4eb8-...` |
| `CONTIFICO_PRODUCTO_ID` | ID del producto en Contifico que representa "Noche de hospedaje" | `RZxg87rxLh9Mb1pV` |
| `OPENMAINT_USERNAME` | Usuario del sistema openMAINT | `admin` |
| `OPENMAINT_PASSWORD` | Contraseña del sistema openMAINT | `••••••••` |
| `OPENMAINT_URL` | URL base de openMAINT (ya existente) | `https://openmaint.ejemplo.com/...` |

> **Nota:** Las variables `OPENMAINT_*` ya existen en el proyecto. Solo se necesita agregar las tres de Contifico.

### Cómo obtener los valores de Contifico

- **`CONTIFICO_API_KEY`**: Solicitar a soporte de Contifico en [contifico.com](https://contifico.com). Se entrega como una cadena larga de caracteres.
- **`CONTIFICO_POS_TOKEN`**: Ir a Contifico → Configuración → Puntos de Venta → copiar el API Token del POS correspondiente.
- **`CONTIFICO_PRODUCTO_ID`**: Ir a Contifico → Inventario → Productos → buscar el producto "Hospedaje" (o el que corresponda) → copiar su ID interno.

---

## 6. Configuración del webhook en Hostaway

1. Ingresar al [Dashboard de Hostaway](https://dashboard.hostaway.com).
2. Ir a **Settings → Integrations → Webhooks**.
3. Crear un nuevo webhook con los siguientes datos:

| Campo | Valor |
|---|---|
| **URL** | `https://tu-backend.onrender.com/webhooks/hostaway` |
| **Events** | `reservation_created`, `reservation_updated` |
| **Login** | *(opcional)* Usuario para autenticación básica |
| **Password** | *(opcional)* Contraseña para autenticación básica |

> **Importante:** Hostaway reintenta el webhook 3 veces si no recibe un `2xx`. El backend siempre responde `200 OK` al recibir el payload, incluso si hubo un error interno, para evitar duplicados. Los errores se registran en openMAINT.

---

## 7. Clase HostawayInvoice en openMAINT

Antes de que la integración pueda guardar datos en openMAINT, se debe crear manualmente la clase `HostawayInvoice` en el panel de administración de openMAINT.

### Atributos requeridos

| Nombre del atributo | Tipo | Descripción |
|---|---|---|
| `ReservationId` | Text | ID de la reservación en Hostaway |
| `GuestName` | Text | Nombre completo del huésped |
| `ListingName` | Text | Nombre de la propiedad |
| `ArrivalDate` | Text | Fecha de check-in (formato YYYY-MM-DD) |
| `DepartureDate` | Text | Fecha de check-out (formato YYYY-MM-DD) |
| `Total` | Decimal | Monto total de la reservación |
| `Currency` | Text | Moneda (ej: USD) |
| `ContificoId` | Text | ID del documento generado en Contifico |
| `ContificoDocumento` | Text | Número de factura en Contifico (ej: 001-001-000000089) |
| `FacturaError` | Text | Mensaje de error si la factura falló (vacío si fue exitosa) |
| `Accion` | Text | Acción del webhook: `reservation_created` o `reservation_updated` |
| `FechaProcesamiento` | Text | Timestamp ISO de cuando se procesó |
| `Estado` | Text | `OK` si la factura se creó correctamente, `ERROR` si falló |

### Pasos para crear la clase en openMAINT

1. Ingresar como administrador a openMAINT.
2. Ir a **Administración → Clases → Nueva Clase**.
3. Nombre: `HostawayInvoice`.
4. Agregar cada atributo de la tabla anterior.
5. Guardar la clase.

Una vez creada, el backend detectará la clase automáticamente en el siguiente webhook recibido.

> Si se desea cambiar el nombre de la clase, editar la constante `OPENMAINT_BILLING_CLASS` en `billing.service.ts`:
> ```typescript
> const OPENMAINT_BILLING_CLASS = 'HostawayInvoice'; // ← cambiar aquí
> ```

---

## 8. Mapeo de datos Hostaway → Contifico

Esta tabla muestra cómo se traducen los campos de Hostaway al formato de Contifico:

| Campo Contifico | Valor / Origen |
|---|---|
| `cliente.cedula` | `9999999999` (valor por defecto para huéspedes sin cédula) |
| `cliente.razon_social` | `guestFirstName + guestLastName` de Hostaway |
| `cliente.tipo` | `I` (Sin identificación, para extranjeros) |
| `cliente.email` | `guestEmail` de Hostaway |
| `cliente.es_extranjero` | `true` |
| `descripcion` | `"Reservación Hostaway #ID - NombrePropiedad"` |
| `fecha_emision` | Fecha actual del procesamiento (DD/MM/YYYY) |
| `tipo_documento` | `FAC` (Factura) |
| `tipo_registro` | `CLI` (Cliente) |
| `autorizacion` | ID de la reservación de Hostaway |
| `total` | `totalPrice` de Hostaway |
| `subtotal_0` | `totalPrice` (IVA 0% para hospedaje en Ecuador) |
| `subtotal_12` | `0` |
| `iva` | `0` |
| `detalles[0].producto_id` | Variable de entorno `CONTIFICO_PRODUCTO_ID` |
| `detalles[0].precio` | `totalPrice` de Hostaway |
| `adicional1` | Nombre de la propiedad |
| `adicional2` | Fechas de check-in y check-out |

### Nota sobre el IVA

El servicio de hospedaje en Ecuador aplica **tarifa 0% de IVA**. Por eso `subtotal_0 = total` y `subtotal_12 = 0`. Si tu configuración fiscal es diferente, ajustar estos valores en `billing.service.ts` en la sección marcada con el comentario `// IVA 0%`.

### Nota sobre la cédula del huésped

Hostaway no garantiza que el huésped tenga cédula o RUC ecuatoriano. Se usa `9999999999` con `tipo: 'I'` (Sin identificación) como valor estándar para huéspedes extranjeros o sin identificación. Si en algún caso el huésped tiene cédula, se puede extender el DTO para capturarla de un campo personalizado (`customFieldValues`) de Hostaway.

---

## 9. Manejo de errores

| Escenario | Comportamiento |
|---|---|
| Reservación con estado distinto a `confirmed`/`new` | Se ignora silenciosamente. Se responde `200 OK` a Hostaway. |
| Fallo al crear la factura en Contifico | Se registra en openMAINT con `Estado: ERROR` y `FacturaError: <mensaje>`. Se responde `500` al webhook (Hostaway reintentará). |
| Fallo al guardar en openMAINT | Se loguea el error pero **no** se interrumpe el flujo. La factura de Contifico ya fue creada. |
| Variables de entorno faltantes | El servicio lanzará un error en tiempo de ejecución al primer webhook recibido. Verificar Render antes de activar. |

---

## 10. Consideraciones importantes

- **Duplicados:** Si Hostaway reintenta el webhook (por haber recibido un `500`), se puede generar una segunda factura en Contifico con el mismo número de documento. Para evitar esto, se puede agregar una validación que consulte en openMAINT si ya existe un registro con el mismo `ReservationId` antes de crear la factura. Esto es una mejora futura recomendada.

- **Rate limits de Hostaway:** 15 requests/10s por IP. No aplica directamente al webhook, solo a llamadas salientes al API de Hostaway.

- **Número de documento:** Actualmente se genera como `001-001-{reservationId con padding de 9 dígitos}`. Esto puede colisionar si el número de secuencia en Contifico no coincide. Contifico puede rechazar el documento si ya existe ese número. Revisar con Contifico si se debe omitir el campo `documento` y dejar que Contifico asigne la secuencia automáticamente.

- **Producto en Contifico:** El producto referenciado por `CONTIFICO_PRODUCTO_ID` debe existir previamente en Contifico. Si no existe, Contifico rechazará el documento con error `400`.

---

## 11. Cómo probar localmente

### Requisitos
- Tener el backend corriendo localmente (`npm run start:dev`)
- Tener las variables de entorno configuradas en `.env`
- Herramienta como [Postman](https://www.postman.com/) o `curl`

### Request de prueba

```bash
curl -X POST http://localhost:3000/webhooks/hostaway \
  -H "Content-Type: application/json" \
  -d '{
    "action": "reservation_created",
    "data": {
      "id": 123456,
      "hostawayReservationId": 123456,
      "guestFirstName": "John",
      "guestLastName": "Doe",
      "guestEmail": "john.doe@example.com",
      "guestPhone": "+1234567890",
      "listingName": "Apartamento Centro",
      "listingMapId": 40160,
      "arrivalDate": "2025-05-01",
      "departureDate": "2025-05-05",
      "totalPrice": 250.00,
      "cleaningFee": 30.00,
      "currency": "USD",
      "status": "confirmed"
    }
  }'
```

### Respuesta esperada

```json
{ "ok": true }
```

### Verificar resultados

1. En los logs del backend buscar:
   - `[Billing] Procesando reservación 123456`
   - `[Contifico] Documento creado: 001-001-...`
   - `[Billing] Registro guardado en openMAINT`

2. En Contifico → Transacciones → Documentos: debe aparecer la factura nueva.

3. En openMAINT → clase `HostawayInvoice`: debe aparecer el registro con `Estado: OK`.
