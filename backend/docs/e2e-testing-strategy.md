# Estrategia de Pruebas End-to-End (E2E)

## 1. Objetivo general

Las pruebas E2E validan cada endpoint de la API en su conjunto: rutas, guards, `ValidationPipe`, y la lógica del service correspondiente, sin salir jamás a la red real. Hay una suite por módulo — 15 en total, uno por cada módulo de `src/modules/` — que corren juntas en unos 10 segundos.

Todo lo que habla con un sistema externo (openMAINT, correo, Contifico, Hostaway, web-push) va mockeado. La única excepción es la base de datos propia del backend (Neon en producción): las suites corren contra un **Postgres real**, porque es el único módulo con persistencia propia (`push-notifications`) y mockear TypeORM entero no prueba nada de esa capa.

## 2. Requisito: Postgres real

```bash
docker compose up -d      # backend/docker-compose.yml — Postgres local en :5555
npm run migration:run     # aplica el esquema
npm run test:e2e
```

En CI, el job `test` de [.github/workflows/backend-ci-cd.yml](../../.github/workflows/backend-ci-cd.yml) levanta un `services: postgres` efímero (vive solo durante el job) en vez de usar Docker Compose.

Sin `DATABASE_URL`, `AppModule` lanza al arrancar (`config/database.config.ts`) — es la razón por la que la suite original (una sola, sobre `incidents`) fallaba: montaba `AppModule` completo sin darle una base de datos.

**Si Postgres no está levantado, la corrida falla en ~3 s con instrucciones**, no con 137 errores opacos. Lo hace `test/global-setup.ts`, que abre una conexión de prueba antes de que arranque ninguna suite. Sin él, TypeORM reintenta ~32 s **por suite** y cada una acaba en un `AggregateError:` sin mensaje, más un `Cannot read properties of undefined (reading 'close')` del `afterAll` que parece un bug de las pruebas y no lo es. Ese segundo síntoma ya no aparece: los `afterAll` usan `app?.close()`.

`global-setup.ts` carga `dotenv/config` igual que `src/database/data-source.ts`, así que lee el `DATABASE_URL` del `.env` local sin que haya que exportarlo a mano.

## 3. Estructura

```
test/
  jest-e2e.json         setupFiles: setup-env.ts, testTimeout: 30000
  setup-env.ts           variables de entorno de toda la corrida
  helpers/
    test-app.ts           createTestApp() + resetMockCalls()
  fixtures/               constructores de tarjetas de openMAINT
    corrective.fixture.ts
    preventive.fixture.ts
    cleaning-task.fixture.ts
    employee.fixture.ts
  mocks/
    openmaint-client.trap.ts     alambre trampa (ver §5)
    openmaint-core.mock.ts       los 5 providers de OpenmaintModule
    gateways.mock.ts             gateway propio de cada módulo
    external.mock.ts             correo, Contifico, Hostaway, push
  *.e2e-spec.ts           una por módulo
```

## 4. `createTestApp()`

Cada suite arranca así:

```typescript
import { createTestApp, resetMockCalls, TestAppMocks } from './helpers/test-app';

describe('XController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
  });

  afterAll(() => app.close());
  afterEach(() => resetMockCalls());
  // ...
});
```

`createTestApp()` importa `AppModule` completo (no un módulo aislado: varios módulos comparten gateways y arrastran `PushNotificationsModule`) y sobreescribe 16 providers de red con mocks frescos — devueltos en `mocks`, tipado por `TestAppMocks` — más el `ValidationPipe` global, exactamente como lo registra `main.ts`. La única suite que no mockea `NotificationsService` es la propia de `notifications`, que llama a `createTestApp({ realNotificationsService: true })` para probar el servicio real cortando la red por debajo (`MailerService`).

## 5. El alambre trampa

`OpenmaintClient` (el cliente HTTP de más bajo nivel) se sustituye por un objeto cuyos métodos **lanzan** si se llaman:

```
[openmaint-client.trap] OpenmaintClient.post(...) se llamó sin mockear.
```

