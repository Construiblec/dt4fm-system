# ADR-002 — Selección de tecnología para el backend

## Estado

Aceptado

## Fecha

2026-03-10

---

# Contexto

El sistema contempla el desarrollo de una plataforma de servicios operativos que permitirá gestionar incidentes, operaciones de mantenimiento y otros procesos relacionados con la gestión de instalaciones y activos.

Inicialmente, el backend soportará el módulo de reporte de incidentes. Sin embargo, la arquitectura debe permitir escalar hacia nuevos módulos funcionales en el futuro, como por ejemplo:

- gestión de limpieza
- gestión de mantenimiento
- gestión de arrendatarios
- gestión de huéspedes
- notificaciones operativas
- integraciones con sistemas externos

El backend funcionará como una capa de servicios que expondrá APIs para diferentes aplicaciones cliente, incluyendo:

- aplicación web
- aplicaciones móviles
- panel administrativo
- sistemas externos

Además, el backend será responsable de gestionar la integración con la plataforma OpenMAINT, que actúa como sistema central de gestión de activos.

Por lo tanto, la tecnología seleccionada debe permitir:

- arquitectura modular
- escalabilidad
- fácil mantenimiento
- desarrollo rápido del MVP
- integración sencilla con APIs externas
- soporte para múltiples módulos funcionales

---

# Decisión

El backend será desarrollado utilizando el siguiente stack tecnológico:

- Node.js
- NestJS
- TypeScript

El backend actuará como una **API central de la plataforma**, encargada de:

- exponer APIs REST para las aplicaciones cliente
- centralizar la lógica de negocio
- gestionar autenticación y seguridad
- integrar con OpenMAINT
- permitir la incorporación de nuevos módulos en el futuro

La arquitectura inicial del backend seguirá un modelo de **monolito modular**, permitiendo evolucionar posteriormente hacia una arquitectura de microservicios si el sistema lo requiere.

---

# Justificación

## Node.js

Node.js fue seleccionado como runtime del backend debido a su amplio ecosistema, su buen rendimiento para aplicaciones basadas en APIs y su integración natural con herramientas modernas del ecosistema JavaScript y TypeScript.

Beneficios:

- gran ecosistema de librerías
- desarrollo rápido
- alta adopción en aplicaciones web modernas
- buena integración con tecnologías frontend
- soporte nativo para programación asíncrona

---

## NestJS

NestJS fue seleccionado como framework principal del backend.

NestJS está inspirado en frameworks empresariales como Spring Boot y proporciona una arquitectura estructurada para aplicaciones Node.js.

Beneficios:

- arquitectura modular
- sistema de inyección de dependencias
- organización clara de controladores, servicios y módulos
- soporte para microservicios
- integración nativa con TypeScript
- herramientas integradas para testing

Estas características lo hacen adecuado para sistemas que deben evolucionar hacia plataformas más complejas.

---

## TypeScript

TypeScript se utilizará como lenguaje principal para el desarrollo del backend.

Beneficios:

- tipado estático
- mayor seguridad en el código
- mejor soporte de herramientas de desarrollo
- refactorización más segura
- reducción de errores en tiempo de ejecución

El uso de TypeScript también facilita la consistencia tecnológica con el frontend.

---

# Alternativas consideradas

Durante la evaluación tecnológica se consideraron otras opciones.

## Node.js con Express

Express es un framework minimalista ampliamente utilizado.

Sin embargo, no proporciona una arquitectura estructurada por defecto, lo que puede generar problemas de mantenibilidad en proyectos grandes.

---

## Fastify

Fastify ofrece alto rendimiento y bajo overhead.

No obstante, carece de una arquitectura tan estructurada como NestJS para aplicaciones empresariales complejas.

---

## Go (Gin / Fiber)

Go es una excelente opción para sistemas de alto rendimiento.

Sin embargo, presenta algunas desventajas para este proyecto:

- menor ecosistema comparado con Node.js
- desarrollo inicial más lento
- menor integración con herramientas modernas del ecosistema TypeScript

Para este proyecto se priorizó velocidad de desarrollo y flexibilidad arquitectónica.

---

# Arquitectura backend propuesta

El backend se diseñará como un **monolito modular**, donde cada dominio funcional estará organizado en módulos independientes.

Ejemplo de estructura inicial:

src
 ├ auth
 ├ users
 ├ incidents
 ├ notifications
 └ integrations
      └ openmaint

Esta arquitectura permitirá agregar nuevos dominios funcionales en el futuro sin afectar el resto del sistema.

---

# Integración con la arquitectura del sistema

El backend funcionará como capa intermedia entre las aplicaciones cliente y OpenMAINT.

Arquitectura general:

Frontend (React + Vite)  
↓  
Backend API (NestJS)  
↓  
OpenMAINT

Esto permite:

- desacoplar el frontend del sistema central
- controlar la lógica de negocio
- gestionar la seguridad de la plataforma
- facilitar la integración con otros sistemas

---

# Consecuencias

## Positivas

- arquitectura escalable
- organización modular del sistema
- mayor mantenibilidad
- facilidad para agregar nuevos módulos
- desarrollo rápido del MVP
- ecosistema moderno y ampliamente soportado

## Negativas

- mayor estructura inicial comparado con frameworks minimalistas
- requiere definir correctamente los módulos desde el inicio

---

# Consideraciones futuras

La arquitectura seleccionada permitirá evolucionar el backend hacia:

- microservicios
- arquitectura basada en eventos
- integración con múltiples sistemas externos
- ampliación de módulos funcionales

Esto permitirá que el backend evolucione hacia una plataforma completa de gestión operativa sobre OpenMAINT.