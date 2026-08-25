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

Ejemplo real (cuenta multigrupo, recortando `rolePrivileges`):

```json
{
  "success": true,
  "data": {
    "_id": "iy7ho3q4p3ccwy9wu2fuo97q",
    "username": "pamela.calo",
    "userId": 453364,
    "userDescription": "Asistente BIM-FM",
    "role": "SuperUser",
    "availableRoles": [
      "AdminOffice", "Guest", "MaintOffice", "Propietarios", "Requester",
      "SuperUser", "SupervisorLimpieza", "Supplier", "TPM", "Team"
    ],
    "rolePrivileges": { "admin_all": true, "...": "..." },
    "sessionType": "batch"
  }
}
```

Campos clave:

| Campo | Para qué sirve |
| --- | --- |
| `data._id` | El **sessionId de OpenMAINT** |
| `data.role` | Grupo **activo**. Es el Code, no la Description |
| `data.availableRoles` | **Todos** los grupos del usuario. Es lo que permite el selector de rol sin ninguna llamada extra |
| `data.userDescription` | Nombre legible, para el saludo y para localizar la ficha `Tenant` |
| `data.rolePrivileges` | Permisos efectivos del grupo activo; sirve para comprobar que un cambio de rol surtió efecto |

---

# Respuesta del Backend

El backend transforma la respuesta y añade los identificadores que la app
necesita. Los tres se resuelven de forma tolerante: si falta la ficha, vienen
`null` y el login no se cae.

```json
{
  "sessionId": "iy7ho3q4p3ccwy9wu2fuo97q",
  "username": "pamela.calo",
  "userId": 453364,
  "role": "SuperUser",
  "availableRoles": ["MaintOffice", "SupervisorLimpieza", "Propietarios"],
  "name": "Asistente BIM-FM",
  "employeeId": 1234,
  "cleaningEmployeeId": null,
  "tenantId": null
}
```

`tenantId` solo se busca cuando el usuario pertenece al grupo `Propietarios`,
porque localizarlo cuesta una sesión de servicio adicional.

---

# Login unificado

`POST /auth/login` sirve **igual a equipo y a residentes**: openMAINT autentica a
ambos contra el mismo `POST /sessions`. `POST /owners/login` sigue existiendo
como alias delegado para clientes antiguos, pero no debe usarse en código nuevo.

El body acepta un `role` opcional para emitir la sesión directamente en un grupo
concreto, en vez del grupo por defecto del usuario.

---

# Multi-rol: cambiar de grupo sin volver a entrar

Un usuario puede pertenecer a varios grupos, y cada uno abre una vista distinta
en la app. Para que el cambio de rol **no sea cosmético** hay que cambiarlo en
openMAINT: los permisos van atados al grupo de la sesión, así que cambiar solo la
etiqueta en el cliente dejaría al usuario viendo una pantalla cuyos datos
openMAINT le sigue negando.

Verificado contra la instancia — las dos vías funcionan:

```http
PUT /sessions/{sessionId}
Cmdbuild-authorization: {sessionId}

{ "role": "SupervisorLimpieza" }
```

Cambia el grupo activo **de la sesión viva**: conserva el `sessionId` y
openMAINT le recalcula los privilegios (`rolePrivileges` pasa de 104 entradas
como `SuperUser` a 33 como `SupervisorLimpieza`). Es la que usa
`POST /auth/role`, porque no obliga a volver a pedir la contraseña.

La alternativa es mandar `role` en el `POST /sessions` del login, que emite una
sesión nueva ya atada a ese grupo.

`GET /sessions/{sessionId}` devuelve `username`, `userId`, `userDescription`,
`role` y `availableRoles`, y por eso el backend puede validar que el grupo
pedido es realmente del usuario sin necesitar sesión de servicio.

---

# Endpoints del módulo

| Endpoint | Para qué |
| --- | --- |
| `POST /auth/login` | Acceso único (equipo y residentes) |
| `POST /auth/role` | Cambiar el grupo activo de la sesión |
| `PUT /auth/password` | Cambiar contraseña con sesión iniciada, cualquier rol |

`PUT /auth/password` reenvía los `userGroups` leídos de la cuenta: `PUT /users/{id}`
reemplaza el recurso completo, así que fijar la lista de grupos a mano le
borraría al usuario el resto de sus accesos.

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

## Códigos de rol de la instancia

`role` y `availableRoles` traen el **Code** del grupo, no su Description. Es la
confusión más habitual: el Code de "TPM Equipment" es `MaintOffice`, y el de
"Supervisor Mantenimientos" es `SupervisorMantenimiento`.

| Code | Description |
| --- | --- |
| `Requester` | Requester |
| `SuperUser` | Super user |
| `Guest` | External portal |
| `Supplier` | Supplier |
| `SupervisorLimpieza` | Supervisor Limpieza |
| `SupervisorMantenimiento` | Supervisor Mantenimientos |
| `Propietarios` | Propietarios |
| `Team` | Team |
| `MaintOffice` | TPM Equipment |
| `AdminOffice` | Administrative office |
| `TPM` | TPM |

Se obtienen con `GET /roles` (o `GET /classes/Role/cards`).

## Sesión de servicio

Algunas lecturas no son posibles con la sesión del propio usuario: `/users/{id}`
(que es lo único que expone los grupos con sus ids) y la búsqueda de fichas
`Tenant`. Para eso está `OpenmaintServiceSession`, que centraliza el login con la
cuenta del `.env`. **No cachea**: cada llamada abre una sesión nueva.

En futuras versiones del backend se implementará:

* cacheo de la sesión de servicio
* renovación automática de sesión
