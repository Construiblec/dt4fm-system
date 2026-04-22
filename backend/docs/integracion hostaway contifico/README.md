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
12. [Estado actual de la integración](#12-estado-actual-de-la-integración)
13. [Pendientes para activación completa](#13-pendientes-para-activación-completa)

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
             └──► POST https://construiblec.cloud/cmdbuild/services/rest/v3/classes/HostawayInvoice/cards
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
8. El endpoint responde `200 OK` a Hostaway para confirmar la recepción.

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

Configuradas en **Render → Environment → Environment Variables**:

| Variable | Descripción | Estado |
|---|---|---|
| `CONTIFICO_API_KEY` | API Key de Contifico | ⏳ Pendiente |
| `CONTIFICO_POS_TOKEN` | Token del POS en Contifico | ⏳ Pendiente |
| `CONTIFICO_PRODUCTO_ID` | ID del producto de hospedaje en Contifico | ⏳ Pendiente |
| `OPENMAINT_URL` | `http://187.77.250.224:8090/cmdbuild/services/rest/v3` | ✅ Configurada |
| `OPENMAINT_USERNAME` | Usuario de openMAINT | ✅ Configurada |
| `OPENMAINT_PASSWORD` | Contraseña de openMAINT | ✅ Configurada |
| `HOSTAWAY_CLIENT_ID` | Account ID de Hostaway | ✅ Configurada |
| `HOSTAWAY_CLIENT_SECRET` | Client secret de Hostaway | ✅ Configurada |

### Cómo obtener los valores de Contifico

- **`CONTIFICO_API_KEY`**: Solicitar a soporte de Contifico. Se entrega como cadena larga de caracteres.
- **`CONTIFICO_POS_TOKEN`**: Contifico → Configuración → Puntos de Venta → copiar API Token del POS.
- **`CONTIFICO_PRODUCTO_ID`**: Contifico → Inventario → Productos → buscar el producto de hospedaje → copiar su ID interno.

---

## 6. Configuración del webhook en Hostaway

1. Ingresar al [Dashboard de Hostaway](https://dashboard.hostaway.com) con la cuenta **Account Owner** (solo el dueño principal tiene acceso a Settings).
2. Ir a **Settings → Integrations → Webhooks**.
3. Crear un nuevo webhook:

| Campo | Valor |
|---|---|
| **URL** | `https://tu-backend.onrender.com/webhooks/hostaway` |
| **Events** | `reservation_created`, `reservation_updated` |

> **Importante:** Solo el Account Owner puede acceder a Settings en Hostaway. Los usuarios admin no tienen acceso a esta sección aunque tengan todos los permisos.

> Hostaway reintenta el webhook 3 veces si no recibe `2xx`. El backend siempre responde `200 OK` al recibir el payload para evitar reintentos. Los errores internos se registran en openMAINT.

---

## 7. Clase HostawayInvoice en openMAINT

### Estado: ✅ Creada y validada

La clase fue creada manualmente desde la UI de administración de openMAINT en:
```
https://construiblec.cloud/cmdbuild/ui/#classes/HostawayInvoice/cards
```

### Atributos confirmados via API

Verificados consultando `GET /classes/HostawayInvoice/attributes`:

| Atributo | Tipo | Grupo |
|---|---|---|
| `ReservationId` | text | HostawayInvoice General |
| `GuestName` | text | HostawayInvoice General |
| `ListingName` | text | HostawayInvoice General |
| `ArrivalDate` | text | HostawayInvoice General |
| `DepartureDate` | text | HostawayInvoice General |
| `Total` | decimal | HostawayInvoice General |
| `Currency` | text | HostawayInvoice General |
| `ContificoId` | text | HostawayInvoice General |
| `ContificoDocumento` | text | HostawayInvoice General |
| `FacturaError` | text | HostawayInvoice General |
| `Accion` | text | HostawayInvoice General |
| `FechaProcesamiento` | text | — |
| `Estado` | text | HostawayInvoice General |

### Formato del body para insertar un card

Capturado desde la UI de openMAINT. El backend usa exactamente este formato:

```json
{
  "_type": "HostawayInvoice",
  "_tenant": "",
  "Code": null,
  "Description": null,
  "ReservationId": "999001",
  "GuestName": "John Doe",
  "ListingName": "Apartamento Centro",
  "ArrivalDate": "2025-05-01",
  "DepartureDate": "2025-05-05",
  "Total": 250.00,
  "Currency": "USD",
  "ContificoId": "",
  "ContificoDocumento": "",
  "FacturaError": "",
  "Accion": "reservation_created",
  "FechaProcesamiento": "2025-04-21T10:00:00.000Z",
  "Estado": "OK"
}
```

> **Nota importante:** El endpoint correcto usa el dominio `construiblec.cloud` y no la IP directa `187.77.250.224`. El servidor tiene un virtual host configurado en Nginx que solo responde peticiones con el header `Host: construiblec.cloud`. Sin embargo, el puerto `8090` accedido directamente por IP sí funciona para el API REST, que es el que usa el backend via `OPENMAINT_URL`.

---

## 8. Mapeo de datos Hostaway → Contifico

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
El servicio de hospedaje en Ecuador aplica **tarifa 0% de IVA**. Si la configuración fiscal es diferente, ajustar los valores `subtotal_0`, `subtotal_12` e `iva` en `billing.service.ts`.

### Nota sobre la cédula del huésped
Hostaway no garantiza cédula o RUC ecuatoriano. Se usa `9999999999` con `tipo: 'I'` como estándar para huéspedes extranjeros. Si el huésped tiene cédula, se puede capturar desde `customFieldValues` de Hostaway.

---

## 9. Manejo de errores

| Escenario | Comportamiento |
|---|---|
| Reservación con estado distinto a `confirmed`/`new` | Se ignora. Responde `200 OK` a Hostaway. |
| Fallo al crear la factura en Contifico | Se registra en openMAINT con `Estado: ERROR`. Responde `500` (Hostaway reintentará). |
| Fallo al guardar en openMAINT | Se loguea el error pero no interrumpe el flujo. |
| Variables de entorno faltantes | Error en tiempo de ejecución al primer webhook recibido. |

---

## 10. Consideraciones importantes

- **Duplicados:** Si Hostaway reintenta el webhook por haber recibido `500`, puede generarse una segunda factura. Mejora futura: validar en openMAINT si ya existe un registro con el mismo `ReservationId` antes de crear la factura.

- **Número de documento:** Se genera como `001-001-{reservationId con padding de 9 dígitos}`. Verificar con Contifico si se debe omitir y dejar que asigne la secuencia automáticamente.

- **Producto en Contifico:** El producto referenciado por `CONTIFICO_PRODUCTO_ID` debe existir previamente en Contifico o rechazará el documento con error `400`.

- **Account Owner en Hostaway:** Solo el dueño principal puede configurar webhooks en Settings. Los usuarios admin no tienen acceso a esa sección.

---

## 11. Cómo probar localmente

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

### Respuesta esperada (con credenciales de Contifico configuradas)
```json
{ "ok": true }
```

### Respuesta esperada (sin credenciales de Contifico aún)
```json
{
  "message": "Factura no creada en Contifico: No se pudo crear la factura en Contifico",
  "error": "Internal Server Error",
  "statusCode": 500
}
```
El card se guarda en openMAINT con `Estado: ERROR` en ambos casos.

---

## 12. Estado actual de la integración

| Componente | Estado |
|---|---|
| Backend NestJS — módulo billing | ✅ Implementado |
| Endpoint `POST /webhooks/hostaway` | ✅ Funcionando en Render |
| Integración con openMAINT | ✅ Validada — cards se insertan correctamente |
| Clase `HostawayInvoice` en openMAINT | ✅ Creada con todos los atributos |
| Integración con Contifico | ⏳ Pendiente credenciales |
| Webhook configurado en Hostaway Dashboard | ⏳ Pendiente acceso Account Owner |

---

## 13. Pendientes para activación completa

1. **Contifico** — Solicitar al equipo de Contifico:
   - `CONTIFICO_API_KEY` (soporte al cliente)
   - `CONTIFICO_POS_TOKEN` (Configuración → Puntos de Venta)
   - `CONTIFICO_PRODUCTO_ID` (Inventario → Productos → producto de hospedaje)

2. **Hostaway** — Solicitar al Account Owner que configure el webhook en:
   ```
   https://dashboard.hostaway.com/settings/integrations
   ```
   URL del webhook: `https://tu-backend.onrender.com/webhooks/hostaway`
   Eventos: `reservation_created`, `reservation_updated`

3. **Una vez con credenciales** — Probar el flujo completo con una reservación real y verificar:
   - Factura creada en Contifico
   - Card en openMAINT con `Estado: OK` y el número de factura en `ContificoDocumento`
