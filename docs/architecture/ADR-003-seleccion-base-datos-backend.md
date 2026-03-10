# ADR-003 — Selección de base de datos para el backend

## Estado

Aceptado

## Fecha

2026-03-10

---

# Contexto

El sistema contempla el desarrollo de una plataforma de servicios que se integrará con OpenMAINT como sistema central de gestión de activos.

El backend del sistema será responsable de:

- exponer APIs para aplicaciones cliente
- gestionar lógica de negocio
- almacenar información operativa adicional
- integrarse con OpenMAINT
- soportar múltiples módulos funcionales futuros

Entre los módulos previstos se encuentran:

- reporte de incidentes
- gestión de limpieza
- gestión de mantenimiento
- gestión de arrendatarios
- gestión de huéspedes
- notificaciones operativas

Por lo tanto, la base de datos seleccionada debe cumplir con los siguientes requisitos:

- alta confiabilidad
- soporte para modelos relacionales complejos
- escalabilidad
- compatibilidad con OpenMAINT
- buen soporte en el ecosistema Node.js
- capacidad de integrar extensiones futuras (GIS, analítica, etc.)

---

# Decisión

Se selecciona **PostgreSQL** como base de datos principal para el backend de la plataforma.

PostgreSQL será utilizado para almacenar información propia del sistema, incluyendo:

- usuarios de la aplicación
- incidentes reportados
- evidencias y metadatos
- información de arrendatarios
- información de huéspedes
- configuraciones del sistema
- datos operativos adicionales

El backend se integrará con PostgreSQL utilizando un ORM (Object-Relational Mapping) compatible con TypeScript.

---

# Justificación

## Compatibilidad con OpenMAINT

OpenMAINT utiliza PostgreSQL como base de datos principal.

El uso de PostgreSQL en el backend permite:

- coherencia tecnológica en el ecosistema
- mayor facilidad para integración de datos
- simplificación de operaciones y mantenimiento

---

## Modelo relacional robusto

El sistema requiere gestionar relaciones complejas entre entidades.

Ejemplos de relaciones:

- incidente asociado a activo
- incidente asociado a ubicación
- arrendatario asociado a unidad
- huésped asociado a reserva

PostgreSQL proporciona un modelo relacional sólido que permite gestionar estas relaciones de forma eficiente.

---

## Escalabilidad

PostgreSQL es una base de datos ampliamente utilizada en sistemas empresariales de gran escala.

Ofrece:

- alta confiabilidad
- replicación
- particionamiento
- optimización avanzada de consultas

Esto permite soportar el crecimiento del sistema a largo plazo.

---

## Extensibilidad

PostgreSQL permite agregar extensiones avanzadas que pueden ser útiles en futuras etapas del proyecto.

Ejemplo relevante:

PostGIS

Esta extensión permite manejar datos geoespaciales, lo cual puede ser útil para:

- visualización de activos en mapas
- integración con sistemas GIS
- análisis geográfico de incidencias

---

## Ecosistema moderno

PostgreSQL cuenta con excelente soporte en el ecosistema Node.js y TypeScript.

Es compatible con herramientas modernas como:

- Prisma
- NestJS
- Docker
- plataformas de despliegue cloud

Esto facilita el desarrollo y mantenimiento del sistema.

---

# Alternativas consideradas

Durante la evaluación se consideraron otras opciones.

## MongoDB

MongoDB es una base de datos orientada a documentos.

Sin embargo, no se ajusta adecuadamente a sistemas con relaciones complejas entre entidades.

El modelo relacional requerido por el sistema es más adecuado para una base de datos relacional.

---

## MySQL

MySQL es una base de datos relacional madura y ampliamente utilizada.

No obstante, PostgreSQL ofrece mayor flexibilidad en:

- consultas avanzadas
- extensiones
- soporte para GIS

Por esta razón se priorizó PostgreSQL.

---

## Supabase

Supabase fue considerado como plataforma de base de datos gestionada.

Supabase utiliza PostgreSQL como motor de base de datos, pero incluye servicios adicionales como autenticación y almacenamiento.

Dado que el sistema contará con un backend propio encargado de gestionar la lógica de negocio y autenticación, se decidió utilizar PostgreSQL directamente para mantener una arquitectura más simple y controlada.

---

# Arquitectura de datos

El sistema utilizará dos fuentes principales de datos:

OpenMAINT Database  
Contendrá información de activos e infraestructura.

Backend Database (PostgreSQL)  
Contendrá información operativa de la plataforma.

Ejemplos de datos almacenados en el backend:

- usuarios de aplicación
- incidentes
- evidencias
- arrendatarios
- huéspedes
- notificaciones
- configuraciones del sistema

Las entidades del backend podrán almacenar referencias a entidades de OpenMAINT mediante identificadores.

---

# Consecuencias

## Positivas

- coherencia tecnológica con OpenMAINT
- modelo relacional robusto
- alta escalabilidad
- compatibilidad con herramientas modernas
- soporte para extensiones avanzadas

## Negativas

- requiere modelado relacional adecuado
- mayor estructura inicial comparado con bases NoSQL

---

# Consideraciones futuras

El uso de PostgreSQL permitirá evolucionar el sistema hacia:

- análisis de datos operativos
- integración con GIS
- optimización de consultas complejas
- ampliación del modelo de datos conforme crezcan los módulos de la plataforma