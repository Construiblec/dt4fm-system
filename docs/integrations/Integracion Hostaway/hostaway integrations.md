# Integración Hostaway → openMAINT

## 📋 Resumen del Proyecto

Migración del módulo de gestión de tareas de limpieza desde Hostaway hacia openMAINT, centralizando la gestión de mantenimiento en una plataforma única.

**Objetivo:** openMAINT consumirá el calendario de reservaciones de Hostaway vía API REST, detectará los checkouts, generará automáticamente actividades de limpieza como cards nativas de openMAINT, y las presentará en una custom page con interfaz kanban.

---

## 🏗️ Stack Técnico

| Componente               | Tecnología             | Detalles                                        |
| ------------------------ | ---------------------- | ----------------------------------------------- |
| **Servidor**             | Hostinger VPS          | Docker                                          |
| **Plataforma principal** | openMAINT              | Puerto 8090, basado en CMDBuild                 |
| **Custom pages**         | ExtJS (MVC)            | 3 archivos: View.js, Controller.js, Model.js    |
| **API externa**          | Hostaway Public API v1 | REST, JSON, OAuth2 client credentials           |
| **Referencia visual**    | Kanban Hostaway        | 4 columnas: Hacer / Aceptado / En curso / Hecho |

---

## 🔌 APIs Involucradas

### openMAINT REST API v3

**Base URL:** `http://hostname:8090/cmdbuild/services/rest/v3/`

#### Endpoints clave

```http
POST   /sessions                         # Obtener token de sesión
POST   /classes                          # Crear clase
POST   /classes/{classId}/cards          # Crear card (registro)
GET    /classes/{classId}/cards          # Listar cards con filtros
PUT    /classes/{classId}/cards/{cardId} # Actualizar card
POST   /domains                          # Crear relación entre clases
POST   /lookup_types                     # Crear tipo de lookup
POST   /custompages                      # Subir custom page
```

**Header obligatorio:**

```http
Cmdbuild-authorization: {sessionToken}
```

---

### Hostaway Public API v1

**Base URL:** `https://api.hostaway.com/v1/`

#### Autenticación OAuth2

```http
POST /accessTokens
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials
&client_id={TU_CLIENT_ID}
&client_secret={TU_CLIENT_SECRET}
&scope=general
```

**Respuesta:**

```json
{
  "token_type": "Bearer",
  "expires_in": 63072000, // 24 meses
  "access_token": "eyJ0eXAiOiJKV1QiLCJ..."
}
```

**Rate limit:** 20 requests / 10 segundos por cuenta

---

#### Endpoint principal: Reservaciones

```http
GET /reservations
Authorization: Bearer {access_token}

Query params:
  - checkOutDateFrom: YYYY-MM-DD (obligatorio)
  - checkOutDateTo: YYYY-MM-DD (obligatorio)
  - includeResources: 1 (opcional, trae detalles de la propiedad)
  - limit: 50 (máximo resultados, default 10)
```

**Respuesta (estructura real confirmada):**

```json
{
  "status": "success",
  "result": [
    {
      "id": 57166582,
      "listingMapId": 442107,
      "listingName": "E04",
      "hostawayReservationId": "57166582",
      "channelReservationId": "442107-guest-507997970-confirmation-HM89KZHWAN",
      "guestName": "Anai Calva",
      "guestFirstName": "Anai",
      "guestLastName": "Calva",
      "numberOfGuests": 2,
      "adults": 2,
      "children": 0,
      "infants": 0,
      "arrivalDate": "2026-04-03",
      "departureDate": "2026-04-05",
      "checkInTime": 13,
      "checkOutTime": 11,
      "nights": 2,
      "status": "new",
      "cleaningFee": 12,
      "phone": "+593986556536",
      "confirmationCode": "HM89KZHWAN"
    }
  ],
  "count": 2516,
  "limit": 50,
  "offset": null
}
```

---

## 📊 Modelo de Datos (Diseño Preliminar)

### Clase: `CleaningTask`

| Atributo                | Tipo            | Descripción                    | Origen Hostaway                         |
| ----------------------- | --------------- | ------------------------------ | --------------------------------------- |
| `hostawayReservationId` | String (unique) | ID único de Hostaway           | `result[].id` o `hostawayReservationId` |
| `listingMapId`          | Integer         | ID de la propiedad en Hostaway | `result[].listingMapId`                 |
| `listingName`           | String          | Nombre de la propiedad         | `result[].listingName`                  |
| `checkoutDate`          | Date            | Fecha de checkout (trigger)    | `result[].departureDate`                |
| `checkinDate`           | Date            | Fecha de checkin (referencia)  | `result[].arrivalDate`                  |
| `guestName`             | String          | Nombre del huésped             | `result[].guestName`                    |
| `numberOfGuests`        | Integer         | Cantidad de huéspedes          | `result[].numberOfGuests`               |
| `cleaningStatus`        | Lookup          | Estado de limpieza             | (campo nativo openMAINT)                |
| `notes`                 | Text            | Notas adicionales              | (campo nativo openMAINT)                |

