import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { mockSession, MOCK_SESSION_ID } from './mocks/openmaint-core.mock';
import {
  BAT_BUILDING_ID,
  DEFAULT_ACCESS_BUILDINGS,
  ING_BUILDING_ID,
} from './mocks/gateways.mock';
import { BuildingCatalogService } from '../src/modules/access-control/building-catalog.service';
import { CredentialService } from '../src/modules/access-control/credential.service';
import { GuestStayService } from '../src/modules/access-control/guest-stay.service';
import { ReservationSweepService } from '../src/modules/access-control/reservation-sweep.service';
import { GuestStay } from '../src/modules/access-control/entities/guest-stay.entity';

const SESSION = { 'x-session-token': MOCK_SESSION_ID };

const nuevaCredencial = (overrides: Record<string, unknown> = {}) => ({
  subjectType: 'tenant',
  subjectRef: '4471',
  displayName: 'Ana Pérez',
  scope: 'pedestrian',
  buildingId: ING_BUILDING_ID,
  validFrom: '2026-09-14T12:00:00-05:00',
  validTo: '2026-09-18T15:00:00-05:00',
  ...overrides,
});

/**
 * Persistencia real contra Postgres, VPS de accesos doblada. Lo que se prueba
 * aquí es el ciclo de vida y, sobre todo, que el PIN no se escape por ninguna
 * respuesta.
 */
