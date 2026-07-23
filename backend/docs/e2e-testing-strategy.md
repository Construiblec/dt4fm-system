# Estrategia de Pruebas End-to-End (E2E)

## 1. Objetivo General
El propósito de las pruebas End-to-End (E2E) en el backend es validar el correcto funcionamiento de los endpoints de la API en su conjunto. Estas pruebas aseguran que las rutas, controladores, validaciones (Pipes) y servicios internos interactúen correctamente. 

Para garantizar la fiabilidad de las pruebas y evitar efectos secundarios en plataformas de terceros, se ha adoptado una estrategia basada en la **simulación de dependencias externas (Mocking)**. Específicamente, se simulan las comunicaciones con OpenMAINT y los servicios de envío de notificaciones.

## 2. Estructura de Pruebas
Los archivos relacionados con las pruebas E2E se encuentran en el directorio `backend/test/`:

*   **`test/mocks/`**: Contiene los objetos simuladores que reemplazan a los servicios reales durante la ejecución de las pruebas.
*   **`test/*.e2e-spec.ts`**: Archivos que definen las pruebas para cada controlador o módulo (ej. `incidents.e2e-spec.ts`).

## 3. Simuladores (Mocks) Implementados

### 3.1. OpenMAINT Mock (`openmaint.service.mock.ts`)
Las pruebas automatizadas nunca deben realizar llamadas HTTP reales a la API de OpenMAINT. Hacerlo podría resultar en la creación de registros de prueba (basura) en la base de datos externa, dependencia de la disponibilidad de la red y tiempos de ejecución lentos.

Para solucionar esto, se utiliza un objeto que contiene funciones espía (`jest.fn()`) preconfiguradas para devolver respuestas simuladas exitosas. Esto permite al backend ejecutar toda su lógica local asumiendo que OpenMAINT respondió de manera correcta.

### 3.2. Notifications Mock (`notifications.service.mock.ts`)
Al igual que con OpenMAINT, el envío de correos electrónicos reales debe evitarse durante las pruebas E2E para no generar spam ni requerir credenciales SMTP válidas en entornos de Integración Continua. Este mock intercepta las llamadas a los métodos de notificación y simula un envío exitoso.

## 4. Patrón de Implementación en Pruebas

Para aplicar estos simuladores en una nueva suite de pruebas E2E, se debe sobrescribir el proveedor original al inicializar el módulo de pruebas de NestJS utilizando el método `overrideProvider`. 

**Ejemplo de configuración:**
```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from './../src/app.module';
import { OpenmaintService } from '../src/integrations/openmaint/openmaint.service';
import { mockOpenmaintService } from './mocks/openmaint.service.mock';

// ... dentro de beforeAll()
const moduleFixture: TestingModule = await Test.createTestingModule({
  imports: [AppModule],
})
  .overrideProvider(OpenmaintService)
  .useValue(mockOpenmaintService)
  .compile();
```

Una vez inyectados los simuladores, las peticiones virtuales (utilizando `supertest`) atravesarán todo el ciclo de vida de NestJS y se detendrán justo antes de salir al exterior, validando así el comportamiento del sistema.

## 5. Ejecución de las Pruebas

Para ejecutar la suite completa de pruebas E2E, se debe correr el siguiente comando desde el directorio `backend/`:

```bash
npm run test:e2e
```

**Nota:** Es normal observar logs de error en la consola relacionados con procesos de inicialización de módulos (como los servicios de sesión que intentan conectarse al inicio). Estos errores de conexión son esperados en un entorno de pruebas sin conexión a servicios externos y no invalidan los resultados de los tests sobre los endpoints.
