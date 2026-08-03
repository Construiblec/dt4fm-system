# CI/CD del Frontend — Módulo de Incidentes

## 1. Introducción

Este documento describe el pipeline de integración continua configurado para el frontend del sistema **Módulo de Incidentes**, incluyendo:

* qué problema resuelve el pipeline
* cómo se reparte la responsabilidad entre GitHub Actions y Vercel
* el detalle de cada job del workflow
* la configuración necesaria en Vercel para que todo funcione
* las reglas de protección de ramas recomendadas
* limitaciones conocidas y próximos pasos

El objetivo es que cualquier desarrollador del equipo entienda qué ocurre automáticamente al abrir un PR o hacer merge, sin necesidad de leer el archivo YAML directamente.

---

# 2. Modelo de branching

El proyecto sigue un modelo trunk-based con dos ramas de larga vida:

| Rama | Propósito |
| --- | --- |
| `main` | Rama de producción. Vercel despliega automáticamente desde aquí. |
| `develop` | Rama de integración. Unifica los cambios de las features antes de pasar a `main`. |
| `feature/xxx` | Ramas cortas de trabajo. Salen de `develop` y se integran vía Pull Request con revisión. |

Flujo esperado:

```
feature/xxx --PR--> develop --PR--> main
```

El pipeline de CI corre en los push y PRs contra `main` y `develop`. El deploy a producción solo ocurre cuando algo llega a `main`.

---

# 3. División de responsabilidades: GitHub Actions vs. Vercel

Este es el punto más importante para entender el pipeline: **GitHub Actions y Vercel no hacen lo mismo, y eso es intencional.**

| | GitHub Actions | Vercel |
| --- | --- | --- |
| Qué hace | Gate de calidad: lint, typecheck y build de verificación | Build real + deploy (producción y previews) |
| Cuándo corre | En cada push/PR a `main` o `develop` | En cada push a cualquier rama conectada, y en cada PR |
| Resultado visible | Check ✅/❌ en el Pull Request | URL de deploy (producción o preview) |
| Puede bloquear un deploy | No directamente | — |

Se evaluó tener a GitHub Actions también desplegando (usando el CLI de Vercel), pero se descartó por agregar complejidad y secrets adicionales sin un beneficio claro para el tamaño actual del equipo. Vercel en su plan gratuito ya cubre build y deploy de forma nativa y confiable. GitHub Actions se usa exclusivamente como **check de calidad visible en el PR**, apoyado en branch protection para que un PR no pueda mergearse si el build falla.

