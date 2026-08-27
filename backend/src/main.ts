import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header(
      'Access-Control-Allow-Methods',
      'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    );
    res.header(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] || '*',
    );

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,
    }),
  );

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
