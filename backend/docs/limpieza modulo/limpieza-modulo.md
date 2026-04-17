# Módulo de Tareas de Limpieza

## Descripción General

El módulo de Tareas de Limpieza (`CleaningTasks`) permite a los empleados de limpieza consultar las tareas que les han sido asignadas en el sistema OpenMAINT. Este módulo se integra con el sistema de gestión de propiedades Hostaway y sincroniza automáticamente las tareas de limpieza generadas a partir de los checkouts de reservaciones.

---

## Arquitectura

### Flujo de Datos

```
Hostaway API → Backend NestJS → OpenMAINT
                     ↓
              Clase: CleaningTask
                     ↓
              Frontend React
```

### Componentes Principales

| Componente                      | Responsabilidad                                |
| ------------------------------- | ---------------------------------------------- |
| `CleaningTasksController`       | Maneja las peticiones HTTP                     |
| `CleaningTasksService`          | Lógica de negocio y transformación de datos    |
| `CleaningTasksOpenmaintService` | Comunicación directa con OpenMAINT             |
| `CleaningTasksSessionService`   | Gestión de sesión dedicada para sincronización |

---

## Modelo de Datos

### CleaningTask (OpenMAINT)

| Campo                 | Tipo      | Descripción                                                              |
| --------------------- | --------- | ------------------------------------------------------------------------ |
| `_id`                 | number    | ID único de la tarea                                                     |
| `TaskNumber`          | string    | Número de tarea (formato: `CT.YYYY.XXXX`)                                |
| `Description`         | string    | Descripción de la tarea                                                  |
| `phase`               | lookup    | Estado de la tarea (`Generated`, `Assigned`, `In Progress`, `Completed`) |
| `GeneratedDate`       | date      | Fecha de generación automática                                           |
| `AssignedDate`        | date      | Fecha de asignación a empleado                                           |
| `PlannedStartTime`    | datetime  | Hora planificada de inicio                                               |
| `PlannedEndTime`      | datetime  | Hora planificada de fin                                                  |
| `ActualStartTime`     | datetime  | Hora real de inicio                                                      |
| `ActualEndTime`       | datetime  | Hora real de finalización                                                |
| `Observations`        | text      | Observaciones del empleado                                               |
| `HostawayReservation` | string    | ID de reservación en Hostaway                                            |
| `CheckoutDate`        | date      | Fecha de checkout de la reservación                                      |
| `Source`              | lookup    | Origen de la tarea (`Hostaway`, `Manual`)                                |
| `Unit`                | reference | Unidad/Apartamento a limpiar                                             |
| `Employee`            | reference | Empleado asignado (tabla `Employee`)                                     |

### Relaciones

- `CleaningTask` → `Unit` (Domain): Relación con la clase `Unit`
- `CleaningTask` → `Employee` (Domain): Relación con la clase `Employee`

---

## API Endpoints

### 1. Obtener Mis Tareas de Limpieza

**Endpoint:** `GET /cleaning-tasks/mine`

**Descripción:** Obtiene las tareas de limpieza asignadas al empleado autenticado.

#### Headers Requeridos

```
x-session-token: string        # Token de sesión obtenido del login
x-cleaning-employee-id: number # ID del empleado (cleaningEmployeeId del login)
```

#### Query Parameters

| Parámetro | Tipo   | Requerido | Default | Descripción                 |
| --------- | ------ | --------- | ------- | --------------------------- |
| `limit`   | number | No        | `50`    | Número máximo de resultados |
| `offset`  | number | No        | `0`     | Offset para paginación      |

**Validaciones:**

- `limit`: Debe ser ≥ 1
- `offset`: Debe ser ≥ 0

#### Request Example

```http
GET /cleaning-tasks/mine?limit=10&offset=0 HTTP/1.1
Host: localhost:3000
x-session-token: pgoyw7gi36jgjj89f71ca13o
x-cleaning-employee-id: 1558676
```

#### Response Success (200 OK)

