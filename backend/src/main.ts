import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { validationPipeOptions } from './config/validation.config';
import { corsOptions } from './config/cors.config';

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