#### Lookup: `cleaningStatus`

- **Hacer** (pendiente)
- **Aceptado** (asignado)
- **En curso** (en progreso)
- **Hecho** (completado)

---

### Dominio: Propiedad → CleaningTask

Relación 1:N entre la clase `Propiedad` (existente en openMAINT) y `CleaningTask`.

**Mapeo:**

- `listingMapId` de Hostaway → `_id` de card Propiedad en openMAINT
- Requiere pre-carga manual o script de migración inicial

---

## 🗂️ Backlog Planificado (Jira-ready)

### EPIC-1 — Modelo de datos en openMAINT (Sprint 1 — 14 pts)

| Key  | Historia                                                         | Pts | Detalles                      |
| ---- | ---------------------------------------------------------------- | --- | ----------------------------- |
| HO-1 | Definir clase CleaningTask con atributos mapeados desde Hostaway | 5   | Ver tabla de atributos arriba |
| HO-2 | Crear dominio Propiedad → CleaningTask (relación 1:N)            | 3   | -                             |
| HO-3 | Autenticación y almacenamiento del token Hostaway                | 3   | OAuth2, 24 meses validez      |
| HO-4 | Mapeo listingId ↔ card de Propiedad en openMAINT                 | 3   | Script de migración inicial   |

---

### EPIC-2 — Sincronización Hostaway → openMAINT (Sprint 2 — 18 pts)

| Key  | Historia                                                             | Pts | Detalles                               |
| ---- | -------------------------------------------------------------------- | --- | -------------------------------------- |
| HO-5 | Fetch de reservaciones filtradas por rango de checkout               | 5   | GET `/v1/reservations`                 |
| HO-6 | Creación automática de CleaningTask por checkout, sin duplicados     | 8   | Check `hostawayReservationId`          |
| HO-7 | Write-back de estado openMAINT → Hostaway (opcional, requiere spike) | 5   | Investigar si Hostaway soporta updates |

---

### EPIC-3 — Custom page Kanban (Sprint 3 — 15 pts)

| Key   | Historia                                                              | Pts | Detalles                                |
| ----- | --------------------------------------------------------------------- | --- | --------------------------------------- |
| HO-8  | Scaffold de la custom page (3 archivos base, registrada en openMAINT) | 3   | View.js, Controller.js, Model.js        |
| HO-9  | Layout kanban de 4 columnas con cards desde openMAINT                 | 5   | Ext.panel.Panel con layout hbox         |
| HO-10 | Cambio de estado desde la tarjeta (PUT optimista con rollback)        | 5   | `PUT /classes/{classId}/cards/{cardId}` |
| HO-11 | Polling automático + botón de sincronización manual con Hostaway      | 2   | `Ext.TaskManager` + botón refresh       |

**Total:** 47 puntos — estimado 2 a 3 semanas

---

## 🔀 Orden de Ejecución (por dependencias)

```
HO-3 → HO-4 → HO-1 → HO-2 → HO-5 → HO-6 → HO-8 → HO-9 → HO-10 → HO-11

HO-7 va al final como investigación independiente
```

---

## 🧪 Mock Server (para desarrollo local)

### Propósito

Simular la API de Hostaway sin consumir el rate limit real (20 req/10s) durante el desarrollo.

### Instalación

```bash
cd "H:\Projects\dt4fm-system\docs\integrations\Integracion Hostaway"
npm init -y
npm install express
```

### Código: `hostaway-mock-server.js`