```json
{
  "success": true,
  "data": [
    {
      "id": 1819845,
      "type": "CleaningTask",
      "taskNumber": "CT.2026.5999",
      "description": "Limpieza - Apto 310 - Torre A",
      "phase": "Assigned",
      "generatedDate": "2026-04-10",
      "assignedDate": "2026-04-13",
      "plannedStartTime": "2026-04-13T15:00:00Z",
      "plannedEndTime": "2026-04-13T16:00:00Z",
      "actualStartTime": null,
      "actualEndTime": null,
      "observations": null,
      "hostawayReservation": "HW-2026-003",
      "checkoutDate": "2026-04-10",
      "source": "Hostaway",
      "unit": null,
      "employee": {
        "id": 1558676,
        "name": "Palma Wilmer"
      }
    }
  ],
  "meta": {
    "total": 1,
    "limit": 10,
    "offset": 0
  }
}
```

#### Response Errors

**401 Unauthorized** — Token faltante

```json
{
  "statusCode": 401,
  "message": "Session token is required"
}
```

**400 Bad Request** — Employee ID faltante

```json
{
  "statusCode": 400,
  "message": "Cleaning employee ID is required"
}
```

**400 Bad Request** — Employee ID inválido

```json
{
  "statusCode": 400,
  "message": "Invalid employee ID"
}
```

**400 Bad Request** — Parámetros inválidos

```json
{
  "statusCode": 400,
  "message": [
    "limit must not be less than 1",
    "offset must not be less than 0"
  ],
  "error": "Bad Request"
}
```

---

## Integración con el Login

### Flujo de Autenticación

1. Usuario envía credenciales al endpoint `/auth/login`
2. Backend autentica con OpenMAINT y obtiene sesión
3. Backend consulta dos tablas para obtener ambos IDs de empleado:
   - `employeeId`: Para actividades de mantenimiento correctivo (tabla `Activity`)
   - `cleaningEmployeeId`: Para tareas de limpieza (tabla `Employee`)

### Response del Login

```json
{
  "sessionId": "pgoyw7gi36jgjj89f71ca13o",
  "username": "wilmer.palma",
  "userId": 628914,
  "role": "Team",
  "employeeId": null,
  "cleaningEmployeeId": 1558676
}
```

### Obtención del `cleaningEmployeeId`

El backend busca en la tabla `Employee` de OpenMAINT usando el campo `PortalUsername`:

```typescript
// Filtro aplicado en AuthService
const filter = {
  attribute: {
    simple: {
      attribute: 'PortalUsername',
      operator: 'equal',
      value: [username],
    },
  },
};
```

Endpoint OpenMAINT consultado:

```
GET /classes/Employee/cards?filter={...}&limit=1
```

---

## Consultas a OpenMAINT

### Obtener Tareas por Empleado

Filtro aplicado:

```json
{
  "attribute": {
    "simple": {
      "attribute": "Employee",
      "operator": "equal",
      "value": [1558676]
    }
  }
}
```

Endpoint completo:

```
GET /classes/CleaningTask/cards?filter=%7B%22attribute%22%3A%7B%22simple%22%3A%7B%22attribute%22%3A%22Employee%22%2C%22operator%22%3A%22equal%22%2C%22value%22%3A%5B1558676%5D%7D%7D%7D&limit=50&start=0
```

---

## Estados de Tarea (Phase)

| Código       | Descripción (ES) |
| ------------ | ---------------- |
| `Generated`  | Generada         |
| `Assigned`   | Asignada         |
| `InProgress` | En Progreso      |
| `Completed`  | Completada       |

## Tipos de Fuente (Source)

| Código     | Descripción                                   |
| ---------- | --------------------------------------------- |
| `Hostaway` | Tarea generada automáticamente desde Hostaway |
| `Manual`   | Tarea creada manualmente                      |

---

## Casos de Uso

### 1. Empleado Consulta Sus Tareas del Día

**Flujo:**

