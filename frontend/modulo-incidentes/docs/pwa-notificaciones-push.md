# Notificaciones Push en la PWA – Frontend

**DT4FM – Digital Twin for Facility Management**

## 1. Introducción

Este documento describe el lado cliente de las **notificaciones push web**: la migración del service worker, el flujo de permiso y suscripción, y el manejo del clic en la notificación.

El contrato con el servidor y el catálogo de mensajes están en la [documentación del módulo backend](../../../backend/docs/push-notifications%20module/push-notifications-module.md).

Parte de la base ya instalada por el trabajo previo de PWA: manifiesto, service worker vía `vite-plugin-pwa` y el banner de instalación con soporte para iOS.

---

## 2. Migración del service worker a `injectManifest`

### Por qué

La configuración anterior usaba la estrategia implícita `generateSW`, en la que Workbox genera el service worker completo. Ese archivo generado **no incluye listeners de `push` ni de `notificationclick`**, y no hay forma de añadirlos sin escribir el service worker propio.

### Qué cambió

`vite.config.ts` pasa a:

```ts
strategies: 'injectManifest',
srcDir: 'src',
filename: 'sw.ts',
injectManifest: {
  globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
},
```

El bloque `workbox: { ... }` desaparece: con `injectManifest` esa configuración se ignora y el comportamiento pasa a vivir en `src/sw.ts`.

### Qué se conservó deliberadamente

El comportamiento de actualización anterior era conservador a propósito, para no recargar la página a un operario a mitad de un checklist y hacerle perder fotos sin subir. Ese comportamiento se mantiene:

* **No se llama a `skipWaiting()` al instalar.** El service worker nuevo espera. Solo se activa cuando el usuario acepta desde `UpdateAppToast`, momento en que `virtual:pwa-register` envía el mensaje `SKIP_WAITING` que `sw.ts` atiende.
* **No se llama a `clientsClaim()`.** El service worker nuevo no secuestra pestañas que ya cargaron el `index.html` viejo. Suscribirse a push no lo necesita.
* Se replican `cleanupOutdatedCaches()` y el `navigateFallback` a `/index.html` con la misma lista de exclusión (`/api/`, `/_vercel/`).

### Configuración de TypeScript

Un service worker necesita la librería `WebWorker`, incompatible con `DOM`. Por eso `src/sw.ts` se excluye de `tsconfig.app.json` y se compila con un `tsconfig.worker.json` propio, referenciado desde `tsconfig.json`.

---

## 3. `src/sw.ts`

Además del precacheo y el enrutado de navegación, define dos listeners.

### `push`

Lee el payload JSON y muestra la notificación. Usa el campo `tag` que envía el servidor —construido como `<tipo>-<id>` — para **agrupar por entidad**: un reaviso sobre la misma tarea sustituye al anterior en lugar de apilarse.

### `notificationclick`

Cierra la notificación y navega al `deepLink` que venía en `data`. Si la aplicación ya está abierta reutiliza esa ventana (`clients.matchAll` + `focus` + `navigate`) en lugar de abrir otra, que en móvil dejaría dos instancias de la PWA conviviendo. Si no hay ninguna, usa `clients.openWindow`.

---

## 4. Deep links y selección de pestaña

Los detalles tienen ruta propia y no presentan problema:

| Destino | Ruta |
|---|---|
| Detalle de correctivo (supervisor) | `/supervisor-mantenimiento/corrective/:id` |
| Detalle de preventivo (supervisor) | `/supervisor-mantenimiento/preventive/:id` |
| Detalle de preventivo (técnico) | `/preventive-maintenance/:id` |

El destinatario decide la ruta: el aviso de reanudación va al cesionario, así que enlaza a la vista del técnico y no a la del supervisor.

Los **listados no tenían URL**: son sub-pestañas en memoria (`useState`) dentro del dashboard, que siempre arrancaba en correctivos. Una notificación de limpieza habría aterrizado en la pestaña equivocada.

Se resolvió leyendo *query params* para inicializar ese estado, en `DashboardPage` y en `MaintenanceSupervisorDashboardPage`:

