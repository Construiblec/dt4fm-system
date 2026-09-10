import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validationPipeOptions } from './config/validation.config';
import { isOriginAllowed, resolveAllowedOrigins } from './config/cors.config';

/**
 * Tipado aparte (en vez de pasar el objeto literal directo a `enableCors`)
 * para que el callback de `origin` quede contextualmente tipado como
 * `(err: Error | null, origin?: StaticOrigin) => void` y no como `any`.
 */
const corsLogger = new Logger('CORS');

const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    // Sin Origin (curl, servidor a servidor, el webhook IoT de la
    // Raspberry) no hay navegador de por medio, así que CORS no aplica:
    // dejarlas pasar aquí no abre nada que ya no estuviera abierto. Solo el
    // navegador exige y hace cumplir esta cabecera.
    if (!origin || isOriginAllowed(origin)) {
      callback(null, true);
      return;
    }

    // `false`, no `new Error(...)`: el error hacía que el preflight
    // respondiera 500, que en el navegador se ve como "fallo del servidor" y
    // manda a depurar al lado equivocado. Con `false` la respuesta sale sin
    // `Access-Control-Allow-Origin` y el navegador dice exactamente lo que
    // pasa. El log deja el origen rechazado en Render, que es el dato que
    // hace falta para saber qué añadir a `CORS_ALLOWED_ORIGINS`.
    corsLogger.warn(
      `Origin rechazado: ${origin} — permitidos: ${resolveAllowedOrigins().join(', ')}`,
    );
    callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    // ExtJS lo añade solo en cada `Ext.Ajax.request` (`useDefaultXhrHeader`),
    // así que la página personalizada de openMAINT lo pide en el preflight.
    'X-Requested-With',
    'x-role',
    'x-session-token',
    'x-employee-id',
    'x-cleaning-employee-id',
    'x-guest-token',
    'x-guest-link-secret',
  ],
  // Sin esto cada preflight se repite: la auditoría midió 4 de 353-480 ms en
  // un solo login (H-3). 24 h es el techo que respeta Chrome.
  maxAge: 86400,
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.enableCors(corsOptions);

  app.useGlobalPipes(new ValidationPipe(validationPipeOptions));

  const config = new DocumentBuilder()
    .setTitle('DT4FM System API')
    .setDescription(
      'Documentación de la API de backend para el sistema de DT4FM (Integración con OpenMAINT, Hostaway, Gestión de Incidencias, Pagos y Limpieza).',
    )
    .setVersion('1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'authorization',
        in: 'header',
        description: 'Token de sesión de OpenMAINT',
      },
      'authorization',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-employee-id',
        in: 'header',
        description: 'ID de empleado para incidentes',
      },
      'x-employee-id',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-session-token',
        in: 'header',
        description: 'Token de sesión para tareas de limpieza',
      },
      'x-session-token',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-role',
        in: 'header',
        description: 'Rol del usuario (SuperUser / SupervisorLimpieza / etc.)',
      },
      'x-role',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-cleaning-employee-id',
        in: 'header',
        description: 'ID de empleado de limpieza',
      },
      'x-cleaning-employee-id',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-iot-secret',
        in: 'header',
        description: 'Secreto compartido del webhook de alarmas IoT',
      },
      'x-iot-secret',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-guest-token',
        in: 'header',
        description: 'Token del magiclink del huésped',
      },
      'x-guest-token',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-guest-link-secret',
        in: 'header',
        description: 'Secreto compartido para emitir magiclinks de huésped',
      },
      'x-guest-link-secret',
    )
    .build();

  if (process.env.ENABLE_DOCS === 'true') {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

bootstrap();
