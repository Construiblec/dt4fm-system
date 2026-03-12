# Arquitectura Backend DT4FM

## Descripción General

Este documento define la arquitectura inicial del backend para la plataforma **DT4FM (Digital Twin for Facility Management)**.

El backend está desarrollado con **NestJS** y funciona como una **capa de integración** entre la aplicación frontend y el sistema **OpenMAINT**, que actúa como el motor CAFM encargado de la gestión de mantenimiento.

El objetivo principal del backend es:

* Proveer una API limpia para las aplicaciones frontend
* Integrarse con las APIs REST de OpenMAINT
* Manejar autenticación y sesiones con OpenMAINT
* Encapsular la comunicación con sistemas externos
* Preparar la plataforma para crecimiento futuro

---

# Arquitectura del Sistema

El sistema sigue una arquitectura por capas.

```text
Frontend (React)
        │
        ▼
Backend API (NestJS)
        │
        ▼
OpenMAINT REST API
```

El frontend **nunca se comunica directamente con OpenMAINT**.

Todas las solicitudes pasan por el backend.

---

# Responsabilidades del Backend

El backend cumple las siguientes responsabilidades:

* Integración con las APIs REST de OpenMAINT
* Manejo de autenticación con OpenMAINT
* Exposición de endpoints para el frontend
* Transformación de modelos de datos
* Validación de solicitudes entrantes
* Encapsulación de sistemas externos

---

# Tecnologías Utilizadas

| Componente    | Tecnología      |
| ------------- | --------------- |
| Framework     | NestJS          |
| Lenguaje      | TypeScript      |
| Cliente HTTP  | Axios           |
| Validación    | class-validator |
| Configuración | @nestjs/config  |
| Runtime       | Node.js         |

---

# Estructura del Proyecto

El backend sigue una **arquitectura modular**.

```text
backend
│
├── src
│   │
│   ├── main.ts
│   ├── app.module.ts
│   │
│   ├── config
│   │   └── openmaint.config.ts
│   │
│   ├── integrations
│   │   └── openmaint
│   │       ├── openmaint.module.ts
│   │       ├── openmaint.client.ts
│   │       ├── openmaint.service.ts
│   │       └── openmaint.auth.service.ts
│   │
│   ├── modules
│   │   │
│   │   ├── auth
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   └── dto
│   │   │       └── login.dto.ts
│   │   │
│   │   └── incidents
│   │       ├── incidents.module.ts
│   │       ├── incidents.controller.ts
│   │       ├── incidents.service.ts
│   │       └── dto
│   │           └── create-incident.dto.ts
│   │
│   └── common
│       └── types
│           └── openmaint-session.type.ts
```

---

# Capa de Integración

La **capa de integración** es responsable de toda la comunicación con OpenMAINT.

Ubicación:

```text
src/integrations/openmaint
```

Componentes principales:

### openmaint.client.ts

Maneja la comunicación HTTP con la API de OpenMAINT.

Responsabilidades:

* Construir las URLs de las solicitudes
* Adjuntar headers de autenticación
* Enviar solicitudes HTTP

---

### openmaint.service.ts

Proporciona operaciones de alto nivel para interactuar con OpenMAINT.

Responsabilidades:

* Operaciones relacionadas con OpenMAINT
* Creación de incidentes
* Transformación de datos

---

### openmaint.auth.service.ts

Maneja la autenticación con OpenMAINT.

Responsabilidades:

* Llamar al endpoint de login
* Obtener el sessionId
* Proveer sesiones para futuras solicitudes

---

# Módulo de Autenticación

El módulo de autenticación expone el endpoint de login utilizado por el frontend.

Ubicación:

```text
src/modules/auth
```

Endpoint:

```text
POST /auth/login
```

Solicitud:

```json
{
  "username": "admin",
  "password": "admin"
}
```

Flujo interno:

```text
AuthController
      │
      ▼
AuthService
      │
      ▼
OpenmaintAuthService
      │
      ▼
OpenmaintClient
      │
      ▼
OpenMAINT API
```

---

# Integración con la API de OpenMAINT

El backend se comunica con la API REST de OpenMAINT.

URL base:

```text
http://localhost:8090/cmdbuild/services/rest/v3
```

Endpoint de autenticación:

```text
POST /sessions
```

Ejemplo de solicitud:

```json
{
  "username": "admin",
  "password": "admin"
}
```

Ejemplo de respuesta:

```json
{
  "data": {
    "_id": "session-id",
    "username": "admin"
  }
}
```

El valor `_id` representa el **sessionId de OpenMAINT**.

Este valor debe enviarse en las siguientes solicitudes mediante el header:

```text
Cmdbuild-authorization: <sessionId>
```

---

# Variables de Entorno

La configuración del backend utiliza variables de entorno.

Ejemplo de archivo `.env`:

```env
OPENMAINT_URL=http://localhost:8090/cmdbuild/services/rest/v3
OPENMAINT_USERNAME=admin
OPENMAINT_PASSWORD=admin
```

---

# Primer Endpoint del Backend

El primer endpoint implementado se utiliza para probar la integración con OpenMAINT.

```text
POST /auth/login
```

Este endpoint:

1. Recibe credenciales
2. Llama al endpoint `/sessions` de OpenMAINT
3. Devuelve el sessionId

Esto permite confirmar que el backend puede comunicarse correctamente con OpenMAINT.

---

# Principios Arquitectónicos

El backend sigue los siguientes principios:

* Arquitectura modular
* Separación de responsabilidades
* Encapsulación de sistemas externos
* Diseño API-first
* Escalabilidad de la capa de integración
