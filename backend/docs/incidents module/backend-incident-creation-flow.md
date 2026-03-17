Creación de Incidentes – Backend API

DT4FM – Digital Twin for Facility Management

1. Introducción

Este documento describe la implementación del endpoint POST /incidents en el backend del sistema DT4FM.

Este endpoint permite que las aplicaciones cliente (web o mobile) reporten incidentes que posteriormente son registrados en OpenMAINT como procesos de mantenimiento de tipo Corrective Maintenance.

El backend actúa como capa de integración entre el frontend y OpenMAINT, encargándose de:

transformar los datos del frontend

completar información requerida por OpenMAINT

crear el proceso de mantenimiento

subir archivos adjuntos (imágenes)

manejar errores del sistema externo

2. Arquitectura del flujo

La creación de incidentes sigue la arquitectura desacoplada definida para el sistema.

Frontend
│
│ POST /incidents
▼
Backend (NestJS)
│
│ Construcción del body CorrectiveMaint
▼
OpenMAINT API
│
│ POST /processes/CorrectiveMaint/instances
▼
Instancia de proceso creada
│
│ (opcional)
│ subir attachment
▼
OpenMAINT 3. Endpoint del backend
Endpoint
POST /incidents
Headers requeridos
Authorization: <sessionId>
x-employee-id: <employeeId>

Donde:

Header Descripción
Authorization SessionId de OpenMAINT obtenido en login
x-employee-id EmployeeId asociado al usuario 4. Tipo de request

El endpoint acepta:

multipart/form-data

Esto permite enviar tanto datos como archivos.

5. Campos enviados por el frontend
   Campo Tipo Descripción
   buildingId number ID del edificio seleccionado
   floorArea string Ubicación dentro del edificio
   priority number Nivel de prioridad del incidente
   notes string Descripción detallada
   image file (optional) Fotografía del incidente
6. Transformación de datos

El backend transforma los datos recibidos para adaptarlos al formato requerido por OpenMAINT.

Frontend OpenMAINT
buildingId Site
floorArea ShortDescr
notes ProcessNotes
priority Priority
employeeId Requester 7. Endpoint de OpenMAINT utilizado

El backend crea incidentes usando el endpoint:

POST /cmdbuild/services/rest/v3/processes/CorrectiveMaint/instances
Headers enviados
Content-Type: application/json
Cmdbuild-authorization: sessionId 8. Body enviado a OpenMAINT

Ejemplo de body generado por el backend:

{
"\_type": "CorrectiveMaint",
"\_activity": "CM01-Opening",
"\_advance": true,

"OpeningDate": "2026-03-13T10:30:00-05:00",

"ShortDescr": "Piso 3 - Baño 302",
"ProcessNotes": "Fuga de agua reportada desde aplicación móvil",

"Requester": 629039,
"Type": 268288,
"Priority": 118,
"Site": 542345,

"Category": 510370,
"Subcategory": 510391,

"ProcessStatus": 277461
} 9. Creación del incidente

Si OpenMAINT responde correctamente, el backend obtiene:

instanceId

Ejemplo:

718557

Este ID representa la instancia del proceso de mantenimiento creada.

10. Subida de imagen (opcional)

Si el frontend envió una imagen, el backend ejecuta una segunda llamada a OpenMAINT.

Endpoint
POST /cmdbuild/services/rest/v3/processes/CorrectiveMaint/instances/{instanceId}/attachments
Tipo de request
multipart/form-data

Archivo enviado:

image 11. Manejo de errores

El backend implementa diferentes estrategias de manejo de errores.

Error al crear incidente

Si OpenMAINT devuelve error al crear el proceso:

HTTP 500

Respuesta:

Error creating incident in OpenMAINT
Error al subir imagen

Si falla la subida del archivo:

el incidente no se cancela

el backend devuelve:

{
"attachmentUploaded": false
}
Incidente sin imagen

Si el usuario no envía una foto:

no se intenta subir attachment

el flujo continúa normalmente

12. Respuesta del backend

Ejemplo de respuesta exitosa:

{
"incidentId": 718557,
"requester": 629039,
"buildingId": 542345,
"attachmentUploaded": true
} 13. Arquitectura interna del backend

La implementación sigue la arquitectura modular del proyecto.

modules
└ incidents
├ incidents.controller.ts
├ incidents.service.ts
└ dto
└ create-incident.dto.ts

integrations
└ openmaint
├ openmaint.client.ts
└ openmaint.service.ts

Flujo interno:

Controller
↓
IncidentsService
↓
OpenmaintService
↓
OpenmaintClient
↓
OpenMAINT API 14. Validaciones implementadas

El backend valida:

campos obligatorios

tipos de datos

formato multipart

existencia de sesión

respuesta correcta de OpenMAINT

15. Ventajas de la implementación

Este diseño proporciona:

separación clara entre frontend y OpenMAINT

manejo centralizado de integración

control de errores del sistema externo

soporte para archivos adjuntos

arquitectura escalable
