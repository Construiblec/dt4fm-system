# 📌 Endpoint: Obtener Incidentes del Usuario

## 🔹 Descripción

Este endpoint permite obtener la lista de incidentes asociados al usuario autenticado en el sistema.

La consulta se realiza a través del backend, el cual se encarga de comunicarse con OpenMAINT utilizando el `sessionId` del usuario. No se aplican filtros manuales, ya que OpenMAINT gestiona automáticamente los resultados en base al contexto de sesión.

---

## 🔹 URL

GET /incidents/my

---

## 🔹 Headers requeridos

| Header        | Tipo   | Descripción                                                                           |
| ------------- | ------ | ------------------------------------------------------------------------------------- |
| Authorization | string | sessionId obtenido en el login                                                        |
| x-employee-id | number | ID del empleado (actualmente requerido por contrato, aunque no se usa en la consulta) |

### 📌 Ejemplo

```http
Authorization: u2m6hrch2k8l381xzfajilmf
x-employee-id: 629039
🔹 Funcionamiento interno

El frontend envía la petición con sessionId.

El backend recibe la solicitud.

El backend realiza una llamada a OpenMAINT:

GET /cmdbuild/services/rest/v3/processes/CorrectiveMaint/instances

Se incluyen los parámetros:

include_tasklist=false

onlyGridAttrs=true

start=0

limit=50

sort=Sorting DESC

OpenMAINT devuelve los incidentes asociados al usuario autenticado.

El backend transforma la respuesta y devuelve un formato limpio al frontend.

🔹 Respuesta
📌 Estructura
{
  "incidents": [
    {
      "id": number,
      "number": string,
      "location": string,
      "priority": string,
      "statusCode": string | null,
      "status": string,
      "building": string,
      "createdAt": string,
      "plannedStart": string | null
    }
  ]
}
🔹 Ejemplo real
{
  "incidents": [
    {
      "id": 783231,
      "number": "CM.2026.0076",
      "location": "01/09",
      "priority": "Alto",
      "statusCode": "Execution",
      "status": "Ejecución",
      "building": "REP3 - Proy2",
      "createdAt": "2026-03-17T15:56:43Z",
      "plannedStart": "2026-03-18T09:00:00Z"
    },
    {
      "id": 660570,
      "number": "CM.2026.0030",
      "location": "P103",
      "priority": "Medio",
      "statusCode": "Accounting",
      "status": "Contabilidad",
      "building": "R - Republica",
      "createdAt": "2026-03-09T17:09:27Z",
      "plannedStart": null
    }
  ]
}
🔹 Mapeo de datos (OpenMAINT → Backend)
OpenMAINT	Backend
_id	id
Number	number
ShortDescr	location
_Priority_description_translation	priority
_ProcessStatus_code + ExecStartDate	statusCode
_ProcessStatus_description_translation	status
_Site_description	building
OpeningDate	createdAt
ExpExecStartDate	plannedStart

⚠️ statusCode vs status

`status` es la etiqueta que OpenMAINT traduce según el idioma de la sesión
(«Ejecución», «Contabilidad»…). Sirve para mostrar, nunca para decidir.

`statusCode` es el nombre estable derivado de `_ProcessStatus_code`
(«Execution», «Accounting»…) mediante `resolveCorrectiveStatus`. Es el que
debe gobernar la lógica del frontend: qué tarjetas se pueden abrir, los
colores de estado y los filtros.

Antes solo se exponía la etiqueta traducida y el frontend deducía el código
comparando ese texto contra una tabla escrita a mano. Ya fallaba en la
práctica: OpenMAINT rotula `CM-Management` como «Administración» mientras la
tabla decía «Gestión».

Un caso no es traducción directa: con `CM-Execution` y `ExecStartDate` vacío
se devuelve **`"Assigned"`**, un estado que no existe en OpenMAINT y que
significa «asignado, pero el técnico no lo ha arrancado». Se sella pulsando
«Iniciar» — ver `incident-execution.endpoints.md`. La misma función la usa la
vista del supervisor, para que los dos roles no discrepen.

🔹 Consideraciones
✅ Autenticación basada en sesión

El endpoint depende del sessionId para autenticarse ante OpenMAINT

✅ Filtro por cesionario

Se envía filter con Assignee = x-employee-id, de modo que cada persona ve
solo los correctivos que tiene asignados

No se filtra por estado ni por estado de flujo: llegan también los cerrados
(`closed.completed`), que incluyen completados y cancelados

✅ Ordenamiento

Los incidentes se devuelven ordenados por fecha (más recientes primero)

✅ Paginación

Actualmente: limit=50

Puede extenderse en futuras versiones

🔹 Manejo de errores
Código	Descripción
400	Headers faltantes
502	Error al comunicarse con OpenMAINT
500	Error interno del servidor
🔹 Casos contemplados
Caso	Resultado
Usuario con incidentes	Lista de incidentes
Usuario sin incidentes	[]
Error en OpenMAINT	Error controlado
🔹 Flujo completo
Frontend
   ↓
GET /incidents/my
   ↓
Backend
   ↓
OpenMAINT (con sessionId)
   ↓
Transformación
   ↓
Respuesta limpia
🔹 Notas técnicas

Arquitectura: Controller → Service → OpenmaintService → OpenmaintClient

Se mantiene separación de responsabilidades

Backend actúa como capa de abstracción (anti-corruption layer)

🔹 Futuras mejoras

Filtros por estado (status)

Filtros por prioridad (priority)

Endpoint de detalle (/incidents/:id)

Paginación dinámica

🔹 Conclusión

Este endpoint establece la base para la visualización de incidentes en el frontend, delegando la lógica de negocio en OpenMAINT y manteniendo el backend como intermediario encargado de la transformación de datos.
```
