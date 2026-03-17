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
      "status": string,
      "building": string,
      "createdAt": string
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
      "priority": "High",
      "status": "Execution",
      "building": "REP3 - Proy2",
      "createdAt": "2026-03-17T15:56:43Z"
    },
    {
      "id": 660570,
      "number": "CM.2026.0030",
      "location": "P103",
      "priority": "Medium",
      "status": "Execution",
      "building": "R - Republica",
      "createdAt": "2026-03-09T17:09:27Z"
    }
  ]
}
🔹 Mapeo de datos (OpenMAINT → Backend)
OpenMAINT	Backend
_id	id
Number	number
ShortDescr	location
_Priority_description	priority
_ProcessStatus_description	status
_Site_description	building
OpeningDate	createdAt
🔹 Consideraciones
✅ Autenticación basada en sesión

El endpoint depende únicamente del sessionId

OpenMAINT determina automáticamente los incidentes del usuario

❌ No se utilizan filtros manuales

No se envía filter en la consulta

Evita inconsistencias con Requester/Assignee

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