describe('AccessControlController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;
  let dataSource: DataSource;
  let credentialService: CredentialService;
  let guestStayService: GuestStayService;
  let catalog: BuildingCatalogService;
  let sweep: ReservationSweepService;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
    dataSource = app.get(DataSource);
    credentialService = app.get(CredentialService);
    guestStayService = app.get(GuestStayService);
    catalog = app.get(BuildingCatalogService);
    sweep = app.get(ReservationSweepService);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE TABLE "access_credential", "guest_stay" CASCADE',
    );
    // El rol por defecto del mock es MaintOffice, que no administra accesos.
    mocks.openmaint.getSession.mockResolvedValue(
      mockSession({ role: 'SuperUser', username: 'admin.mock' }),
    );
    mocks.unitResolver.byListingId.mockResolvedValue({
      unitId: 1187,
      buildingId: ING_BUILDING_ID,
    });
    // `clearAllMocks` no borra implementaciones, así que un test que cambie el
    // catálogo lo dejaría cambiado para los siguientes. Y el catálogo se cachea
    // 10 minutos, así que además hay que invalidarlo.
    mocks.accessIot.listBuildings.mockResolvedValue(DEFAULT_ACCESS_BUILDINGS);
    catalog.invalidate();
  });

  afterEach(() => resetMockCalls());

  describe('autenticación y rol', () => {
    it('401 sin cabecera de sesión', async () => {
      await request(app.getHttpServer()).get('/access/credentials').expect(401);
    });

    it('403 con una sesión que no es de administración', async () => {
      mocks.openmaint.getSession.mockResolvedValue(
        mockSession({ role: 'MaintOffice' }),
      );

      await request(app.getHttpServer())
        .get('/access/credentials')
        .set(SESSION)
        .expect(403);
    });
  });

  describe('POST /access/credentials', () => {
    it('201 y deja la credencial activa cuando se escribe en todas las puertas', async () => {
      const res = await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(nuevaCredencial())
        .expect(201);

      expect(res.body.status).toBe('active');
      expect(res.body.syncState).toBe('synced');
      expect(res.body.issuedBy).toBe('manual:admin.mock');
      expect(res.body.pinConfigured).toBe(true);
    });

    it('deja la credencial en pending si solo se escribió en algunas puertas', async () => {
      mocks.accessIot.putCredential.mockResolvedValueOnce({
        credentialId: 'ignorado',
        state: 'partial',
        devices: [
          { deviceId: 'ING-PEATONAL-1', state: 'written' },
          { deviceId: 'ING-VEHICULAR-1', state: 'unreachable' },
        ],
      });

      const res = await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(nuevaCredencial({ scope: 'both' }))
        .expect(201);

      // `pending` no es «no funciona»: es «aún no está en todas las puertas».
      expect(res.body.status).toBe('pending');
      expect(res.body.syncState).toBe('pending');
      expect(res.body.syncDetail).toHaveLength(2);
    });

    it('deja la credencial en pending si el edificio está incomunicado', async () => {
      mocks.accessIot.putCredential.mockResolvedValueOnce({
        credentialId: 'ignorado',
        state: 'unreachable',
        devices: [{ deviceId: 'ING-PEATONAL-1', state: 'unreachable' }],
      });

      const res = await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(nuevaCredencial())
        .expect(201);

      expect(res.body.status).toBe('pending');
      expect(res.body.syncState).toBe('pending');
    });

    it('regenera el PIN y reintenta ante pin_conflict', async () => {
      mocks.accessIot.putCredential
        .mockResolvedValueOnce({
          credentialId: 'ignorado',
          state: 'failed',
          devices: [],
          errorCode: 'pin_conflict',
        })
        .mockResolvedValueOnce({
          credentialId: 'ignorado',
          state: 'written',
          devices: [{ deviceId: 'ING-PEATONAL-1', state: 'written' }],
        });

      const res = await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(nuevaCredencial())
        .expect(201);

      expect(mocks.accessIot.putCredential).toHaveBeenCalledTimes(2);
      expect(res.body.status).toBe('active');

      // El segundo intento no puede llevar el mismo PIN que el primero.
      const [, primera] = mocks.accessIot.putCredential.mock.calls[0];
      const [, segunda] = mocks.accessIot.putCredential.mock.calls[1];
      expect(segunda.pin).not.toBe(primera.pin);
    });

    it('400 en un edificio sin control de accesos instalado', async () => {
      const res = await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(nuevaCredencial({ buildingId: BAT_BUILDING_ID }))
        .expect(400);

      expect(res.body.message).toContain('no tiene control de accesos');
      expect(mocks.accessIot.putCredential).not.toHaveBeenCalled();
    });

    it('400 si la vigencia termina antes de empezar', async () => {
      await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(
          nuevaCredencial({
            validFrom: '2026-09-18T15:00:00-05:00',
            validTo: '2026-09-14T12:00:00-05:00',
          }),
        )
        .expect(400);
    });

    it('400 si el ámbito no es uno de los tres admitidos', async () => {
      await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(nuevaCredencial({ scope: 'lavanderia' }))
        .expect(400);
    });

    it('no emite dos veces para el mismo sujeto y ámbito', async () => {
      const primera = await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(nuevaCredencial())
        .expect(201);

      const segunda = await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(nuevaCredencial())
        .expect(201);

      expect(segunda.body.id).toBe(primera.body.id);
      expect(mocks.accessIot.putCredential).toHaveBeenCalledTimes(1);
    });
  });

  describe('POST /access/credentials/:id/revoke', () => {
    it('200 y borra la credencial del dispositivo', async () => {
      const creada = await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(nuevaCredencial())
        .expect(201);

      const res = await request(app.getHttpServer())
        .post(`/access/credentials/${creada.body.id}/revoke`)
        .set(SESSION)
        .send({ reason: 'manual' })
        .expect(200);

      expect(res.body.status).toBe('revoked');
      expect(res.body.revokedReason).toBe('manual');
      expect(mocks.accessIot.deleteCredential).toHaveBeenCalledWith(
        creada.body.id,
      );
    });

    it('400 con un motivo fuera del catálogo', async () => {
      const creada = await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(nuevaCredencial())
        .expect(201);

      await request(app.getHttpServer())
        .post(`/access/credentials/${creada.body.id}/revoke`)
        .set(SESSION)
        .send({ reason: 'porque si' })
        .expect(400);
    });

    it('404 si la credencial no existe', async () => {
      await request(app.getHttpServer())
        .post('/access/credentials/8f1e2a5c-0000-4000-8000-000000000000/revoke')
        .set(SESSION)
        .send({ reason: 'manual' })
        .expect(404);
    });
  });

  describe('POST /access/credentials/:id/scope', () => {
    const crear = async () =>
      (
        await request(app.getHttpServer())
          .post('/access/credentials')
          .set(SESSION)
          .send(nuevaCredencial())
          .expect(201)
      ).body;

    it('amplía a `both` sin cambiar el PIN', async () => {
      const creada = await crear();
      const pinOriginal = credentialService.revealPin(
        await credentialService.findById(creada.id),
      );

      const res = await request(app.getHttpServer())
        .post(`/access/credentials/${creada.id}/scope`)
        .set(SESSION)
        .send({ scope: 'both' })
        .expect(200);

      expect(res.body.scope).toBe('both');
      expect(
        credentialService.revealPin(
          await credentialService.findById(creada.id),
        ),
      ).toBe(pinOriginal);
    });

    it('reescribe la credencial en la VPS con el ámbito nuevo', async () => {
      const creada = await crear();
      mocks.accessIot.putCredential.mockClear();

      await request(app.getHttpServer())
        .post(`/access/credentials/${creada.id}/scope`)
        .set(SESSION)
        .send({ scope: 'vehicular' })
        .expect(200);

      const [, peticion] = mocks.accessIot.putCredential.mock.calls[0];
      expect(peticion.scope).toBe('vehicular');
    });

    it('es idempotente si el ámbito ya es el pedido', async () => {
      const creada = await crear();
      mocks.accessIot.putCredential.mockClear();

      await request(app.getHttpServer())
        .post(`/access/credentials/${creada.id}/scope`)
        .set(SESSION)
        .send({ scope: 'pedestrian' })
        .expect(200);

      expect(mocks.accessIot.putCredential).not.toHaveBeenCalled();
    });

    it('400 si el edificio no tiene entrada vehicular', async () => {
      mocks.accessIot.listBuildings.mockResolvedValue([
        {
          buildingId: ING_BUILDING_ID,
          code: 'ING',
          name: 'Inglaterra',
          online: true,
          scopes: ['pedestrian'],
        },
      ]);

      const creada = await crear();

      const res = await request(app.getHttpServer())
        .post(`/access/credentials/${creada.id}/scope`)
        .set(SESSION)
        .send({ scope: 'vehicular' })
        .expect(400);

      expect(res.body.message).toContain('no tiene entrada vehicular');
    });

    it('400 al revocar y luego intentar cambiar el ámbito', async () => {
      const creada = await crear();

      await request(app.getHttpServer())
        .post(`/access/credentials/${creada.id}/revoke`)
        .set(SESSION)
        .send({ reason: 'manual' })
        .expect(200);

      await request(app.getHttpServer())
        .post(`/access/credentials/${creada.id}/scope`)
        .set(SESSION)
        .send({ scope: 'both' })
        .expect(400);
    });

    it('400 si el sujeto ya tiene otra credencial viva con ese ámbito', async () => {
      const peatonal = await crear();

      await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(nuevaCredencial({ scope: 'vehicular' }))
        .expect(201);

      // Mover la peatonal a vehicular chocaría con la que acabamos de crear.
      const res = await request(app.getHttpServer())
        .post(`/access/credentials/${peatonal.id}/scope`)
        .set(SESSION)
        .send({ scope: 'vehicular' })
        .expect(400);

      expect(res.body.message).toContain('ya tiene una credencial vigente');
    });

    it('404 si la credencial no existe', async () => {
      await request(app.getHttpServer())
        .post('/access/credentials/8f1e2a5c-0000-4000-8000-000000000000/scope')
        .set(SESSION)
        .send({ scope: 'both' })
        .expect(404);
    });

    it('400 con un ámbito fuera del catálogo', async () => {
      const creada = await crear();

      await request(app.getHttpServer())
        .post(`/access/credentials/${creada.id}/scope`)
        .set(SESSION)
        .send({ scope: 'lavanderia' })
        .expect(400);
    });
  });

  describe('el PIN no sale por las rutas de operación', () => {
    it('ni en el listado ni en el alta', async () => {
      const creada = await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(nuevaCredencial())
        .expect(201);

      const listado = await request(app.getHttpServer())
        .get('/access/credentials')
        .set(SESSION)
        .expect(200);

      const serializado = JSON.stringify([creada.body, listado.body]);
      expect(serializado).not.toContain('pinCiphertext');
      expect(serializado).not.toContain('pinFingerprint');

      // Y el PIN real tampoco aparece en ninguna de las dos respuestas.
      const credencial = await credentialService.findById(creada.body.id);
      expect(serializado).not.toContain(
        credentialService.revealPin(credencial),
      );
    });

    it('403 al revelar un PIN mientras ACCESS_ALLOW_PIN_REVEAL no esté activo', async () => {
      const creada = await request(app.getHttpServer())
        .post('/access/credentials')
        .set(SESSION)
        .send(nuevaCredencial())
        .expect(201);

      await request(app.getHttpServer())
        .get(`/access/credentials/${creada.body.id}/pin`)
        .set(SESSION)
        .expect(403);
    });
  });

  describe('GET /access/health', () => {
    it('200 con los edificios cubiertos y el recuento de fallidas', async () => {
      const res = await request(app.getHttpServer())
        .get('/access/health')
        .set(SESSION)
        .expect(200);

      expect(res.body.coveredBuildings.map((b) => b.code)).toEqual([
        'ING',
        'PRA',
      ]);
      expect(res.body.failedCredentials).toBe(0);
    });
  });

  describe('POST /webhooks/hostaway', () => {
    const basic = (credentials: string) =>
      `Basic ${Buffer.from(credentials).toString('base64')}`;

    const AUTH = basic('test-hostaway:test-hostaway-secret');

    /** Sobre real del unified webhook, con campos que el DTO descarta. */
    const evento = (
      data: Record<string, unknown> = {},
      envelope: Record<string, unknown> = {},
    ) => ({
      object: 'reservation',
      event: 'reservation.created',
      accountId: 149703,
      ...envelope,
      data: {
        id: 44712233,
        hostawayReservationId: '44712233',
        reservationId: '288172-guest-526348749-confirmation-HMFQM523QX',
        listingMapId: 288172,
        channelName: 'airbnbOfficial',
        guestName: 'Ana Pérez',
        guestEmail: null,
        arrivalDate: '2026-09-14',
        departureDate: '2026-09-18',
        checkInTime: 15,
        checkOutTime: 11,
        status: 'new',
        paymentStatus: 'Unknown',
        financeField: [{ name: 'baseRate', value: 36 }],
        ...data,
      },
    });

    const enviar = (body: object, auth: string | null = AUTH) => {
      const req = request(app.getHttpServer()).post('/webhooks/hostaway');

      return (auth ? req.set('Authorization', auth) : req).send(body);
    };

    const credencialViva = () =>
      credentialService.findLive('guest', '44712233', 'pedestrian');

    it('401 con una contraseña que no cuadra', async () => {
      await enviar(evento(), basic('test-hostaway:otra')).expect(401);
    });

    it('401 sin credenciales', async () => {
      await enviar(evento(), null).expect(401);
    });

    it('401 con la cabecera x-hostaway-secret, que ya no se acepta', async () => {
      await request(app.getHttpServer())
        .post('/webhooks/hostaway')
        .set('x-hostaway-secret', 'test-hostaway-secret')
        .send(evento())
        .expect(401);
    });

    it('proyecta la reserva y emite el PIN con reservation.created', async () => {
      const res = await enviar(evento()).expect(200);

      expect(res.body).toEqual({ received: true, processed: true });
      expect(await dataSource.getRepository(GuestStay).count()).toBe(1);
      expect(await credencialViva()).not.toBeNull();
    });

    it('responde sin esperar a la VPS: el PIN queda pendiente de empuje', async () => {
      mocks.accessIot.putCredential.mockReturnValueOnce(
        new Promise(() => undefined),
      );

      await enviar(evento()).expect(200);

      expect((await credencialViva())?.syncState).toBe('pending');
    });

    // Hostaway no filtra: un 4xx sería un email de alerta por cada mensaje.
    it('ignora con 200 los objetos que no son reservas, sin validarlos', async () => {
      const res = await enviar({
        object: 'conversationMessage',
        event: 'message.received',
        accountId: 149703,
        data: { id: 1, body: 'Hola', status: 7 },
      }).expect(200);

      expect(res.body.processed).toBe(false);
      expect(await dataSource.getRepository(GuestStay).count()).toBe(0);
    });

    it('ignora con 200 un evento de reserva desconocido', async () => {
      const res = await enviar(
        evento({}, { event: 'reservation.archived' }),
      ).expect(200);

      expect(res.body.processed).toBe(false);
    });

    it('no proyecta una reserva pending sin confirmar', async () => {
      const res = await enviar(evento({ status: 'pending' })).expect(200);

      expect(res.body.processed).toBe(false);
      expect(await dataSource.getRepository(GuestStay).count()).toBe(0);
    });

    it('revoca el PIN cuando llega la cancelación', async () => {
      await guestStayService.upsertFromReservation({
        hostawayReservationId: '44712233',
        listingId: '288172',
        guestName: 'Ana Pérez',
        arrivalDate: '2026-09-14',
        departureDate: '2026-09-18',
        status: 'new',
        issuedBy: 'hostaway-webhook',
      });

      await enviar(
        evento({ status: 'cancelled' }, { event: 'reservation.updated' }),
      ).expect(200);

      expect(await credencialViva()).toBeNull();
    });

    it('una entrega repetida no emite un segundo PIN', async () => {
      await enviar(evento()).expect(200);
      await enviar(evento()).expect(200);

      expect(
        await credentialService.list({ subject: '44712233' }),
      ).toHaveLength(1);
    });

    it('503 si openMAINT no responde para una reserva nueva, para que Hostaway reintente', async () => {
      mocks.unitResolver.byListingId.mockRejectedValueOnce(
        new Error('ETIMEDOUT'),
      );

      await enviar(evento()).expect(503);
      expect(await dataSource.getRepository(GuestStay).count()).toBe(0);
    });

    // Mismo día, entrada 23:00 y salida 00:00: la vigencia sale invertida.
    it('200 sin reintento ante un error de negocio nuestro', async () => {
      const res = await enviar(
        evento({
          departureDate: '2026-09-14',
          checkInTime: 23,
          checkOutTime: 0,
        }),
      ).expect(200);

      expect(res.body.processed).toBe(false);
    });

    it('200 sin procesar si la reserva trae un formato inesperado', async () => {
      const res = await enviar(evento({ arrivalDate: '14/09/2026' })).expect(
        200,
      );

      expect(res.body.processed).toBe(false);
    });

    it('200 pero no procesa si faltan las fechas', async () => {
      const res = await enviar(
        evento({ arrivalDate: undefined, departureDate: undefined }),
      ).expect(200);

      expect(res.body.processed).toBe(false);
    });

    it('400 con un cuerpo que no es un evento de Hostaway', async () => {
      await enviar({ data: {} }).expect(400);
    });

    // `reservationId` es el id del canal. Si se aceptara, el barrido —que usa
    // el id interno— crearía una segunda credencial para la misma reserva.
    it('ignora reservationId del canal y no procesa sin el id interno', async () => {
      const res = await enviar(
        evento({ hostawayReservationId: undefined, id: undefined }),
      ).expect(200);

      expect(res.body.processed).toBe(false);
    });

    it('usa el id interno cuando llega como `id`', async () => {
      const res = await enviar(
        evento({ hostawayReservationId: undefined }),
      ).expect(200);

      expect(res.body.processed).toBe(true);
    });
  });

  describe('proyección de la reserva', () => {
    const reserva = (overrides: Record<string, unknown> = {}) => ({
      hostawayReservationId: '44712233',
      listingId: '288172',
      guestName: 'Ana Pérez',
      guestEmail: 'ana@example.com',
      arrivalDate: '2026-09-14',
      departureDate: '2026-09-18',
      status: 'confirmed',
      issuedBy: 'hostaway-webhook',
      ...overrides,
    });

    /** Proyecta y exige estancia: un null aquí es un fallo, no un caso válido. */
    const proyectar = async (overrides: Record<string, unknown> = {}) => {
      const stay = await guestStayService.upsertFromReservation(
        reserva(overrides),
      );

      if (!stay) throw new Error('La reserva no se proyectó');

      return stay;
    };

    it('crea la estancia y emite credencial en un edificio con cobertura', async () => {
      const stay = await proyectar();

      expect(stay.buildingId).toBe(ING_BUILDING_ID);
      expect(stay.openmaintUnitId).toBe(1187);

      const credencial = await credentialService.findLive(
        'guest',
        '44712233',
        'pedestrian',
      );
      expect(credencial?.guestStayId).toBe(stay.id);
      expect(credencial?.issuedBy).toBe('hostaway-webhook');
    });

    it('crea la estancia SIN credencial si el edificio no tiene puertas con PIN', async () => {
      mocks.unitResolver.byListingId.mockResolvedValue({
        unitId: 900,
        buildingId: BAT_BUILDING_ID,
      });

      const stay = await proyectar();

      // La estancia existe igual: es el cimiento del portal, no un accesorio.
      expect(stay.buildingId).toBe(BAT_BUILDING_ID);
      expect(
        await credentialService.findLive('guest', '44712233', 'pedestrian'),
      ).toBeNull();
      expect(mocks.accessIot.putCredential).not.toHaveBeenCalled();
    });

    it('crea la estancia SIN credencial si el listing no está mapeado', async () => {
      mocks.unitResolver.byListingId.mockResolvedValue(null);

      const stay = await proyectar();

      expect(stay.buildingId).toBeNull();
      expect(
        await credentialService.findLive('guest', '44712233', 'pedestrian'),
      ).toBeNull();
    });

    it('aplica los márgenes de acceso sobre el check-in y el check-out', async () => {
      const stay = await proyectar();

      // 15:00 −05:00 menos 3 h de margen = 17:00 UTC del día de llegada.
      expect(stay.accessValidFrom.toISOString()).toBe(
        '2026-09-14T17:00:00.000Z',
      );
      // 11:00 −05:00 más 3 h = 19:00 UTC del día de salida.
      expect(stay.accessValidTo.toISOString()).toBe('2026-09-18T19:00:00.000Z');
    });

    it('reprograma la vigencia sin cambiar el PIN cuando cambian las fechas', async () => {
      await guestStayService.upsertFromReservation(reserva());
      const antes = await credentialService.findLive(
        'guest',
        '44712233',
        'pedestrian',
      );
      const pinOriginal = credentialService.revealPin(antes!);

      await guestStayService.upsertFromReservation(
        reserva({ departureDate: '2026-09-20' }),
      );

      const despues = await credentialService.findLive(
        'guest',
        '44712233',
        'pedestrian',
      );

      expect(despues!.id).toBe(antes!.id);
      expect(credentialService.revealPin(despues!)).toBe(pinOriginal);
      expect(despues!.validTo.toISOString()).toBe('2026-09-20T19:00:00.000Z');
    });

    it('revoca la credencial cuando la reserva se cancela', async () => {
      await guestStayService.upsertFromReservation(reserva());

      const stay = await proyectar({ status: 'cancelled' });

      expect(stay.status).toBe('cancelled');
      expect(
        await credentialService.findLive('guest', '44712233', 'pedestrian'),
      ).toBeNull();
      expect(mocks.accessIot.deleteCredential).toHaveBeenCalled();
    });

    it('no emite un segundo PIN si al huésped le ampliaron el ámbito a mano', async () => {
      const stay = await proyectar();
      const original = await credentialService.findLiveBySubject(
        'guest',
        '44712233',
      );

      // Operaciones le da la barrera porque el huésped trajo vehículo.
      await credentialService.changeScope(original!.id, 'both');

      // Y luego llega otro webhook de la misma reserva.
      await guestStayService.upsertFromReservation(reserva());

      const vivas = await credentialService.list({ subject: '44712233' });
      expect(vivas).toHaveLength(1);
      expect(vivas[0].id).toBe(original!.id);
      expect(vivas[0].scope).toBe('both');
      expect(stay.id).toBe(vivas[0].guestStayId);
    });

    it('no proyecta ni emite para una consulta (status inquiry)', async () => {
      const stay = await guestStayService.upsertFromReservation(
        reserva({ status: 'inquiry' }),
      );

      expect(stay).toBeNull();
      expect(await dataSource.getRepository(GuestStay).count()).toBe(0);
      expect(mocks.accessIot.putCredential).not.toHaveBeenCalled();
    });

    it('usa las horas de la reserva por encima de las de entorno', async () => {
      // El listing de Pradera llega con checkInTime 16, no con el 15 global.
      const stay = await proyectar({ checkInTime: 16, checkOutTime: 10 });

      // 16:00-05:00 = 21:00Z, menos 3 h de margen = 18:00Z.
      expect(stay.accessValidFrom.toISOString()).toBe(
        '2026-09-14T18:00:00.000Z',
      );
      expect(stay.accessValidTo.toISOString()).toBe('2026-09-18T18:00:00.000Z');
    });

    it('cae a las horas de entorno si la reserva no las trae', async () => {
      const stay = await proyectar();

      expect(stay.accessValidFrom.toISOString()).toBe(
        '2026-09-14T17:00:00.000Z',
      );
    });

    it('no duplica la estancia al reprocesar la misma reserva', async () => {
      await guestStayService.upsertFromReservation(reserva());
      await guestStayService.upsertFromReservation(reserva());

      expect(await dataSource.getRepository(GuestStay).count()).toBe(1);
    });

    it('reutiliza el edificio guardado si openMAINT no responde', async () => {
      await proyectar();
      mocks.unitResolver.byListingId.mockRejectedValueOnce(
        new Error('ETIMEDOUT'),
      );

      const stay = await proyectar({ departureDate: '2026-09-20' });

      expect(stay.buildingId).toBe(ING_BUILDING_ID);
    });

    it('revoca aunque openMAINT no responda: cancelar no necesita edificio', async () => {
      await proyectar();
      mocks.unitResolver.byListingId.mockRejectedValueOnce(
        new Error('ETIMEDOUT'),
      );

      await proyectar({ status: 'cancelled' });

      expect(
        await credentialService.findLive('guest', '44712233', 'pedestrian'),
      ).toBeNull();
    });
  });

  describe('barrido de reservas', () => {
    const deHostaway = (overrides: Record<string, unknown> = {}) => ({
      hostawayReservationId: '44712233',
      status: 'new',
      guestName: 'Ana Pérez',
      guestEmail: null,
      listingMapId: '288172',
      arrivalDate: '2026-09-14',
      departureDate: '2026-09-18',
      checkInTime: 15,
      checkOutTime: 11,
      ...overrides,
    });

    // El fallo que motivó separar la consulta de accesos de la de facturación:
    // una reserva directa llega con paymentStatus 'Unknown', el filtro de
    // facturación la escondía y el barrido le revocaba el PIN al huésped.
    it('conserva la credencial de una reserva que sigue en Hostaway', async () => {
      await guestStayService.upsertFromReservation({
        hostawayReservationId: '44712233',
        listingId: '288172',
        guestName: 'Ana Pérez',
        arrivalDate: '2026-09-14',
        departureDate: '2026-09-18',
        status: 'new',
        issuedBy: 'hostaway-webhook',
      });

      mocks.hostaway.getReservationsForAccess.mockResolvedValue([deHostaway()]);

      await sweep.reconcileDate('2026-09-14');

      const viva = await credentialService.findLiveBySubject(
        'guest',
        '44712233',
      );
      expect(viva).not.toBeNull();
      expect(mocks.accessIot.deleteCredential).not.toHaveBeenCalled();
    });

    it('revoca cuando la reserva ya no está en Hostaway', async () => {
      await guestStayService.upsertFromReservation({
        hostawayReservationId: '44712233',
        listingId: '288172',
        guestName: 'Ana Pérez',
        arrivalDate: '2026-09-14',
        departureDate: '2026-09-18',
        status: 'new',
        issuedBy: 'hostaway-webhook',
      });

      mocks.hostaway.getReservationsForAccess.mockResolvedValue([
        deHostaway({ hostawayReservationId: '99999999' }),
      ]);

      await sweep.reconcileDate('2026-09-14');

      expect(
        await credentialService.findLiveBySubject('guest', '44712233'),
      ).toBeNull();
    });

    it('no cancela nada si Hostaway devuelve la lista vacía', async () => {
      await guestStayService.upsertFromReservation({
        hostawayReservationId: '44712233',
        listingId: '288172',
        guestName: 'Ana Pérez',
        arrivalDate: '2026-09-14',
        departureDate: '2026-09-18',
        status: 'new',
        issuedBy: 'hostaway-webhook',
      });

      mocks.hostaway.getReservationsForAccess.mockResolvedValue([]);

      await sweep.reconcileDate('2026-09-14');

      expect(
        await credentialService.findLiveBySubject('guest', '44712233'),
      ).not.toBeNull();
    });

    it('propaga el estado real y revoca una cancelación que el webhook perdió', async () => {
      await guestStayService.upsertFromReservation({
        hostawayReservationId: '44712233',
        listingId: '288172',
        guestName: 'Ana Pérez',
        arrivalDate: '2026-09-14',
        departureDate: '2026-09-18',
        status: 'new',
        issuedBy: 'hostaway-webhook',
      });

      mocks.hostaway.getReservationsForAccess.mockResolvedValue([
        deHostaway({ status: 'cancelled' }),
      ]);

      await sweep.reconcileDate('2026-09-14');

      expect(
        await credentialService.findLiveBySubject('guest', '44712233'),
      ).toBeNull();
    });
  });
});
