# Documentación de Pruebas - Flujo Completo de Tareas de Limpieza

| Campo | Valor |
|---|---|
| **Fecha de Prueba** | 2026-04-13 |
| **Versión del Backend** | 1.0.0 |
| **Tarea de Prueba** | CT.2026.5997 (ID: 1819844) |
| **Empleado** | Usuario Prueba (ID: 1456396) |

---

## Resumen Ejecutivo

Se completó exitosamente el flujo completo de gestión de tareas de limpieza, desde la asignación inicial hasta la revisión final por parte del supervisor. El sistema gestionó correctamente:

- ✅ Autenticación y obtención de credenciales
- ✅ Listado de tareas asignadas
- ✅ Visualización de detalle de tarea
- ✅ Inicio de tarea con registro de tiempo
- ✅ Carga de fotografías (2 attachments)
- ✅ Finalización de tarea con observaciones
- ✅ Revisión y aprobación por administrador
- ✅ Transiciones de estado correctas
- ✅ Cálculo automático de duración

> **Duración Total de la Tarea:** 83 minutos
> **Estados Recorridos:** `Assigned` → `InExecution` → `Completed` → `Reviewed`

---

## Paso 1: Autenticación del Empleado

### Request

```http
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "username": "usuario.prueba",
  "password": "****"
}
```

### Response (200 OK)

```json
{
  "sessionId": "pgoyw7gi36jgjj89f71ca13o",
  "username": "usuario.prueba",
  "userId": 1456092,
  "role": "Team",
  "employeeId": null,
  "cleaningEmployeeId": 1456396
}
```

### Validación

- ✅ Devuelve `sessionId` para autenticación
- ✅ Devuelve `cleaningEmployeeId` (necesario para tareas de limpieza)
- ✅ `employeeId` es `null` (solo usado para mantenimiento correctivo)

---

## Paso 2: Listar Tareas Asignadas

### Request

```http
GET http://localhost:3000/cleaning-tasks/mine?limit=50&offset=0

Headers:
  x-session-token: pgoyw7gi36jgjj89f71ca13o
  x-cleaning-employee-id: 1456396
```

### Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": 1819844,
      "type": "CleaningTask",
      "taskNumber": "CT.2026.5997",
      "description": "Limpieza - Apto 205 - Torre B",
      "phase": "Assigned",
      "generatedDate": "2026-04-10",
      "assignedDate": "2026-04-13",
      "plannedStartTime": "2026-04-13T15:00:00Z",
      "plannedEndTime": "2026-04-13T16:00:00Z",
      "actualStartTime": null,
      "actualEndTime": null,
      "observations": null,
      "hostawayReservation": "HW-2026-002",
      "checkoutDate": "2026-04-10",
      "source": "Hostaway",
      "unit": null,
      "employee": {
        "id": 1456396,
        "name": "Usuario Prueba"
      }
    },
    {
      "id": 1819843,
      "type": "CleaningTask",
      "taskNumber": "CT.2026.5988",
      "description": "Limpieza - Apto 402 - Torre C",
      "phase": "Assigned",
      "generatedDate": "2026-04-10",
      "assignedDate": "2026-04-13",
      "plannedStartTime": "2026-04-13T16:00:00Z",
      "plannedEndTime": "2026-04-13T17:00:00Z",
      "actualStartTime": null,
      "actualEndTime": null,
      "observations": null,
      "hostawayReservation": "HW-2026-004",
      "checkoutDate": "2026-04-10",
      "source": "Hostaway",
      "unit": null,
      "employee": {
        "id": 1456396,
        "name": "Usuario Prueba"
      }
    }
  ],
  "meta": {
    "total": 2,
    "limit": 50,
    "offset": 0
  }
}
```

### Validación

- ✅ Devuelve 2 tareas asignadas al empleado
- ✅ Ambas en estado `"Assigned"`
- ✅ Metadata incluye `total`, `limit` y `offset` para paginación

---

## Paso 3: Obtener Detalle de Tarea

### Request

```http
GET http://localhost:3000/cleaning-tasks/1819844

Headers:
  x-session-token: pgoyw7gi36jgjj89f71ca13o
  x-cleaning-employee-id: 1456396
