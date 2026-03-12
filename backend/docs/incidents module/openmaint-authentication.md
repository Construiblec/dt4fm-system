# Integración de Autenticación con OpenMAINT

## Descripción

Este documento describe la implementación del flujo de autenticación entre el backend de **DT4FM** y el sistema **OpenMAINT**.

El backend funciona como una capa de integración que permite que las aplicaciones frontend se autentiquen indirectamente contra OpenMAINT utilizando una API propia.

El objetivo de esta integración es:

* Encapsular la autenticación de OpenMAINT
* Evitar que el frontend se conecte directamente con OpenMAINT
* Preparar el backend para manejar sesiones de forma centralizada
* Facilitar futuras integraciones con otros módulos

---

# Arquitectura del Flujo de Login

El flujo de autenticación implementado sigue la arquitectura modular del backend.

```text
Frontend
   │
   ▼
POST /auth/login
   │
   ▼
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
OpenMAINT REST API
```

Cada capa tiene responsabilidades claramente definidas.

---

# Endpoint del Backend

Endpoint expuesto por el backend:

```http
POST /auth/login
```

Este endpoint permite al frontend autenticarse en OpenMAINT a través del backend.

---

# Request del Frontend

```json
{
  "username": "raul.ontaneda",
  "password": "Raul2026."
}
```

---

# Integración con OpenMAINT

El backend realiza una solicitud al endpoint de autenticación de OpenMAINT.

URL:

```http
POST http://localhost:8090/cmdbuild/services/rest/v3/sessions?scope=service&returnId=true
```

Headers:

```text
Content-Type: application/json
```

Body enviado a OpenMAINT:

```json
{
  "username": "raul.ontaneda",
  "password": "Raul2026."
}
```

---

# Respuesta de OpenMAINT

OpenMAINT devuelve un objeto con información de sesión.

Ejemplo:

```json
{
  "success": true,
  "data": {
    "_id": "iy7ho3q4p3ccwy9wu2fuo97q",
    "username": "raul.ontaneda",
    "role": "MaintOffice"
  }
}
```

El campo más importante es:

```text
data._id
```

Este valor corresponde al **sessionId de OpenMAINT**.

---

# Respuesta del Backend

El backend transforma la respuesta y devuelve únicamente la información necesaria al frontend.

```json
{
  "sessionId": "iy7ho3q4p3ccwy9wu2fuo97q",
  "username": "raul.ontaneda",
  "role": "MaintOffice"
}
```

---

# Uso del SessionId

El `sessionId` obtenido se utiliza para autenticarse en futuras solicitudes a OpenMAINT.

Debe enviarse en el header:

```text
Cmdbuild-authorization: <sessionId>
```

Ejemplo:

```http
GET /classes/Building/cards
```

Headers:

```text
Cmdbuild-authorization: iy7ho3q4p3ccwy9wu2fuo97q
```

---

# Componentes Implementados

La integración utiliza varios componentes dentro del backend.

## AuthController

Responsable de exponer el endpoint HTTP.

```text
POST /auth/login
```

Recibe las credenciales del frontend y delega la autenticación al servicio.

---

## AuthService

Contiene la lógica de autenticación.

Responsabilidades:

* Validar la respuesta de OpenMAINT
* Transformar la respuesta
* Devolver un objeto simplificado al frontend

---

## OpenmaintAuthService

Responsable de realizar la autenticación contra OpenMAINT.

Funciones principales:

* Construir la solicitud de login
* Enviar credenciales
* Recibir información de sesión

---

## OpenmaintClient

Cliente HTTP encargado de comunicarse con la API REST de OpenMAINT.

Responsabilidades:

* Construcción de URLs
* Envío de solicitudes HTTP
* Manejo básico de errores

---

# Variables de Entorno

La conexión con OpenMAINT se configura mediante variables de entorno.

Archivo `.env`:

```env
OPENMAINT_URL=http://localhost:8090/cmdbuild/services/rest/v3
```

Esto permite cambiar la URL del sistema OpenMAINT sin modificar el código.

---

# Validación de Requests

El backend utiliza **DTOs y class-validator** para validar las solicitudes.

DTO utilizado:

```text
LoginDto
```

Campos requeridos:

* username
* password

Esto garantiza que el endpoint reciba datos correctamente formados.

---

# Resultado de la Integración

Con esta implementación se logró:

* Integración funcional entre NestJS y OpenMAINT
* Encapsulación completa del login
* Arquitectura modular mantenible
* Separación clara entre lógica de negocio e integración externa

El backend ahora puede autenticarse correctamente contra OpenMAINT.

---

# Próximos Pasos

Después de implementar el login, los siguientes endpoints a desarrollar son:

### Obtener edificios

```http
GET /buildings
```

Integración:

```http
GET /classes/Building/cards
```

---

### Crear incidente

```http
POST /incidents
```

Integración:

```http
POST /processes/CorrectiveMaint/instances
```

---

# Notas Técnicas

La autenticación actual genera una sesión de tipo:

```text
sessionType: batch
```

Este tipo de sesión es adecuado para integraciones backend.

En futuras versiones del backend se implementará:

* gestión de sesión automática
* cacheo del sessionId
* renovación automática de sesión
* soporte para múltiples usuarios concurrentes
