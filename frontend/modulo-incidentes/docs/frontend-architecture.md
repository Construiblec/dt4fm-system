# Frontend Architecture — Módulo de Incidentes

## 1. Introducción

Este documento describe los principios de arquitectura utilizados en el desarrollo del frontend del sistema **Módulo de Incidentes**.

El objetivo es establecer reglas claras sobre:

* organización del código
* responsabilidades de cada capa
* manejo de estado
* consumo de APIs
* escalabilidad del sistema

Esta arquitectura busca mantener un código:

* mantenible
* escalable
* desacoplado
* fácil de comprender para nuevos desarrolladores.

---

# 2. Principios de arquitectura

El frontend sigue los siguientes principios arquitectónicos.

## Arquitectura basada en módulos (Feature-Based Architecture)

El código se organiza por **dominios funcionales**, no por tipo de archivo.

Incorrecto:

```
components/
hooks/
services/
```

Correcto:

```
modules/
   incidentes/
   auth/
   usuarios/
```

Cada módulo contiene todo lo necesario para su funcionamiento.

Beneficios:

* mayor cohesión
* menor acoplamiento
* escalabilidad del proyecto

---

## Separación de responsabilidades

Cada capa tiene una responsabilidad clara.

| Capa       | Responsabilidad                              |
| ---------- | -------------------------------------------- |
| Pages      | Representan vistas completas del sistema     |
| Components | Elementos reutilizables dentro de una página |
| Services   | Comunicación con APIs                        |
| Hooks      | Encapsulan lógica reutilizable               |
| Schemas    | Validación de formularios                    |
| Types      | Definición de tipos TypeScript               |

---

## API First

El frontend **no interactúa directamente con OpenMAINT**.

La arquitectura del sistema sigue el siguiente flujo:

```
Frontend (React)
      ↓
Backend API (NestJS)
      ↓
OpenMAINT
```

El frontend solo consume endpoints del backend.

Ejemplo:

```
/api/incidentes
/api/activos
/api/auth
```

Esto permite:

* desacoplar la interfaz del sistema central
* aplicar reglas de negocio en el backend
* mejorar seguridad

---

# 3. Estructura del proyecto

La estructura del proyecto está organizada de la siguiente manera.

```
src

app
 ├─ router
 ├─ providers
 └─ layout

modules
 └─ incidentes
     ├─ pages
     ├─ components
     ├─ services
     ├─ hooks
     ├─ schemas
     └─ types

shared
 ├─ components
 ├─ services
 ├─ hooks
 ├─ utils
 └─ types

store
config
```

---

# 4. Carpeta app

Contiene la configuración global de la aplicación.

Subcarpetas:

```
router
providers
layout
```

Responsabilidades:

* definición de rutas
* inicialización de proveedores globales
* layout principal del sistema

---

# 5. Carpeta modules

Contiene los módulos funcionales del sistema.

Cada módulo representa una funcionalidad del dominio.

Ejemplo actual:

```
modules/incidentes
```

En el futuro se podrán agregar módulos como:

```
modules/activos
modules/usuarios
modules/mantenimiento
```

Cada módulo contiene:

```
pages
components
services
hooks
schemas
types
```

---

# 6. Carpeta shared

Contiene elementos reutilizables en toda la aplicación.

Ejemplos:

* componentes genéricos
* utilidades
* cliente HTTP
* hooks reutilizables

Ejemplo de contenido:

```
shared/components
shared/services
shared/hooks
shared/utils
shared/types
```

---

# 7. Manejo de estado

El proyecto utiliza dos tipos de estado.

## Server State

Datos provenientes del backend.

Herramienta utilizada:

```
TanStack Query
```

Ejemplos:

* lista de incidentes
* activos
* usuarios

---

## Global State

Estado global de la interfaz.

Herramienta utilizada:

```
Zustand
```

Ejemplos:

* autenticación
* usuario actual
* configuración de UI

---

# 8. Manejo de formularios

Los formularios se gestionan utilizando:

```
React Hook Form
```

La validación se realiza con:

```
Zod
```

Esto permite:

* validaciones consistentes
* mejor integración con TypeScript
* formularios más performantes

---

# 9. Cliente HTTP

El acceso a APIs se centraliza en un cliente HTTP basado en Axios.

Ubicación:

```
shared/services/api.ts
```

Responsabilidades:

* manejar la URL base del backend
* configurar interceptores
* centralizar manejo de errores

---

# 10. Buenas prácticas de desarrollo

Las siguientes reglas deben respetarse durante el desarrollo.

1. No mezclar lógica de negocio dentro de componentes.
2. Toda llamada a API debe estar dentro de `services`.
3. Los hooks deben encapsular lógica reutilizable.
4. Los componentes deben ser lo más simples posible.
5. Los módulos deben ser independientes entre sí.
6. Los elementos reutilizables deben ubicarse en `shared`.

---

# 11. Escalabilidad futura

La arquitectura está diseñada para permitir el crecimiento del sistema.

Se podrán agregar nuevos módulos sin afectar los existentes.

Ejemplo:

```
modules/incidentes
modules/activos
modules/mantenimiento
modules/usuarios
```

Esto permite mantener una arquitectura limpia incluso en aplicaciones grandes.

---

# 12. Flujo de datos

El flujo típico de datos dentro de la aplicación es el siguiente:

```
UI Component
      ↓
Custom Hook
      ↓
Service (API)
      ↓
Backend API
      ↓
OpenMAINT
```

Este flujo mantiene una clara separación entre:

* interfaz
* lógica
* comunicación con servicios externos.

---
