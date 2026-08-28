import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { mockSession } from './mocks/openmaint-core.mock';

const reservation = {
  hostawayReservationId: '4857692',
  guestName: 'Alice Smith',
  guestEmail: 'alice@example.com',
  listingName: 'Suite de Lujo',
  listingMapId: 293847,
  arrivalDate: '2026-08-27',
  departureDate: '2026-08-29',
  totalPrice: 150,
  currency: 'USD',
  nights: 2,
  channelName: 'direct',
  confirmationCode: 'ABC123',
};

describe('BillingController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  afterEach(() => resetMockCalls());

  it('200 con total:0 cuando no hay reservaciones ese día', async () => {
    mocks.hostaway.getReservationsByArrivalDate.mockResolvedValueOnce([]);

    const res = await request(app.getHttpServer())
      .post('/billing/run')
      .send({ date: '2026-08-27' })
      .expect(200);

    expect(res.body.total).toBe(0);
    expect(mocks.openmaintAuth.login).not.toHaveBeenCalled();
  });

  it('200 y factura la reservación cuando no estaba ya facturada', async () => {
    mocks.hostaway.getReservationsByArrivalDate.mockResolvedValueOnce([
      reservation,
    ]);
    mocks.openmaintAuth.login.mockResolvedValueOnce({ data: mockSession() });
    mocks.openmaintClient.get.mockResolvedValueOnce({ data: [] }); // no facturada aún
    mocks.openmaintClient.post.mockResolvedValueOnce({
      success: true,
      data: { _id: 1 },
    });

    const res = await request(app.getHttpServer())
      .post('/billing/run')
      .send({ date: '2026-08-27' })
      .expect(200);

    expect(res.body.invoiced).toBe(1);
    expect(res.body.skipped).toBe(0);
    expect(mocks.contifico.createDocumento).toHaveBeenCalled();
  });

  it('200 y omite (skipped) la reservación ya facturada, sin llamar a Contifico', async () => {
    mocks.hostaway.getReservationsByArrivalDate.mockResolvedValueOnce([
      reservation,
    ]);
    mocks.openmaintAuth.login.mockResolvedValueOnce({ data: mockSession() });
    mocks.openmaintClient.get.mockResolvedValueOnce({ data: [{ _id: 99 }] }); // ya facturada

    const res = await request(app.getHttpServer())
      .post('/billing/run')
      .send({ date: '2026-08-27' })
      .expect(200);

    expect(res.body.skipped).toBe(1);
    expect(res.body.invoiced).toBe(0);
    expect(mocks.contifico.createDocumento).not.toHaveBeenCalled();
  });

  it('200 con failed:1 y el error explicado cuando Contifico falla (openMAINT igual se guarda)', async () => {
    mocks.hostaway.getReservationsByArrivalDate.mockResolvedValueOnce([
      reservation,
    ]);
    mocks.openmaintAuth.login.mockResolvedValueOnce({ data: mockSession() });
    mocks.openmaintClient.get.mockResolvedValueOnce({ data: [] });
    mocks.contifico.createDocumento.mockRejectedValueOnce(
      new Error('Contifico no disponible'),
    );
    mocks.openmaintClient.post.mockResolvedValueOnce({
      success: true,
      data: { _id: 2 },
    });

    const res = await request(app.getHttpServer())
      .post('/billing/run')
      .send({ date: '2026-08-27' })
      .expect(200);

    expect(res.body.failed).toBe(1);
    expect(res.body.errors[0]).toMatch(/Contifico no disponible/);
    // La factura se guarda en openMAINT aunque Contifico haya fallado.
    expect(mocks.openmaintClient.post).toHaveBeenCalled();
  });
});
