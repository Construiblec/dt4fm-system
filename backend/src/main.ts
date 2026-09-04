import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validationPipeOptions } from './config/validation.config';
import { resolveAllowedOrigins } from './config/cors.config';

/**
 * Tipado aparte (en vez de pasar el objeto literal directo a `enableCors`)
 * para que el callback de `origin` quede contextualmente tipado como
 * `(err: Error | null, origin?: StaticOrigin) => void` y no como `any`.
 */
const corsOptions: CorsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = resolveAllowedOrigins();

    // Sin Origin (curl, servidor a servidor, el webhook IoT de la
    // Raspberry) no hay navegador de por medio, así que CORS no aplica:
    // dejarlas pasar aquí no abre nada que ya no estuviera abierto. Solo el
    // navegador exige y hace cumplir esta cabecera.
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin no permitido por CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-role',
    'x-session-token',
    'x-employee-id',
    'x-cleaning-employee-id',
  ],
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
    .build();

  if (process.env.ENABLE_DOCS === 'true') {
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  await app.listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
}

bootstrap();
