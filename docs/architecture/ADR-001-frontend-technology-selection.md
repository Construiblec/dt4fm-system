# ADR-001 — Selección de tecnología para el frontend

## Estado

Aceptado

## Fecha

2026-03-10

---

# Contexto

El proyecto contempla el desarrollo de una aplicación web para el reporte y gestión de incidentes asociados a activos e instalaciones administrados dentro de la plataforma OpenMAINT.

La aplicación será utilizada principalmente por personal operativo que reportará incidentes desde dispositivos móviles mientras se encuentra en campo. Por lo tanto, la solución debe cumplir con los siguientes requisitos:

- Experiencia de usuario optimizada para dispositivos móviles
- Desarrollo rápido del MVP
- Arquitectura modular y mantenible
- Reutilización de componentes de interfaz
- Integración sencilla con APIs REST  (Openmaint)
- Infraestructura de despliegue simple
- Compatibilidad con herramientas modernas de desarrollo frontend


El frontend interactuará exclusivamente con el backend del sistema mediante APIs REST. El backend será responsable de gestionar la integración con OpenMAINT.

---

# Decisión

El frontend será desarrollado utilizando el siguiente stack tecnológico:

- React
- Vite
- TypeScript
- Tailwind CSS
- Shadcn UI
- TanStack Query
- Zustand
- React Hook Form
- Zod

El despliegue del frontend se realizará utilizando la plataforma **Vercel**.

La aplicación seguirá un enfoque de diseño **mobile-first**, priorizando la experiencia de usuario en dispositivos móviles.

---

# Justificación

## React

React fue seleccionado como la librería principal para la construcción de la interfaz de usuario debido a su arquitectura basada en componentes reutilizables.

Beneficios:

- desarrollo basado en componentes
- reutilización de código
- arquitectura modular
- amplio ecosistema y comunidad
- facilidad de mantenimiento a largo plazo

React también permite una futura evolución hacia aplicaciones móviles mediante tecnologías como React Native.

---

## Vite

Vite fue seleccionado como herramienta de desarrollo y compilación del frontend.

Beneficios:

- servidor de desarrollo extremadamente rápido
- recarga instantánea de módulos (Hot Module Reload)
- compilación optimizada para producción
- configuración simple
- mejora significativa en la experiencia del desarrollador

Comparado con herramientas más antiguas como Webpack o Create React App, Vite reduce significativamente los tiempos de desarrollo.

---

## TypeScript

TypeScript se utilizará para añadir tipado estático al código.

Beneficios:

- mayor calidad del código
- mejor soporte de herramientas de desarrollo (IDE)
- refactorización más segura
- reducción de errores en tiempo de ejecución

---

## Tailwind CSS

Tailwind CSS será utilizado como sistema de estilos.

Beneficios:

- desarrollo rápido de interfaces
- consistencia visual
- facilidad para implementar diseño responsive (mobile-first)
- reducción de CSS personalizado

---

## Shadcn UI

Shadcn UI se utilizará como biblioteca de componentes reutilizables basada en Tailwind CSS.

Beneficios:

- componentes accesibles
- diseño moderno
- alto nivel de personalización
- aceleración del desarrollo de interfaces

---

## TanStack Query

TanStack Query se utilizará para gestionar el estado de datos provenientes del backend.

Beneficios:

- manejo automático de caché
- sincronización eficiente de datos
- simplificación del consumo de APIs
- mejor rendimiento de la aplicación

---

## Zustand

Zustand se utilizará para la gestión de estado global de la aplicación.

Beneficios:

- API simple
- bajo nivel de complejidad
- menor sobrecarga comparado con Redux

Casos de uso típicos:

- estado de autenticación
- información del usuario
- configuración global de la aplicación

---

## React Hook Form + Zod

React Hook Form será utilizado para gestionar formularios, mientras que Zod permitirá definir validaciones basadas en esquemas.

Beneficios:

- formularios de alto rendimiento
- validación estructurada
- integración con TypeScript

Estas herramientas son particularmente útiles para el formulario de reporte de incidentes.

---

# Estrategia Mobile-First

Debido a que el sistema será utilizado principalmente por personal operativo en campo, la aplicación seguirá una estrategia de diseño **mobile-first**.

Principios principales:

- diseño optimizado para pantallas pequeñas
- formularios simplificados
- componentes táctiles
- uso de tarjetas en lugar de tablas complejas
- navegación adaptada a dispositivos móviles

Este enfoque garantiza una experiencia de usuario adecuada en smartphones y tablets.

---

# Integración con la arquitectura del sistema

El frontend no interactuará directamente con OpenMAINT.

La arquitectura del sistema seguirá el siguiente esquema:

Frontend (React + Vite)  
↓  
Backend API (NestJS)  
↓  
OpenMAINT

Esta separación permite mantener un bajo acoplamiento entre la interfaz de usuario y el sistema central de gestión de activos.

---

# Consecuencias

## Positivas

- desarrollo rápido del MVP
- arquitectura modular y escalable
- reutilización de componentes
- mejor experiencia de desarrollo
- despliegue simplificado mediante Vercel
- experiencia optimizada para dispositivos móviles

## Negativas

- requiere backend independiente para la lógica del negocio
- es necesario definir una arquitectura clara de componentes desde el inicio

---

# Consideraciones futuras

La arquitectura seleccionada permite evolucionar hacia:

- Progressive Web App (PWA)
- aplicación móvil basada en React Native
- nuevos módulos funcionales dentro de la plataforma