1. Usuario inicia sesión → Obtiene `sessionId` y `cleaningEmployeeId`
2. Frontend solicita tareas: `GET /cleaning-tasks/mine?limit=50`
3. Backend filtra tareas por `cleaningEmployeeId`
4. Retorna lista de tareas asignadas

### 2. Paginación de Tareas

Escenario: Empleado tiene 100 tareas asignadas

```javascript
// Página 1 (tareas 1-20)
GET /cleaning-tasks/mine?limit=20&offset=0

// Página 2 (tareas 21-40)
GET /cleaning-tasks/mine?limit=20&offset=20

// Página 3 (tareas 41-60)
GET /cleaning-tasks/mine?limit=20&offset=40
```

### 3. Empleado Sin Tareas Asignadas

```json
{
  "success": true,
  "data": [],
  "meta": {
    "total": 0,
    "limit": 50,
    "offset": 0
  }
}
```

---

## Diferencias con el Módulo de Incidencias

| Característica   | Incidencias        | Tareas de Limpieza      |
| ---------------- | ------------------ | ----------------------- |
| Clase OpenMAINT  | `Activity`         | `CleaningTask`          |
| Employee ID      | `employeeId`       | `cleaningEmployeeId`    |
| Origen           | Manual / Sistema   | Hostaway (automatizado) |
| Sesión OpenMAINT | Sesión del usuario | Sesión del usuario      |
| Endpoint         | `/incidents`       | `/cleaning-tasks/mine`  |

---

## Consideraciones de Seguridad

### Validación de Permisos

- El endpoint `/cleaning-tasks/mine` solo retorna tareas del empleado autenticado
- No es posible consultar tareas de otros empleados
- El `cleaningEmployeeId` debe coincidir con el usuario de la sesión

### Headers de Autenticación

Ambos headers son obligatorios:

- `x-session-token`: Valida que el usuario esté autenticado
- `x-cleaning-employee-id`: Identifica al empleado (debe coincidir con el login)

### Sesión de OpenMAINT

- La sesión expira después de inactividad
- Si la sesión expira, el usuario debe volver a hacer login
- El backend **NO** refresca automáticamente la sesión del usuario (a diferencia de la sesión interna del sistema usada en sincronización)

---

## Manejo de Errores

### Errores Comunes

| Error                   | Código | Acción                                                            |
| ----------------------- | ------ | ----------------------------------------------------------------- |
| Session Token Expirado  | `401`  | Redirigir al login                                                |
| Employee ID Incorrecto  | `400`  | Verificar que el usuario tenga un registro en la tabla `Employee` |
| OpenMAINT No Disponible | `500`  | Reintentar o mostrar mensaje de mantenimiento                     |

### Logging

```typescript
// En CleaningTasksOpenmaintService
this.logger.error('Error al obtener tareas del empleado:', error.message);
```

---

## Testing

### Prueba Manual con Postman

**Colección:** Cleaning Tasks API

**Request 1: Login**

```
POST http://localhost:3000/auth/login
Body: {"username": "wilmer.palma", "password": "****"}
```

**Request 2: Obtener Tareas**

```
GET http://localhost:3000/cleaning-tasks/mine?limit=10
Headers:
  x-session-token: {{sessionToken}}
  x-cleaning-employee-id: {{cleaningEmployeeId}}
```

### Casos de Prueba

| #   | Caso                         | Esperado        |
| --- | ---------------------------- | --------------- |
| 1   | Usuario con tareas asignadas | Lista de tareas |
| 2   | Usuario sin tareas           | Array vacío     |
| 3   | Sin `session-token`          | Error 401       |
| 4   | Sin `employee-id`            | Error 400       |
| 5   | Employee ID inválido (texto) | Error 400       |
| 6   | `limit = 0`                  | Error 400       |
| 7   | `offset` negativo            | Error 400       |

---

## Contacto y Soporte

- **Desarrollador:** Steven Erazo, Full stack developer
- **Última actualización:** 2026-04-13
- **Versión del módulo:** 1.0.0

## Referencias

- Documentación OpenMAINT REST API
- Manual de Webservices OpenMAINT
- Documentación NestJS
