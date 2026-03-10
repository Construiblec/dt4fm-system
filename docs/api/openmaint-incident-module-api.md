# Integración OpenMAINT — Módulo de Incidentes

## 1. Objetivo

Este documento describe las APIs de OpenMAINT utilizadas por la plataforma DT4FM para la gestión de incidentes.

El objetivo es documentar los endpoints necesarios para:

- autenticación con OpenMAINT
- consulta de activos
- consulta de ubicaciones
- creación de incidentes
- actualización de incidentes
- consulta de incidentes

---

## 2. Arquitectura de integración

La aplicación no se conecta directamente a OpenMAINT desde el frontend.

La arquitectura utilizada es:

Frontend (React + Vite)  
↓  
Backend API (NestJS)  
↓  
OpenMAINT REST API

El backend actúa como capa de integración entre el sistema DT4FM y OpenMAINT.

---

## Autenticación con OpenMAINT

### Endpoint
POST /cmdbuild/services/rest/v3/sessions?scope=service&returnId=true

### Descripción
Permite autenticar un usuario en OpenMAINT y crear una sesión para consumir sus APIs.

### Request

**Headers**

Content-Type: application/json

**Body**

```json
{
  "username": "admin",
  "password": "admin"
}
```

---

## Consulta de Edificios

### Endpoint
`GET /cmdbuild/services/rest/v3/classes/Building/cards`

### Descripción
Obtiene la lista de edificios registrados en OpenMAINT.  
Este endpoint permite recuperar información de los edificios para que el usuario seleccione la ubicación donde ocurre un incidente.

---

### Headers

| Header | Valor |
|------|------|
| Content-Type | application/json |
| CMDBuild-Authorization | {sessionId} |

---

### Ejemplo de Request

```http
GET http://localhost:8090/cmdbuild/services/rest/v3/classes/Building/cards
```

---

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
    },
    {
      "_id": 564939,
      "Code": "R",
      "Name": "Republica",
      "Description": "R - Republica",
      "Address": "Av. de la República E1-67 y Atahualpa",
      "City": "Quito"
    }
  ],
  "meta": {
    "total": 2
  }
}
```

### Campos relevantes

| Campo | Descripción |
|-------|-------------|
| `_id` | Identificador del edificio |
| `Code` | Código del edificio |
| `Name` | Nombre del edificio |
| `Description` | Descripción del edificio |
| `Address` | Dirección del edificio |
# Integración OpenMAINT — Módulo de Incidentes

## 1. Objetivo

Este documento describe las APIs de OpenMAINT utilizadas por la plataforma DT4FM para la gestión de incidentes.

El objetivo es documentar los endpoints necesarios para:

- autenticación con OpenMAINT
- consulta de activos
- consulta de ubicaciones
- creación de incidentes
- actualización de incidentes
- consulta de incidentes

---

## 2. Arquitectura de integración

La aplicación no se conecta directamente a OpenMAINT desde el frontend.

La arquitectura utilizada es:

Frontend (React + Vite)  
↓  
Backend API (NestJS)  
↓  
OpenMAINT REST API

El backend actúa como capa de integración entre el sistema DT4FM y OpenMAINT.

---

## Autenticación con OpenMAINT

### Endpoint
POST /cmdbuild/services/rest/v3/sessions?scope=service&returnId=true

### Descripción
Permite autenticar un usuario en OpenMAINT y crear una sesión para consumir sus APIs.

### Request

**Headers**

Content-Type: application/json

**Body**

```json
{
  "username": "admin",
  "password": "admin"
}
```

---

## Consulta de Edificios

### Endpoint
`GET /cmdbuild/services/rest/v3/classes/Building/cards`

### Descripción
Obtiene la lista de edificios registrados en OpenMAINT.  
Este endpoint permite recuperar información de los edificios para que el usuario seleccione la ubicación donde ocurre un incidente.

---

### Headers

| Header | Valor |
|------|------|
| Content-Type | application/json |
| CMDBuild-Authorization | {sessionId} |

---

### Ejemplo de Request

```http
GET http://localhost:8090/cmdbuild/services/rest/v3/classes/Building/cards
```

---

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
    },
    {
      "_id": 564939,
      "Code": "R",
      "Name": "Republica",
      "Description": "R - Republica",
      "Address": "Av. de la República E1-67 y Atahualpa",
      "City": "Quito"
    }
  ],
  "meta": {
    "total": 2
  }
}
```

