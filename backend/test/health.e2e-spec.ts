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
});