Cada gateway semántico (`OpenmaintService`, `CleaningTasksOpenmaintService`, etc.) va mockeado aparte, así que en el camino feliz el trap nunca debería dispararse. Si aparece en los logs, significa que alguna ruta de código se está escapando de los mocks — por ejemplo, `CleaningTasksSessionService.onModuleInit()` hace un login real en cada arranque de la app; verlo una vez por suite en los logs es esperado (el propio servicio lo captura y no rompe nada), pero si aparece en medio de la aserción de un test, hay un gateway sin mockear.

Dos módulos (`owners`, `billing`, `notifications`, `meeting-reminders`) inyectan `OpenmaintClient` **directo**, además de los gateways semánticos. Para esos, `mocks.openmaintClient.get/post/put` está expuesto para configurar la llamada puntual con `.mockResolvedValueOnce(...)`.

## 6. Higiene de mocks: `mockResolvedValueOnce`, no `clearAllMocks`

`afterEach(() => resetMockCalls())` limpia el historial de llamadas (`mock.calls`) entre tests, pero **no vacía la cola de `mockResolvedValueOnce`** — verificado empíricamente: `jest.clearAllMocks()` no toca las colas «once», solo `jest.resetAllMocks()` lo hace, y eso además borraría los defaults de cada factory.

Esto importa para las suites de máquina de estados (`cleaning-tasks`, `preventive-maintenance`, `maintenance-supervision`, `incidents`), donde un test típico encola 2-3 lecturas en orden:

```typescript
mocks.preventiveOpenmaint.findWithTasklist
  .mockResolvedValueOnce(preventiveResponse({ status: PM_STATUS_IDS.ACCEPTANCE }))
  .mockResolvedValueOnce(preventiveResponse({ status: PM_STATUS_IDS.EXECUTION }));
```

Regla al escribir un test así: encolar **exactamente** tantos valores como llamadas hace el código bajo prueba en ese test, ni uno más. Es seguro porque toda la cadena de llamadas al gateway ya se ejecutó y consumió la cola antes de que corra ningún `.expect()` de supertest — una aserción fallida nunca deja sobrantes a mitad de request.

**El error más común al escribir estos tests no es de lógica, es de conteo**: si un `ValidationPipe` del DTO corta la petición antes de que el controller llegue a llamar al service (por ejemplo, un body vacío contra un DTO con `@IsNotEmpty`), el gateway mockeado para ese test **nunca se llama**, y el valor que se encoló queda flotando para el siguiente test — desalineando su cola en cascada. Antes de encolar un valor, confirmar que el camino de ese test realmente llega al service.

## 7. Fixtures

Los estados de openMAINT (`CorrectiveMaint`, `PreventiveMaint`, `CleaningTask`) se construyen con funciones de `test/fixtures/`, nunca a mano: los IDs de estado son numéricos y viven en las constantes de cada módulo (`CM_STATUS_IDS`, `PM_STATUS_IDS`, `PHASE_IDS`), no en el código descriptivo (`_ProcessStatus_code`). Usar la fixture evita el error que rompió la suite original: un mock de incidente sin `ExecStartDate` que el service exige para poder cerrarlo.

## 8. Lo que estas suites NO arreglan a propósito

`cleaning-tasks` y `maintenance-supervision` prueban la autorización **tal como funciona hoy**: el rol sale de la cabecera `x-role`, que controla el cliente, no de la sesión de openMAINT. Cada suite tiene un `it.todo(...)` marcando ese hueco en vez de fijar el comportamiento actual como si fuera correcto — para que cuando entre la corrección (resolver el rol contra `/sessions/current`), ese `todo` se convierta en el test real.

## 9. Ejecución

```bash
npm run test:e2e
```

Es normal ver en los logs el error de `CleaningTasksSessionService` en cada suite (login de `onModuleInit` contra el trap) y algún `error`/`warn` de negocio esperado (p. ej. reintentos de IoT, avances que openMAINT acepta pero no aplica en los tests que prueban justamente ese 502). Ninguno de esos logs indica que un test haya fallado — el resumen final (`Test Suites`, `Tests`) es la única fuente de verdad.
