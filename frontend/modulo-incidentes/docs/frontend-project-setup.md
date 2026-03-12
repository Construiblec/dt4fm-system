# Frontend Project Setup — Módulo de Incidentes

## 1. Introducción

Este documento describe el proceso de inicialización del frontend del sistema **Módulo de Incidentes**, incluyendo:

* tecnologías utilizadas
* configuración inicial del proyecto
* estructura de carpetas
* dependencias instaladas

El objetivo es proporcionar una guía clara para cualquier desarrollador que necesite comprender o replicar la configuración del proyecto.

---

# 2. Tecnologías utilizadas

El frontend del módulo de incidentes fue desarrollado utilizando el siguiente stack tecnológico.

| Tecnología      | Propósito                                                            |
| --------------- | -------------------------------------------------------------------- |
| React           | Librería para construir interfaces de usuario basadas en componentes |
| Vite            | Herramienta de desarrollo y build para aplicaciones frontend         |
| TypeScript      | Tipado estático para mejorar mantenibilidad del código               |
| Tailwind CSS    | Framework de estilos basado en utilidades                            |
| React Router    | Manejo de rutas dentro de la aplicación                              |
| Axios           | Cliente HTTP para consumo de APIs                                    |
| TanStack Query  | Manejo de estado de datos provenientes del backend                   |
| Zustand         | Gestión de estado global                                             |
| React Hook Form | Manejo eficiente de formularios                                      |
| Zod             | Validación de esquemas                                               |

---

# 3. Creación del proyecto

El proyecto fue creado utilizando **Vite** con React y TypeScript.

```bash
npm create vite@latest modulo-incidentes
```

Opciones seleccionadas:

```
Framework: React
Variant: TypeScript
```

Luego se instalaron las dependencias iniciales:

```bash
cd modulo-incidentes
npm install
```

---

# 4. Instalación de dependencias

Se instalaron las siguientes librerías necesarias para el desarrollo.

```bash
npm install react-router-dom axios zustand @tanstack/react-query react-hook-form zod @hookform/resolvers
```

---

# 5. Configuración de Tailwind CSS

Se instaló Tailwind CSS junto con PostCSS y Autoprefixer.

```bash
npm install -D tailwindcss@3 postcss autoprefixer
```

Luego se inicializó la configuración:

```bash
npx tailwindcss init -p
```

Esto genera los archivos:

```
tailwind.config.js
postcss.config.js
```

Configuración del archivo `tailwind.config.js`:

```javascript
export default {
 content: [
  "./index.html",
  "./src/**/*.{js,ts,jsx,tsx}",
 ],
 theme: {
  extend: {},
 },
 plugins: [],
}
```

En el archivo `src/index.css` se agregaron las directivas de Tailwind:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

---

# 6. Limpieza del template inicial

El template generado por Vite incluye archivos que no son necesarios para el proyecto.

Se eliminaron los siguientes archivos:

```
src/assets
src/App.css
src/App.tsx
```

También se removieron los íconos de React y Vite utilizados únicamente como ejemplo.

---

# 7. Arquitectura del proyecto

El proyecto sigue una **arquitectura basada en módulos (Feature-Based Architecture)**.

Este enfoque organiza el código por **dominios funcionales** en lugar de agruparlo por tipo de archivo.

Esto mejora:

* mantenibilidad
* escalabilidad
* claridad del código

---

# 8. Estructura de carpetas

La estructura base del proyecto es la siguiente:

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

main.tsx
index.css
```

---

# 9. Descripción de carpetas

## app

Contiene la configuración global de la aplicación.

Subcarpetas:

```
router
providers
layout
```

Responsabilidades:

* configuración de rutas
* proveedores globales
* layout principal

---

## modules

Contiene los módulos funcionales del sistema.

Cada módulo representa un **dominio del negocio**.

Ejemplo actual:

```
modules/incidentes
```

Este módulo contendrá:

* páginas del sistema
* componentes específicos
* lógica de consumo de APIs
* validaciones
* tipos

---

## shared

Contiene elementos reutilizables por toda la aplicación.

Ejemplos:

* componentes genéricos
* utilidades
* cliente HTTP
* hooks compartidos

---

## store

Contendrá los estados globales gestionados con **Zustand**.

Ejemplo futuro:

```
authStore
uiStore
```

---

## config

Contendrá configuraciones globales del sistema.

Ejemplo:

```
variables de entorno
configuración del cliente HTTP
```

---

# 10. Archivo principal de la aplicación

El punto de entrada de la aplicación es:

```
src/main.tsx
```

Este archivo inicializa React y montará los proveedores globales y el router.

---

# 11. Ejecución del proyecto

Para iniciar el servidor de desarrollo:

```bash
npm run dev
```

El proyecto estará disponible en:

```
http://localhost:5173
```

---