```

### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": 1819844,
    "type": "CleaningTask",
    "taskNumber": "CT.2026.5997",
    "description": "Limpieza - Apto 205 - Torre B",
    "phase": "Assigned",
    "phaseId": 1776119,
    "generatedDate": "2026-04-10",
    "assignedDate": "2026-04-13",
    "plannedStartTime": "2026-04-13T15:00:00Z",
    "plannedEndTime": "2026-04-13T16:00:00Z",
    "actualStartTime": null,
    "actualEndTime": null,
    "observations": null,
    "hostawayReservation": "HW-2026-002",
    "checkoutDate": "2026-04-10",
    "source": "Hostaway",
    "unit": null,
    "employee": {
      "id": 1456396,
      "name": "Usuario Prueba"
    },
    "attachments": [],
    "canStart": true,
    "canComplete": false,
    "canReview": false,
    "canCancel": true
  }
}
```

### Validación

- ✅ `phaseId: 1776119` (Assigned)
- ✅ `attachments: []` (sin fotos aún)
- ✅ Permisos correctos:
  - `canStart: true` → Puede iniciar
  - `canComplete: false` → No puede completar sin iniciar
  - `canReview: false` → No puede revisar (solo admin)
  - `canCancel: true` → Puede cancelar

---

## Paso 4: Iniciar Tarea

### Request

```http
PATCH http://localhost:3000/cleaning-tasks/1819844/start

Headers:
  x-session-token: pgoyw7gi36jgjj89f71ca13o
  x-cleaning-employee-id: 1456396
```

### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": 1819844,
    "phase": "InExecution",
    "actualStartTime": "2026-04-13T17:01:10.209Z"
  }
}
```

### Validación

- ✅ Estado cambió a `"InExecution"`
- ✅ `actualStartTime` registrado automáticamente
- ✅ Timestamp correcto: `2026-04-13 17:01:10 UTC`

---

## Paso 5: Verificar Cambio de Estado

### Request

```http
GET http://localhost:3000/cleaning-tasks/1819844

Headers:
  x-session-token: pgoyw7gi36jgjj89f71ca13o
  x-cleaning-employee-id: 1456396
```

### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "phase": "InExecution",
    "phaseId": 1776135,
    "actualStartTime": "2026-04-13T17:01:10.209Z",
    "canStart": false,
    "canComplete": true,
    "canCancel": true
  }
}
```

### Validación

- ✅ `phaseId: 1776135` (InExecution)
- ✅ Permisos actualizados:
  - `canStart: false` → Ya no puede iniciar
  - `canComplete: true` → Ahora puede completar
  - `canCancel: true` → Aún puede cancelar

---

## Paso 6: Subir Primera Fotografía

### Request

```http
POST http://localhost:3000/cleaning-tasks/1819844/attachments

Headers:
  x-session-token: pgoyw7gi36jgjj89f71ca13o
  x-cleaning-employee-id: 1456396
  Content-Type: multipart/form-data

Body (form-data):
  file: [imagen1.png] (binary)
  category: Photo
  description: Estado inicial del apartamento
```

### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "9e3pcbjgh9mc1z8r1mm2uk2pj3aut7nsxo2vgz5vre106vvcy80kivmy986xr5",
    "fileName": "imagen1.png",
    "category": "Photo",
    "uploadDate": "2026-04-13T18:18:50.249Z"
  }
}
```

### Validación

- ✅ Fotografía subida correctamente
- ✅ Categoría `"Photo"` convertida a ID `390625` internamente
- ✅ ID único generado por OpenMAINT

---

## Paso 7: Subir Segunda Fotografía

### Request

```http
POST http://localhost:3000/cleaning-tasks/1819844/attachments

Headers:
  x-session-token: pgoyw7gi36jgjj89f71ca13o
  x-cleaning-employee-id: 1456396
  Content-Type: multipart/form-data

Body (form-data):
  file: [imagen2.png] (binary)
  category: Image
  description: Proceso de limpieza - áreas completadas
```

### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": "b3iytjtbftepuyc0tqcouezqp3yccve3kk1z5j6pabelttfjb1qztqaulwk8kh",
    "fileName": "imagen2.png",
    "category": "Image",
    "uploadDate": "2026-04-13T18:06:41.056Z"
  }
}
```

### Validación

- ✅ Segunda fotografía subida
- ✅ Categoría `"Image"` funcionando correctamente

---

## Paso 8: Listar Fotografías

### Request

```http
GET http://localhost:3000/cleaning-tasks/1819844/attachments

Headers:
  x-session-token: pgoyw7gi36jgjj89f71ca13o
  x-cleaning-employee-id: 1456396
```