### Campos relevantes

| Campo | Descripción |
|-------|-------------|
| `_id` | Identificador del edificio |
| `Code` | Código del edificio |
| `Name` | Nombre del edificio |
| `Description` | Descripción del edificio |
| `Address` | Dirección del edificio |
| `City` | Ciudad donde se encuentra |

### Uso en DT4FM

Este endpoint será utilizado para:

- Listar los edificios disponibles en el sistema.
- Permitir al usuario seleccionar el edificio donde ocurre el incidente.
- Asociar la ubicación del incidente dentro de la jerarquía del sistema.

---

## Creación de Incidente (Corrective Maintenance)

### Endpoint
`POST /cmdbuild/services/rest/v3/processes/CorrectiveMaint/instances?include_tasklist=true&onlyGridAttrs=true`

### Descripción
Crea un nuevo incidente de mantenimiento correctivo en OpenMAINT dentro del proceso **CorrectiveMaint**.

Este endpoint inicia el flujo de trabajo del incidente comenzando en la actividad **CM01 - Opening**.

---

### Headers

| Header | Valor |
|------|------|
| Content-Type | application/json |
| CMDBuild-Authorization | {sessionId} |

---

### Ejemplo de Request

```http
POST http://localhost:8090/cmdbuild/services/rest/v3/processes/CorrectiveMaint/instances?include_tasklist=true&onlyGridAttrs=true

{
  "_type": "CorrectiveMaint",
  "_activity": "CM01-Opening",
  "_advance": true,

  "OpeningDate": "2026-03-03T11:25:59-05:00",
  "ShortDescr": "Incidente de prueba",
  "ProcessNotes": "Ducha dañada",

  "Requester": 530488,
  "Type": 268288,
  "Priority": 118,
  "Site": 542345,
  "Category": 510370,
  "Subcategory": 510391,
  "ProcessStatus": 277461
}
```

### Campos principales

| Campo | Descripción |
|-------|-------------|
| `_type` | Tipo de proceso (CorrectiveMaint) |
| `_activity` | Actividad inicial del flujo |
| `_advance` | Avanza automáticamente al siguiente paso |
| `OpeningDate` | Fecha de apertura del incidente |
| `ShortDescr` | Título corto del incidente |
| `ProcessNotes` | Descripción detallada del problema |
| `Requester` | Usuario que reporta el incidente |
| `Priority` | Nivel de prioridad |
| `Site` | Edificio donde ocurre el incidente |
| `Category` | Categoría del incidente |
| `Subcategory` | Subcategoría del incidente |

### Response (ejemplo)

```json
{
  "success": true,
  "data": {
    "_id": 682015,
    "_type": "CorrectiveMaint",
    "Number": "CM.2026.0032",
    "Description": "CM.2026.0032 - Incidente de prueba",
    "ShortDescr": "Incidente de prueba",
    "Site": 542345,
    "_Site_description": "REP3 - Proy2",
    "_flowStatus": "WAITING_FOR_USER_TASK"
  }
}
```
### Prioridad / Criticidad del Incidente

La criticidad del incidente se define mediante el atributo:

`Priority`

Este atributo corresponde a un **Lookup de OpenMAINT** del tipo:

`COMMON - Priority`

El sistema no utiliza texto directamente, sino el **ID del lookup**.

---

### Niveles de prioridad

| ID | Código | Descripción |
|----|------|-------------|
| 36 | low | Baja |
| 118 | medium | Media |
| 118 | high | Alta |


### Uso en DT4FM

Este endpoint será utilizado por el módulo de reportes de incidentes para:

- crear un nuevo incidente desde la aplicación móvil
- registrar la ubicación (edificio)
- registrar descripción y prioridad
- iniciar el flujo de mantenimiento dentro de OpenMAINT

