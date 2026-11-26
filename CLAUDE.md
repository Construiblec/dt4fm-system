# DT4FM

Plataforma de gestión de instalaciones (gemelo digital) sobre OpenMaint/CMDBuild, con integraciones de Hostaway, IoT de accesos y Contifico.

## Estructura

- `backend/` — NestJS + TypeORM + PostgreSQL. Módulos de dominio en `src/modules/`, clientes externos en `src/integrations/` (`openmaint`, `hostaway`, `contifico`).
- `frontend/modulo-incidentes/` — React 19 + Vite + TanStack Query. Código en `src/` (`modules`, `services`, `store`, `shared`).
- `docs/` — documentación de arquitectura y de dominio.

## Comandos

Backend (`cd backend`):
- `npx tsc --noEmit` · `npm run lint` (aplica `--fix`; para solo revisar, `npx eslint "src/**/*.ts"`) · `npm test` (Jest, `*.spec.ts`) · `npm run test:e2e`
- Migraciones: `npm run migration:generate -- src/database/migrations/<Nombre>` y `npm run migration:run`

Frontend (`cd frontend/modulo-incidentes`):
- `npm run build` (incluye `tsc -b`) · `npm run lint` · `npm test` (Vitest) · `npm run dev`

Antes de dar una tarea por terminada, pasar typecheck, lint y tests de la parte tocada.

## Git

- Flujo: `feature/<nombre>` o `fix/<nombre>` → PR a `develop` → PR a `main`. No trabajar directo en `main` ni `develop`.
- Commits en español con prefijo convencional: `feat(limpiezas): …`, `fix: …`, `docs: …`.
- No hacer commit, push ni abrir PR sin que el usuario lo pida.
- El frontend despliega en Vercel desde `main`; el backend, en Render.

## Reglas del proyecto

- **Comentarios mínimos**: solo los necesarios, en una o dos líneas.
- **La UI no menciona OpenMaint** ni explica sus flujos internos.
- **Diseño primero en Penpot**: los cambios de UI se diseñan y aprueban en Penpot antes de programarlos. Si Penpot no conecta, avisar en lugar de improvisar.
- En Penpot, al actualizar un rol, no tocar tableros de otros roles ni diseños ajenos.
- Reutilizar clases y procesos de OpenMaint antes de crear entidades nuevas.
- Editar siempre la versión actual de un archivo; nunca regenerarlo desde cero y sobrescribir cambios del usuario.
- Las rutas de coordinación y escritura exigen sesión; no dejar endpoints nuevos sin guard.

## Cuidado

- **No arrancar el backend local contra staging ni producción**: el `.env` local puede tener credenciales viejas de `svc-dt4fm` y bloquear la cuenta de servicio (ya tumbó producción una vez).
- No escribir secretos en código, tests, docs ni en `.claude/settings*.json`.
- Las llamadas de escritura a CMDBuild, Hostaway o el servidor IoT afectan datos reales: confirmar antes.
