import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/test-app';

describe('HealthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    ({ app } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health responde ok con timestamp', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.body.status).toBe('ok');
    expect(typeof res.body.timestamp).toBe('string');
    expect(new Date(res.body.timestamp).toString()).not.toBe('Invalid Date');
    // null en este entorno de pruebas (sin RENDER_GIT_COMMIT/GIT_SHA); en
    // Render lo rellena la plataforma. Es lo que el smoke test del CI usa
    // para confirmar que ya está sirviendo el commit desplegado.
    expect('commit' in res.body).toBe(true);
  });

  it('toda respuesta lleva X-Request-Id, el id con que buscarla en los logs', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);

    expect(res.headers['x-request-id']).toMatch(/^[0-9a-f]{8}$/);
  });

  it('respeta el X-Request-Id que manda el cliente', async () => {
    const res = await request(app.getHttpServer())
      .get('/health')
      .set('X-Request-Id', 'prueba-e2e-1')
      .expect(200);

    expect(res.headers['x-request-id']).toBe('prueba-e2e-1');
  });

  it('una ruta inexistente sigue respondiendo el 404 de siempre', async () => {
    const res = await request(app.getHttpServer())
      .get('/no-existe')
      .expect(404);

    expect(res.body).toMatchObject({ statusCode: 404 });
    expect(res.headers['x-request-id']).toBeDefined();
  });
});