| Deep link | Efecto |
|---|---|
| `/dashboard?tab=maintenance&kind=corrective` | Mantenimiento → correctivos |
| `/dashboard?tab=maintenance&kind=preventive` | Mantenimiento → preventivos |
| `/dashboard?tab=cleaning` | Limpieza |

Solo inicializan el estado; la navegación posterior del usuario no queda atada a la URL.

### El destino sobrevive al login

La sesión de openMAINT se guarda cruda en `localStorage` y **no se renueva nunca**: cuando caduca, la primera llamada devuelve 401 y cada servicio manda al login. En el escenario típico de móvil —tocar la notificación por la mañana con la sesión de ayer ya vencida— eso hacía aterrizar en el login **perdiendo el destino**, y el usuario tenía que buscar la tarea a mano.

`src/shared/auth/returnTo.ts` guarda la ruta pretendida antes de redirigir y el login la restaura:

```ts
navigate(consumeReturnTo(response.username) ?? getHomeRoute(response.role));
```

Los nueve manejadores de 401 llaman ahora a `redirectToLogin()` en vez de a `window.location.assign("/login")`. Cuatro salvaguardas:

* **Solo se restaura si vuelve el mismo usuario.** En un celular compartido el siguiente que entre no debe aterrizar en la tarea del anterior. Si no había sesión previa —deep link en frío— se restaura para cualquiera.
* **Caduca a los 30 minutos.** Pasado ese plazo el destino ya no es lo que el usuario venía a hacer.
* **Se descartan rutas externas** (`//host`, absolutas) y las de autenticación, más todo `/owner`, que tiene su propio acceso.
* **`clearSession()` lo borra**: un cierre de sesión deliberado no deja destino pendiente.

Esto **no alarga la sesión**, solo abarata su caducidad: sigue costando un login, pero ya no un login más navegación manual. La sesión persistente de verdad —que el backend emita su propio token largo y acuñe la sesión de openMAINT bajo demanda— es trabajo aparte, y es una decisión de seguridad porque implica que el backend guarde algo capaz de re-autenticar al usuario.

---

## 5. Flujo de permiso: el pre-prompt

`useNotificationPrompt` replica la máquina de estados de `useInstallPrompt`, con la misma persistencia de descarte durante 14 días (clave `push-prompt-dismissed-at`).

**El permiso nativo se pide únicamente desde `enable()`, nunca al montar.** El navegador concede una sola oportunidad: si el usuario bloquea, no se puede volver a preguntar por código y tendría que ir a los ajustes del navegador. Por eso primero se muestra un banner propio y solo si acepta se invoca `Notification.requestPermission()`.

### Modos

| Modo | Cuándo |
|---|---|
| `hidden` | Sin soporte, sin sesión, sesión de invitado, permiso ya resuelto, o descartado hace menos de 14 días |
| `prompt` | Procede ofrecer la activación |
| `error` | El permiso se concedió pero el alta falló |

### iOS

Safari solo entrega push si la PWA está **añadida a la pantalla de inicio**; en el navegador normal no funciona. Por eso en iOS el banner permanece oculto mientras la aplicación no corra en modo standalone, y en `AppLayout` el banner de instalación tiene prioridad: pedir el permiso antes de instalar no serviría de nada.

### Re-registro silencioso

Con el permiso ya concedido, un efecto vuelve a registrar la suscripción al montar. Cubre dos casos: iniciar sesión en un dispositivo que ya lo tenía activado, y la rotación del endpoint por parte del navegador.

---

## 6. Ciclo de vida de la suscripción

`src/shared/pwa/pushSubscription.ts`.

### Alta

1. Comprueba soporte y sesión activa.
2. Obtiene el registro del service worker y **la clave VAPID del backend**.
3. Reutiliza la suscripción existente si la hay; si no, llama a `pushManager.subscribe`.
4. Envía endpoint y claves a `POST /push/subscribe`.

No envía `userId` ni rol: el servidor los deriva de la sesión de openMAINT.

### La clave VAPID viene del servidor

`GET /push/vapid-public-key` es la fuente de verdad, porque el servidor es quien firma los envíos. `VITE_VAPID_PUBLIC_KEY` existe solo como override opcional.

Depender de la variable de entorno inlineada en el build resultó frágil: un frontend compilado sin ella —o con una desalineada respecto al servidor— dejaba la activación rota sin ninguna señal.