### Response (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": "9e3pcbjgh9mc1z8r1mm2uk2pj3aut7nsxo2vgz5vre106vvcy80kivmy986xr5",
      "category": "Photo",
      "uploadDate": "2026-04-13T18:18:50.249Z",
      "downloadUrl": "/cleaning-tasks/1819844/attachments/9e3pcbjgh9mc1z8r1mm2uk2pj3aut7nsxo2vgz5vre106vvcy80kivmy986xr5/download"
    },
    {
      "id": "b3iytjtbftepuyc0tqcouezqp3yccve3kk1z5j6pabelttfjb1qztqaulwk8kh",
      "category": "Image",
      "uploadDate": "2026-04-13T18:06:41.056Z",
      "downloadUrl": "/cleaning-tasks/1819844/attachments/b3iytjtbftepuyc0tqcouezqp3yccve3kk1z5j6pabelttfjb1qztqaulwk8kh/download"
    }
  ],
  "meta": {
    "total": 2
  }
}
```

### Validación

- ✅ 2 attachments listados correctamente
- ✅ URLs de descarga generadas
- ✅ Metadata con total correcto

---

## Paso 9: Completar Tarea

### Request

```http
PATCH http://localhost:3000/cleaning-tasks/1819844/complete

Headers:
  x-session-token: pgoyw7gi36jgjj89f71ca13o
  x-cleaning-employee-id: 1456396
  Content-Type: application/json

{
  "observations": "Limpieza completada exitosamente. Apartamento en perfecto estado. Se realizó limpieza profunda de todas las áreas, cambio de ropa de cama y toallas. Sin incidencias."
}
```

### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": 1819844,
    "phase": "Completed",
    "actualEndTime": "2026-04-13T18:23:48.525Z",
    "observations": "Limpieza completada exitosamente. Apartamento en perfecto estado. Se realizó limpieza profunda de todas las áreas, cambio de ropa de cama y toallas. Sin incidencias.",
    "duration": 83
  }
}
```

### Validación

- ✅ Estado cambió a `"Completed"`
- ✅ `actualEndTime` registrado: `2026-04-13 18:23:48 UTC`
- ✅ Duración calculada: **83 minutos** (desde 17:01:10 hasta 18:23:48)
- ✅ Observaciones guardadas correctamente

---

## Paso 10: Verificar Tarea Completada

### Request

```http
GET http://localhost:3000/cleaning-tasks/1819844

Headers:
  x-session-token: pgoyw7gi36jgjj89f71ca13o
  x-cleaning-employee-id: 1456396
```

### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": 1819844,
    "phase": "Completed",
    "actualEndTime": "2026-04-13T18:23:48.525Z",
    "observations": "Limpieza completada exitosamente. Apartamento en perfecto estado. Se realizó limpieza profunda de todas las áreas, cambio de ropa de cama y toallas. Sin incidencias.",
    "duration": 83
  }
}
```

### Validación

- ✅ Estado confirmado: `"Completed"`
- ✅ Todos los datos persistidos correctamente

---

## Paso 11: Autenticación del Administrador

### Request

```http
POST http://localhost:3000/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "admin"
}
```

### Response (200 OK)

```json
{
  "sessionId": "abc123admintoken",
  "username": "admin",
  "userId": 1,
  "role": "SuperUser",
  "employeeId": null,
  "cleaningEmployeeId": null
}
```

### Validación

- ✅ Admin autenticado correctamente
- ✅ `role: "SuperUser"` (necesario para revisar tareas)

---

## Paso 12: Revisar y Aprobar Tarea

### Request

```http
PATCH http://localhost:3000/cleaning-tasks/1819844/review

Headers:
  x-session-token: abc123admintoken
  x-role: SuperUser
  Content-Type: application/json

{
  "approved": true,
  "reviewComments": "Excelente trabajo. Apartamento impecable, bien documentado con fotografías. Aprobado."
}
```

### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": 1819844,
    "phase": "Reviewed",
    "reviewComments": "Excelente trabajo. Apartamento impecable, bien documentado con fotografías. Aprobado."
  }
}
```

### Validación

- ✅ Estado cambió a `"Reviewed"`
- ✅ Comentarios de revisión guardados
- ✅ Transición `Completed` → `Reviewed` exitosa

---

## Paso 13: Verificar Estado Final

### Request

```http
GET http://localhost:3000/cleaning-tasks/1819844

Headers:
  x-session-token: abc123admintoken
  x-cleaning-employee-id: 1456396
```

### Response (200 OK)