Esto implica una limitación conocida: si el lint falla pero el build compila, el merge no se bloquea automáticamente por lint (ver [sección 8](#8-limitaciones-conocidas)). El control real de qué llega a producción lo da la revisión humana del PR más el check de build.

---

# 4. Ubicación del workflow

```
.github/workflows/frontend-ci-cd.yml
```

Vive en la raíz del repositorio porque GitHub Actions solo lee workflows desde `.github/workflows/`, sin importar que el proyecto sea un monorepo con `frontend/` y `backend/`.

---

# 5. Disparadores (triggers)

El workflow se ejecuta en estos casos:

* **Push** a `main` o `develop`
* **Pull Request** hacia `main` o `develop`
* **Manualmente**, desde la pestaña *Actions* de GitHub (`workflow_dispatch`)

En todos los casos, con una condición adicional: solo corre si el cambio toca archivos dentro de `frontend/modulo-incidentes/**` o el propio archivo del workflow. Un cambio exclusivo en `backend/` no dispara el pipeline del frontend.

```yaml
on:
  push:
    branches: [main, develop]
    paths:
      - 'frontend/modulo-incidentes/**'
      - '.github/workflows/frontend-ci-cd.yml'
  pull_request:
    branches: [main, develop]
    paths:
      - 'frontend/modulo-incidentes/**'
      - '.github/workflows/frontend-ci-cd.yml'
  workflow_dispatch:
```

## Control de concurrencia

Si se hacen dos push seguidos a la misma rama antes de que termine la primera ejecución, la ejecución anterior se cancela automáticamente. Esto evita gastar minutos de Actions en resultados que ya quedaron obsoletos.

```yaml
concurrency:
  group: frontend-${{ github.ref }}
  cancel-in-progress: true
```

---

# 6. Jobs del workflow

El pipeline tiene dos jobs, que corren en paralelo (no dependen uno del otro).

## 6.1. Job `lint`

Verifica el estilo y las reglas estáticas del código.

Pasos:

1. Descarga el código del repositorio (`checkout`)
2. Instala Node.js 22
3. Instala dependencias con `npm ci` (instalación reproducible a partir de `package-lock.json`)
4. Ejecuta `npm run lint`

```yaml
- name: ESLint
  continue-on-error: true
  run: npm run lint
```

> **Nota:** este paso tiene `continue-on-error: true` porque, al momento de crear el pipeline, existen 3 errores preexistentes de la regla `react-hooks/preserve-manual-memoization` en el código. Sin esta bandera, el check de lint quedaría en rojo permanentemente. Ver [sección 8](#8-limitaciones-conocidas).

## 6.2. Job `build`

Verifica que el proyecto compile sin errores de tipos y que el build de producción se genere correctamente.

Pasos:

1. Descarga el código del repositorio
2. Instala Node.js 22
3. Instala dependencias con `npm ci`
4. Ejecuta `npm run build`, que internamente corre `tsc -b && vite build` (validación de TypeScript + empaquetado con Vite)
5. Sube el resultado (`dist/`) como artefacto descargable durante 7 días

```yaml
- name: Build
  run: npm run build
  env:
    VITE_API_URL: ${{ vars.VITE_API_URL || 'http://localhost:3000/api' }}
```

El artefacto subido (`frontend-dist`) es solo para inspección manual si algo falla — **no se usa para desplegar**. El deploy real lo genera Vercel de forma independiente, con su propia compilación.

La variable `VITE_API_URL` usada aquí solo sirve para que este build de verificación no falle por falta de la variable; no tiene ningún efecto sobre lo que termina en producción.

---

# 7. Configuración necesaria en Vercel

Como Vercel maneja el build y el deploy real, esta configuración es la que determina lo que ven los usuarios finales.

## 7.1. Root Directory

`Project Settings → General → Root Directory` debe ser:

```
frontend/modulo-incidentes
```

Sin esto, Vercel intenta compilar desde la raíz del monorepo y el build falla al no encontrar el `package.json` correcto.

## 7.2. Variables de entorno

`Project Settings → Environment Variables`. La variable que consume el frontend es `VITE_API_URL`. Vercel permite asignar un valor distinto según el entorno:

| Entorno | Cuándo se usa | Valor recomendado |
| --- | --- | --- |
| **Production** | Deploy generado desde `main` | URL del backend de producción |
| **Preview** | Deploy generado por cualquier PR o rama distinta a `main` | URL del backend real, o de un backend de staging si existe |
| **Development** | Solo si se usa `vercel dev` localmente | Normalmente no se usa; el `.env` local ya cubre este caso |

Las variables de entorno **no se aplican de forma retroactiva**: si se cambia un valor, un deploy o preview ya existente no se actualiza solo. Hay que volver a desplegar (nuevo commit, o `Redeploy` manual desde el dashboard).

## 7.3. Rewrites para el enrutamiento SPA

El archivo [`vercel.json`](../vercel.json) ya contiene la regla necesaria para que las rutas de React Router funcionen al recargar la página o acceder directo a una URL interna:

```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

## 7.4. Integración con Git (deploy automático)

Vercel despliega automáticamente mediante su integración nativa con GitHub:

* **Push a `main`** → build y deploy a **producción**
* **Cualquier Pull Request** (hacia `develop` o `main`) → **preview deploy** con una URL única, comentada automáticamente en el PR

No requiere ninguna acción adicional: esta integración ya está activa por defecto al conectar el repositorio con el proyecto de Vercel.

---

# 8. Limitaciones conocidas

* **El lint no bloquea el pipeline todavía.** El job `lint` tiene `continue-on-error: true` por los 3 errores existentes de `react-hooks/preserve-manual-memoization`. Cuando se corrijan, se debe quitar esa línea del workflow para que el lint pase a ser un check bloqueante real.
* **No hay tests automatizados.** El `package.json` del proyecto no define un script `test`. Cuando se incorpore una suite (por ejemplo con Vitest), corresponde agregar un tercer job `test` al workflow.
* **El build del job `build` es un build de verificación, no el que se despliega.** Vercel genera su propio build de forma independiente al desplegar. Esto es intencional (evita duplicar configuración de Vercel dentro de GitHub Actions) pero implica que, en teoría, ambos builds podrían comportarse distinto si las variables de entorno configuradas en cada lado no coinciden.

---

# 9. Reglas de protección de ramas recomendadas

Para que el pipeline funcione como un gate de calidad real (y no solo informativo), se recomienda configurar en GitHub, `Settings → Branches`:

**Para `main`:**
* Require a pull request before merging, con al menos 1 aprobación
* Require status checks to pass before merging → marcar el check **`Typecheck & Build`**
* Require branches to be up to date before merging

**Para `develop`:** las mismas reglas, pudiendo relajar el número de aprobaciones requeridas según el tamaño del equipo.

> Los status checks solo aparecen disponibles para seleccionar en GitHub después de que el workflow haya corrido al menos una vez sobre esa rama.

---

# 10. Resumen del flujo end-to-end

```
1. Se crea feature/xxx desde develop
2. Se abre PR: feature/xxx -> develop
     -> GitHub Actions corre lint + build (check en el PR)
     -> Vercel genera un preview deploy con URL propia
3. Se aprueba y mergea el PR
4. Se abre PR: develop -> main
     -> GitHub Actions corre lint + build (check en el PR)
     -> Vercel genera un preview deploy con URL propia
5. Se aprueba y mergea el PR a main
     -> Vercel despliega automáticamente a producción
```