### Baja

`useLogout` llama a `unsubscribeFromPush()` **antes** de limpiar la sesión, porque la baja necesita el sessionId para autenticarse.

Es imprescindible, no un detalle de limpieza: el endpoint pertenece al navegador, así que sin darlo de baja el siguiente usuario de ese mismo teléfono heredaría las notificaciones del anterior. El servidor completa la protección haciendo *upsert* sobre el endpoint.

---

## 7. Los fallos no son mudos

La primera versión devolvía `false` en silencio ante cinco condiciones distintas y el hook se tragaba las excepciones. El usuario aceptaba el permiso, el banner desaparecía y no llegaba nada, sin ninguna pista de por qué.

Ahora `subscribeToPush` lanza `PushSetupError` con un motivo legible, `describePushError` traduce cualquier fallo a un mensaje presentable, y el banner cambia a estado de error con ese texto y un botón de reintentar.

Motivos cubiertos:

| Situación | Mensaje |
|---|---|
| Navegador sin soporte | «Este navegador no admite notificaciones push» |
| Sin sesión iniciada | «No hay sesión iniciada…» |
| Sin service worker registrado | Indica usar `npm run dev:pwa` |
| El service worker no activa en 10 s | «…no terminó de activarse. Recarga la página» |
| El servidor no tiene claves VAPID | «El servidor no tiene configuradas las claves…» |
| 401 del backend | «La sesión caducó. Vuelve a iniciar sesión» |
| Otro fallo de red | «No se pudo contactar con el servidor…» |

El caso del service worker merece mención aparte: `navigator.serviceWorker.ready` **no resuelve nunca** si no hay worker activo, así que la activación se quedaba colgada indefinidamente. Ahora se comprueba primero que exista un registro y la espera tiene límite de 10 segundos.

---

## 8. Desarrollo local

El service worker **no se registra con `npm run dev`**: `devOptions.enabled` está condicionado al modo `pwa`. Para probar notificaciones hay que usar:

```bash
npm run dev:pwa
```

La Push API exige un contexto seguro. `localhost` cuenta como tal, pero **acceder por IP de red local sobre HTTP no**: ahí no hay service workers ni `PushManager`. Para probar desde un teléfono en la red local hace falta HTTPS o un túnel.

Variables:

```bash
VITE_API_URL=http://localhost:3000/api
# Opcional: si se omite, la clave se pide al backend.
VITE_VAPID_PUBLIC_KEY=
```

---

## 9. Archivos

```text
src
├ sw.ts                                  Service worker propio
├ config/env.ts                          + VITE_VAPID_PUBLIC_KEY (opcional)
├ shared
│ ├ auth
│ │ ├ returnTo.ts                        Destino pendiente tras un 401
│ │ └ session.ts                         (existente, + forgetReturnTo)
│ ├ pwa
│ │ ├ pushSubscription.ts                Alta, baja y errores
│ │ ├ platform.ts                        isRunningStandalone / isIos / isIosSafari
│ │ └ installPromptStore.ts              (existente)
│ ├ hooks
│ │ ├ useNotificationPrompt.ts           Pre-prompt de notificaciones
│ │ ├ useInstallPrompt.ts                (existente, ahora usa platform.ts)
│ │ └ useServiceWorkerUpdate.ts          (existente, sin cambios)
│ └ components
│   ├ EnableNotificationsBanner.tsx      Banner de activación y de error
│   └ InstallAppBanner.tsx               (existente)
├ app/layout/AppLayout.tsx               Monta y apila los banners
├ modules/auth/components/LoginForm.tsx  + restaura el destino pendiente
└ modules/auth/hooks/useLogout.ts        + baja de la suscripción

tsconfig.worker.json                     Compilación del service worker
```

`platform.ts` se extrajo de `useInstallPrompt` para que ambos pre-prompts compartan la detección de plataforma sin duplicarla.

---

## 10. Nota sobre el despliegue

`vercel.json` ya sirve `/sw.js` con `Cache-Control: max-age=0, must-revalidate`, que es lo que permite que una versión nueva del service worker se detecte sin esperar a que expire una caché. No requirió cambios.