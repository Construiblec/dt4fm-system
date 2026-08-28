import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';

const validBody = {
  assetCode: 'CAL 01',
  event: 'GLP1_LOW_PRESSURE',
  timestamp: '2026-08-25T10:52:55-05:00',
  message: 'Presion baja en tanque GLP',
  device: 'GLP001',
};

describe('IotAlarmsController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  it('201: abre un correctivo cuando el activo resuelve', async () => {
    const res = await request(app.getHttpServer())
      .post('/iot/alarms')
      .set('x-iot-secret', 'test-iot-secret')
      .send(validBody)
      .expect(201);

    expect(res.body).toEqual({
      incidentId: 8192982,
      number: 'CM.2026.0150',
      assetResolved: true,
      assetId: 3209930,
    });
    expect(mocks.iotOpenmaint.createCorrective).toHaveBeenCalled();
  });

  it('201 con assetResolved:false cuando el código no existe, y el correctivo se crea igual', async () => {
    mocks.iotOpenmaint.findAssetByCode.mockResolvedValueOnce({
      outcome: 'missing',
    });

    const res = await request(app.getHttpServer())
      .post('/iot/alarms')
      .set('x-iot-secret', 'test-iot-secret')
      .send(validBody)
      .expect(201);

    expect(res.body.assetResolved).toBe(false);
    expect(res.body.assetId).toBeNull();
    expect(mocks.iotOpenmaint.createCorrective).toHaveBeenCalled();
  });

  it('401 con secreto de webhook incorrecto', async () => {
    await request(app.getHttpServer())
      .post('/iot/alarms')
      .set('x-iot-secret', 'secreto-incorrecto')
      .send(validBody)
      .expect(401);

    expect(mocks.iotOpenmaint.findAssetByCode).not.toHaveBeenCalled();
  });

  it('401 sin cabecera de secreto', async () => {
    await request(app.getHttpServer())
      .post('/iot/alarms')
      .send(validBody)
      .expect(401);
  });

  it('400 si falta un campo obligatorio (timestamp)', async () => {
    const withoutTimestamp: Partial<typeof validBody> = { ...validBody };
    delete withoutTimestamp.timestamp;

    await request(app.getHttpServer())
      .post('/iot/alarms')
      .set('x-iot-secret', 'test-iot-secret')
      .send(withoutTimestamp)
      .expect(400);
  });

  it('400 si timestamp no es ISO-8601', async () => {
    await request(app.getHttpServer())
      .post('/iot/alarms')
      .set('x-iot-secret', 'test-iot-secret')
      .send({ ...validBody, timestamp: 'ayer a las 10' })
      .expect(400);
  });

  it('502 cuando openMAINT sigue fallando tras agotar los reintentos', async () => {
    mocks.iotOpenmaint.createCorrective.mockRejectedValue({
      response: { status: 503 },
    });

    await request(app.getHttpServer())
      .post('/iot/alarms')
      .set('x-iot-secret', 'test-iot-secret')
      .send(validBody)
      .expect(502);
    // IOT_CREATE_MAX_ATTEMPTS=1 en setup-env.ts: un solo intento, sin backoff.
    expect(mocks.iotOpenmaint.createCorrective).toHaveBeenCalledTimes(1);
  });
});
