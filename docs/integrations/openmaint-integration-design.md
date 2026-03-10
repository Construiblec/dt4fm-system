# Diseño Técnico de Integración  
## DT4FM – Integración con Sistema de Mantenimiento

## 1. Objetivo

Este documento describe el diseño técnico de integración entre la plataforma **DT4FM (Digital Twin for Facility Management)** y el sistema **OpenMAINT**.

El objetivo de esta integración es permitir que los usuarios reporten incidentes de mantenimiento desde la aplicación de DT4FM, mientras que OpenMAINT gestiona el flujo operativo de mantenimiento correctivo.

DT4FM funcionará como una capa de experiencia de usuario y orquestación, mientras que OpenMAINT actuará como el sistema central de gestión de mantenimiento.

---

## 2. Arquitectura de Integración

La integración se realiza mediante APIs REST expuestas por OpenMAINT.

El frontend de DT4FM no se conecta directamente con OpenMAINT, sino que todas las comunicaciones se realizan a través de un backend propio.

Esto permite:

- centralizar la integración
- controlar seguridad
- transformar datos
- desacoplar el frontend del sistema de mantenimiento

### Arquitectura de comunicación

```text
Aplicación Web / Mobile
│
▼
Backend API (NestJS)
│
▼
OpenMAINT REST API
```

### Responsabilidades

| Componente | Responsabilidad |
|---|---|
| Frontend | Interfaz de usuario para reportar incidentes |
| Backend | Integración con APIs de OpenMAINT |
| OpenMAINT | Gestión de procesos de mantenimiento |

---

## 3. Autenticación con OpenMAINT

Para consumir las APIs de OpenMAINT es necesario iniciar sesión mediante el endpoint de sesiones.

### Endpoint

```http
POST /cmdbuild/services/rest/v3/sessions
```

### Request

```json
{
  "username": "admin",
  "password": "admin"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "_id": "session_id"
  }
}
```

El campo `_id` corresponde al token de sesión que debe enviarse en todas las solicitudes posteriores.

**Header requerido:**
`CMDBuild-Authorization: session_id`

---

## 4. Flujo de Creación de Incidente

Cuando un usuario reporta un incidente desde la aplicación se ejecuta el siguiente flujo:

1. El usuario reporta un incidente desde la aplicación.
2. El frontend envía los datos al backend.
3. El backend valida la información.
4. El backend se autentica contra OpenMAINT si es necesario.
5. El backend envía la solicitud de creación de incidente.
6. OpenMAINT registra el incidente dentro del proceso de mantenimiento.
7. OpenMAINT devuelve el número del incidente.
8. El backend retorna la respuesta al frontend.

### Flujo técnico

```text
Usuario
  │
  ▼
Frontend
  │
  ▼
POST /incidents
  │
  ▼
Backend DT4FM
  │
  ▼
POST /processes/CorrectiveMaint
  │
  ▼
OpenMAINT
```

---

## 5. APIs de OpenMAINT Utilizadas

| API | Descripción |
|---|---|
| Sessions | Autenticación con OpenMAINT |
| Buildings | Obtención de edificios |
| Create Incident | Creación de incidente |

---

## 6. Obtención de Edificios

Permite listar los edificios registrados en OpenMAINT.

### Endpoint

```http
GET /cmdbuild/services/rest/v3/classes/Building/cards
```

### Headers

- **Content-Type:** application/json
- **CMDBuild-Authorization:** session_id

### Response (ejemplo)

```json
{
  "success": true,
  "data": [
    {
      "_id": 542345,
      "Code": "REP3",
      "Name": "Proy2",
      "Description": "REP3 - Proy2"
    }
  ]
}
```

Estos edificios se utilizan para asociar el incidente a una ubicación específica.

---

## 7. Creación de Incidente

Los incidentes se registran mediante el proceso Corrective Maintenance de OpenMAINT.

### Endpoint

```http
POST /cmdbuild/services/rest/v3/processes/CorrectiveMaint/instances
```

### Request (ejemplo)

```json
{
  "_type": "CorrectiveMaint",
  "_activity": "CM01-Opening",
  "_advance": true,

  "OpeningDate": "2026-03-03T11:25:59-05:00",
  "ShortDescr": "Incidente reportado",
  "ProcessNotes": "Ducha dañada",

  "Requester": 530488,
  "Priority": 118,
  "Site": 542345
}
```

### Response (ejemplo)

```json
{
  "success": true,
  "data": {
    "_id": 682015,
    "Number": "CM.2026.0032",
    "Description": "Incidente reportado"
  }
}
```

El campo `Number` corresponde al número oficial del incidente generado por OpenMAINT.

---

## 8. Modelo de Datos de Integración

| DT4FM | OpenMAINT |
|---|---|
| title | ShortDescr |
| description | ProcessNotes |
| buildingId | Site |
| priority | Priority |

---

## 9. Manejo de Errores

| Error | Descripción |
|---|---|
| 401 | Sesión inválida |
| 403 | Permisos insuficientes |
| 400 | Datos inválidos |
| 500 | Error interno |

El backend debe capturar estos errores y retornar respuestas controladas al frontend.

---

## 10. Seguridad

Las siguientes medidas de seguridad se implementan en la integración:

- OpenMAINT no es accesible directamente desde el frontend.
- Todas las llamadas pasan por el backend.
- El token de sesión se maneja únicamente en el backend.
- Se validan los datos antes de enviarlos a OpenMAINT.

---

## 11. Escalabilidad

La arquitectura permite extender la integración para nuevos módulos:

- mantenimiento preventivo
- gestión de arrendatarios
- gestión de huéspedes
- gestión de servicios

El backend de DT4FM actuará como la capa de integración central para todos los módulos del sistema.
