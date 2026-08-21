📘 Documentación — Endpoint Detalle de Incidente
📌 Descripción

Este endpoint permite obtener el detalle completo de un incidente específico, incluyendo:

Información principal del incidente

Estado y prioridad

Ubicación (site)

Fecha de creación

Notas (extraídas desde el register de OpenMAINT)

Imágenes asociadas (attachments en base64)

Este endpoint actúa como orquestador entre el frontend y OpenMAINT, agregando y transformando la información.

🔗 Endpoint
GET /incidents/:id
🔐 Headers requeridos
Authorization: <sessionId>
📥 Parámetros
Parámetro Tipo Descripción
id number ID del incidente en OpenMAINT
📤 Respuesta
{
"id": 783231,
"number": "CM.2026.0076",
"location": "01/09",
"building": "REP3 - Proy2",
"statusCode": "Completed",
"status": "Completed",
"priority": "High",
"createdAt": "2026-03-17T15:56:43Z",
"notes": "Me robaron la puerta ...",
"images": [
"data:image/png;base64,..."
]
}
🧠 Mapeo desde OpenMAINT
Campo Backend Campo OpenMAINT
id \_id
number Number
location ShortDescr
building \_Site_description
statusCode \_ProcessStatus_code (vía CM_STATUS_CODE_TO_NAME)
status \_ProcessStatus_description
priority \_Priority_description
createdAt OpeningDate
notes Register (procesado)
images attachments + preview (base64)
🖼️ Manejo de imágenes

Flujo:

Se consulta:

/processes/CorrectiveMaint/instances/{id}/attachments

Por cada attachment:

/attachments/{attachmentId}/preview

Se construye:

data:image/png;base64,...
📝 Procesamiento de notas

Fuente: campo Register (HTML)

Se extrae el contenido de:

<span data-block="notes">

Se limpia HTML → texto plano

Se retorna la última nota registrada

⚠️ Consideraciones

Puede devolver:

notes: null si no existen notas

images: [] si no hay adjuntos

No falla si:

no hay imágenes

falla la carga de una imagen (se ignora)

Todas las imágenes vienen en base64 (no URLs)

❌ Manejo de errores
Caso Respuesta
Incidente no existe 404
Error en OpenMAINT 502
Error interno 500