```json
{
  "success": true,
  "data": {
    "id": 1819844,
    "type": "CleaningTask",
    "taskNumber": "CT.2026.5997",
    "description": "Limpieza - Apto 205 - Torre B",
    "phase": "Reviewed",
    "phaseId": 1776141,
    "generatedDate": "2026-04-10",
    "assignedDate": "2026-04-13",
    "plannedStartTime": "2026-04-13T15:00:00Z",
    "plannedEndTime": "2026-04-13T16:00:00Z",
    "actualStartTime": "2026-04-13T17:01:10.209Z",
    "actualEndTime": "2026-04-13T18:23:48.525Z",
    "observations": "Limpieza completada exitosamente. Apartamento en perfecto estado. Se realizó limpieza profunda de todas las áreas, cambio de ropa de cama y toallas. Sin incidencias.",
    "hostawayReservation": "HW-2026-002",
    "checkoutDate": "2026-04-10",
    "source": "Hostaway",
    "unit": null,
    "employee": {
      "id": 1456396,
      "name": "Usuario Prueba"
    },
    "attachments": [
      {
        "id": "9e3pcbjgh9mc1z8r1mm2uk2pj3aut7nsxo2vgz5vre106vvcy80kivmy986xr5",
        "category": "Photo",
        "uploadDate": "2026-04-13T18:18:50.249Z"
      },
      {
        "id": "b3iytjtbftepuyc0tqcouezqp3yccve3kk1z5j6pabelttfjb1qztqaulwk8kh",
        "category": "Image",
        "uploadDate": "2026-04-13T18:06:41.056Z"
      }
    ],
    "canStart": false,
    "canComplete": false,
    "canReview": false,
    "canCancel": false
  }
}
```

### Validación

- ✅ `phaseId: 1776141` (Reviewed - estado final)
- ✅ Historial completo de tiempos:
  - **Inicio:** `2026-04-13T17:01:10.209Z`
  - **Fin:** `2026-04-13T18:23:48.525Z`
  - **Duración:** 83 minutos
- ✅ 2 attachments preservados
- ✅ Observaciones y comentarios de revisión completos
- ✅ Todos los permisos en `false` (tarea finalizada)

---

## Paso 14: Verificar Lista de Tareas del Empleado

### Request

```http
GET http://localhost:3000/cleaning-tasks/mine?limit=50

Headers:
  x-session-token: pgoyw7gi36jgjj89f71ca13o
  x-cleaning-employee-id: 1456396
```

### Response (200 OK)

```json
{
  "success": true,
  "data": [
    { "id": 1819844, "phase": "Reviewed", "..." : "..." },
    { "id": 1819843, "phase": "Assigned", "..." : "..." }
  ],
  "meta": {
    "total": 2
  }
}
```

### Validación

- ✅ Tarea `1819844` aparece con estado `"Reviewed"`
- ✅ Tarea `1819843` sigue en estado `"Assigned"` (sin modificar)

---

## Referencia: Mapeo de Estados y Transiciones

### Estados (Lookup CT-STATUS)

| ID | Código | Descripción | Tipo |
|---|---|---|---|
| 1776119 | `Assigned` | Asignada | Inicial |
| 1776135 | `InExecution` | En Ejecución | Intermedio |
| 1776138 | `Completed` | Completada | Intermedio |
| 1776141 | `Reviewed` | Revisada | Final |
| 1776147 | `Cancelled` | Cancelada | Final |

### Flujo de Transiciones Validado

```
Assigned (1776119)
    ↓ [PATCH /start]
InExecution (1776135)
    ↓ [PATCH /complete]
Completed (1776138)
    ↓ [PATCH /review (approved: true)]
Reviewed (1776141)
```

---

## Referencia: Categorías DMS de Attachments

| Código | ID | Descripción |
|---|---|---|
| `Document` | 11 | Documentos |
| `Image` | 12 | Imágenes |
| `Photo` | 390625 | Fotografías |
| `Signature` | 390626 | Firmas |

> **Conversión Automática:** El backend convierte el código string (ej: `"Photo"`) al ID numérico (`390625`) antes de enviar a OpenMAINT.

---

## Endpoints Implementados y Validados

| # | Método | Endpoint | Estado |
|---|---|---|---|
| 1 | `POST` | `/auth/login` | ✅ OK |
| 2 | `GET` | `/cleaning-tasks/mine` | ✅ OK |
| 3 | `GET` | `/cleaning-tasks/:taskId` | ✅ OK |
| 4 | `PATCH` | `/cleaning-tasks/:taskId/start` | ✅ OK |
| 5 | `POST` | `/cleaning-tasks/:taskId/attachments` | ✅ OK |
| 6 | `GET` | `/cleaning-tasks/:taskId/attachments` | ✅ OK |
| 7 | `PATCH` | `/cleaning-tasks/:taskId/complete` | ✅ OK |
| 8 | `PATCH` | `/cleaning-tasks/:taskId/review` | ✅ OK |