```javascript
const express = require("express");
const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const MOCK_TOKEN = "mock_token_12345_valid_24_months";

// ============================================
// POST /v1/accessTokens - Generar token OAuth2
// ============================================
app.post("/v1/accessTokens", (req, res) => {
  const { grant_type, client_id, client_secret, scope } = req.body;

  if (grant_type !== "client_credentials" || !client_id || !client_secret) {
    return res.status(400).json({ error: "invalid_request" });
  }

  res.json({
    token_type: "Bearer",
    expires_in: 63072000,
    access_token: MOCK_TOKEN,
  });
});

// ============================================
// GET /v1/reservations - Traer reservaciones
// ============================================
app.get("/v1/reservations", (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || authHeader !== `Bearer ${MOCK_TOKEN}`) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const { checkOutDateFrom, checkOutDateTo, limit = 10 } = req.query;

  const mockReservations = [
    {
      id: 57166582,
      listingMapId: 442107,
      listingName: "E04",
      hostawayReservationId: "57166582",
      guestName: "Anai Calva",
      guestFirstName: "Anai",
      guestLastName: "Calva",
      numberOfGuests: 2,
      adults: 2,
      children: 0,
      arrivalDate: "2026-04-03",
      departureDate: "2026-04-05",
      nights: 2,
      status: "new",
      checkInTime: 13,
      checkOutTime: 11,
      cleaningFee: 12,
    },
    {
      id: 56937768,
      listingMapId: 441665,
      listingName: "Cálido Studio junto al Metro La Pradera",
      hostawayReservationId: "56937768",
      guestName: "Rodolfo Carvalho De Oliveira",
      guestFirstName: "Rodolfo",
      guestLastName: "Carvalho De Oliveira",
      numberOfGuests: 1,
      adults: 1,
      children: 0,
      arrivalDate: "2026-04-03",
      departureDate: "2026-04-21",
      nights: 18,
      status: "new",
      checkInTime: 15,
      checkOutTime: 11,
      cleaningFee: 12,
    },
    {
      id: 56505786,
      listingMapId: 439760,
      listingName: "Estudio R306 - Edificio República",
      hostawayReservationId: "56505786",
      guestName: "Alonzo Hidalgo",
      guestFirstName: "Alonzo",
      guestLastName: "Hidalgo",
      numberOfGuests: 1,
      adults: 1,
      children: 0,
      arrivalDate: "2026-04-01",
      departureDate: "2026-04-06",
      nights: 5,
      status: "new",
      checkInTime: 15,
      checkOutTime: 11,
      cleaningFee: 12,
    },
  ];

  let filtered = mockReservations;
  if (checkOutDateFrom && checkOutDateTo) {
    filtered = mockReservations.filter((r) => {
      return (
        r.departureDate >= checkOutDateFrom && r.departureDate <= checkOutDateTo
      );
    });
  }

  const limited = filtered.slice(0, parseInt(limit));

  res.json({
    status: "success",
    result: limited,
    count: filtered.length,
    limit: parseInt(limit),
    offset: null,
  });
});

app.listen(PORT, () => {
  console.log(`✅ Mock Hostaway API corriendo en http://localhost:${PORT}`);
  console.log(`
📋 Endpoints disponibles:
  POST http://localhost:${PORT}/v1/accessTokens
  GET  http://localhost:${PORT}/v1/reservations

🧪 Prueba rápida:
  curl -X POST http://localhost:${PORT}/v1/accessTokens \\
    -H "Content-Type: application/x-www-form-urlencoded" \\
    -d "grant_type=client_credentials&client_id=test&client_secret=test&scope=general"
  `);
});
```

### Uso

```bash
# Ejecutar servidor
node hostaway-mock-server.js

# Probar en Postman
# Request 1: Obtener token
POST http://localhost:3000/v1/accessTokens
Body (x-www-form-urlencoded):
  grant_type: client_credentials
  client_id: test
  client_secret: test
  scope: general

# Request 2: Traer reservaciones
GET http://localhost:3000/v1/reservations?checkOutDateFrom=2026-04-01&checkOutDateTo=2026-04-30&limit=10
Headers:
  Authorization: Bearer mock_token_12345_valid_24_months
```

---

## 📝 Notas Técnicas

### Custom Page (patrón existente)

Referencia: custom page de sensores IoT existente en openMAINT

**Estructura:**

- `Sensors.js` → extiende `Ext.panel.Panel`, usa mixin `CMDBuildUI.mixins.CustomPage`
- `SensorsController.js` → `Ext.Ajax.request` para llamadas externas, `Ext.TaskManager` para polling
- `SensorsModel.js` → actualmente vacío, solo declara alias

**Diferencia clave:** la página de sensores IoT llama a un servidor externo pero NO interactúa con la BD de openMAINT. La nueva página kanban SÍ lo hará.

---

### Firewall VPS (Hostinger)

Configuración actual: 3 capas

1. **Panel Hostinger** → filtrado por IP
2. **UFW** → reglas OS-level
3. **iptables DOCKER-USER** → para servicios containerizados (openMAINT está en Docker)

Puerto 8090 (openMAINT API) está públicamente accesible para integraciones REST.

---

## ✅ Estado Actual del Proyecto

- [x] Credenciales Hostaway obtenidas (`client_id`, `client_secret`)
- [x] Estructura real de la API Hostaway confirmada (GET `/v1/reservations`)
- [x] Campos clave identificados para el modelo de datos
- [x] Mock server implementado para desarrollo local
- [ ] HO-1: Crear clase `CleaningTask` en openMAINT
- [ ] HO-2: Crear dominio Propiedad → CleaningTask
- [ ] HO-3: Implementar autenticación OAuth2 con Hostaway
- [ ] HO-4: Script de mapeo `listingMapId` ↔ Propiedad
- [ ] HO-5 a HO-11: Pendientes

---

## 📚 Referencias

- [openMAINT Webservice Manual](webservicemanualinenglish.pdf)
- [Hostaway API Documentation](https://api.hostaway.com/v1/)
- Hostaway Panel: Settings → API Access
- openMAINT Admin: `http://hostname:8090/cmdbuild` (módulo Administration)

---

## 🚀 Próximos Pasos Inmediatos

1. **Validar estructura de `CleaningTask`** con el equipo
2. **Verificar clase `Propiedad` existente** en openMAINT
3. **Crear HO-1** en openMAINT (vía REST API o Admin Module)
4. **Ejecutar prueba end-to-end** con mock server

---

**Última actualización:** 2 de abril de 2026  
**Autor:** Steven (sysadmin) + Claude (asistente técnico)
