import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validationPipeOptions } from '../../config/validation.config';
import { OpenmaintServiceSession } from '../../integrations/openmaint/openmaint.service-session';
import { SessionRoleService } from '../../integrations/openmaint/session-role.service';
import {
  GuestPortalData,
  GuestPortalDataService,
} from '../access-control/guest-portal-data.service';
import { GuestStay } from '../access-control/entities/guest-stay.entity';
import { GuestLinkService } from '../guest-link/guest-link.service';
import { GuestTokenService } from '../guest-link/guest-token.service';
import { IncidentsService } from '../incidents/incidents.service';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import { GuestIncidentService } from './guest-incident.service';
import { GuestLocationService } from './guest-location.service';
import { GuestPortalController } from './guest-portal.controller';
import { GuestPortalService } from './guest-portal.service';

const HOUR = 60 * 60 * 1000;
const STAY = 'c47ca6f1-f675-4653-a3a6-31487feb054b';
const SESION_ADMIN = 'sesion-de-superuser';
const BUILDING = 3019998;

const portalDataWith = (
  overrides: Partial<GuestPortalData> = {},
): Partial<GuestPortalData> => ({
  stayId: STAY,
  reservationId: '90000002',
  guestName: 'Bruno Salas',
  guestEmail: 'bruno@example.com',
  listingId: '288173',
  openmaintUnitId: 4242,
  buildingId: BUILDING,
  stayStatus: 'active',
  checkInAt: new Date(Date.now() - 20 * HOUR),
  accessValidTo: new Date(Date.now() + 48 * HOUR),
  pinState: 'disponible',
  pin: '4813',
  ...overrides,
});

const stay = {
  id: STAY,
  hostawayReservationId: '90000002',
  guestName: 'Bruno Salas',
  guestEmail: 'bruno@example.com',
  accessValidFrom: new Date(Date.now() - 24 * HOUR),
  accessValidTo: new Date(Date.now() + 48 * HOUR),
  status: 'active',
  tokenVersion: 1,
} as GuestStay;

/**
 * Comprueba el borde de autorización de `/guest` sobre la app real: que los
 * guards estén enganchados, que el token llegue por las tres vías previstas y
 * que sin credencial no pase nada. La lógica de vigencia se prueba aparte.
 *
 * Se monta solo el controlador con dobles de los servicios de datos, así que no
 * hace falta base de datos ni openMAINT.
 */
describe('GuestPortalController', () => {
  let app: INestApplication;
  const getPortalData = jest.fn();
  const createIncident = jest.fn();

  beforeEach(() => {
    getPortalData.mockReset().mockResolvedValue(portalDataWith());
    createIncident.mockReset().mockResolvedValue({
      incidentId: 777,
      requester: 555,
      buildingId: BUILDING,
      attachmentsUploaded: 0,
      attachmentsFailed: 0,
    });
  });

  beforeAll(async () => {
    const config = {
      get: (key: string) =>
        ({
          GUEST_MAGICLINK_SECRET: 'secreto-de-pruebas-suficientemente-largo',
          APP_BASE_URL: 'https://dt4fm.example.com',
          OPENMAINT_GUEST_REQUESTER_ID: '555',
        })[key],
    } as unknown as ConfigService;

    // `GuestLinkService` se dobla, pero su `issue()` usa el `GuestTokenService`
    // real del módulo, para que los tokens emitidos sean verificables.
    const tokens = new GuestTokenService(config);
    const deliver = jest.fn().mockResolvedValue({
      outcome: 'sent',
      channel: 'webhook',
      target: 'https://ejemplo.test/hook',
    });

    const moduleRef = await Test.createTestingModule({
      controllers: [GuestPortalController],
      providers: [
        GuestPortalService,
        { provide: GuestTokenService, useValue: tokens },
        {
          provide: GuestLinkService,
          useValue: {
            isConfigured: () => tokens.isConfigured(),
            issue: (s: { id: string; tokenVersion: number }) => {
              const token = tokens.create(s.id, s.tokenVersion);
              return {
                token,
                url: `https://dt4fm.example.com/guest/dashboard?token=${encodeURIComponent(token)}`,
              };
            },
            deliver,
          },
        },
        RateLimiterService,
        { provide: ConfigService, useValue: config },
        {
          provide: GuestPortalDataService,
          useValue: {
            findStay: jest.fn().mockResolvedValue(stay),
            getPortalData,
          },
        },
        GuestIncidentService,
        {
          provide: GuestLocationService,
          useValue: {
            lookup: jest.fn().mockResolvedValue({
              unitName: 'P12',
              buildingName: 'Pradera',
              buildingAddress: 'Av. de ejemplo 123, Quito',
              floorId: 3055144,
            }),
          },
        },
        { provide: IncidentsService, useValue: { createIncident } },
        {
          provide: OpenmaintServiceSession,
          useValue: { get: jest.fn().mockResolvedValue('sesion-servicio') },
        },
        {
          provide: SessionRoleService,
          useValue: {
            resolveIdentity: jest
              .fn()
              .mockImplementation((token: string) =>
                token === SESION_ADMIN
                  ? Promise.resolve({ role: 'SuperUser', username: 'admin' })
                  : Promise.resolve({ role: 'Limpieza', username: 'juan' }),
              ),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const emitir = async (): Promise<{ token: string; url: string }> => {
    const response = await request(app.getHttpServer())
      .post('/guest/magic-link')
      .set('x-session-token', SESION_ADMIN)
      .send({ stayId: STAY })
      .expect(201);

    return response.body as { token: string; url: string };
  };

  it('emite un enlace al portal del huésped', async () => {
    const { url, token } = await emitir();

    expect(url).toBe(
      `https://dt4fm.example.com/guest/dashboard?token=${encodeURIComponent(token)}`,
    );
  });

  it('canjea el enlace y devuelve los datos del portal', async () => {
    const { token } = await emitir();

    const response = await request(app.getHttpServer())
      .get('/guest/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({ stayId: STAY, pin: '4813' });
  });

  it('acepta el token también por cabecera propia y por query string', async () => {
    const { token } = await emitir();

    await request(app.getHttpServer())
      .get('/guest/me')
      .set('x-guest-token', token)
      .expect(200);

    // El query string es el de la primera carga, cuando el huésped abre el
    // enlace del correo y el frontend todavía no tiene el token guardado.
    await request(app.getHttpServer())
      .get(`/guest/me?token=${encodeURIComponent(token)}`)
      .expect(200);
  });

  it('envía el enlace por el canal y no devuelve el token', async () => {
    const response = await request(app.getHttpServer())
      .post('/guest/magic-link/deliver')
      .set('x-session-token', SESION_ADMIN)
      .send({ stayId: STAY })
      .expect(200);

    expect(response.body).toMatchObject({
      outcome: 'sent',
      channel: 'webhook',
    });
    expect(response.body).not.toHaveProperty('token');
    expect(response.body).not.toHaveProperty('url');
  });

  it('no envía enlaces sin rol de administración', async () => {
    await request(app.getHttpServer())
      .post('/guest/magic-link/deliver')
      .set('x-session-token', 'sesion-de-limpieza')
      .send({ stayId: STAY })
      .expect(403);
  });

  it('no emite enlaces sin sesión de openMAINT', async () => {
    await request(app.getHttpServer())
      .post('/guest/magic-link')
      .send({ stayId: STAY })
      .expect(401);
  });

  it('no emite enlaces con un rol que no es de administración', async () => {
    await request(app.getHttpServer())
      .post('/guest/magic-link')
      .set('x-session-token', 'sesion-de-limpieza')
      .send({ stayId: STAY })
      .expect(403);
  });

  it('no deja entrar al portal sin un enlace válido', async () => {
    await request(app.getHttpServer()).get('/guest/me').expect(401);

    await request(app.getHttpServer())
      .get('/guest/me')
      .set('Authorization', 'Bearer inventado.deltodo')
      .expect(401);
  });

  it('rechaza una estancia que no es un uuid', async () => {
    await request(app.getHttpServer())
      .post('/guest/magic-link')
      .set('x-session-token', SESION_ADMIN)
      .send({ stayId: '90000002' })
      .expect(400);
  });

  it('el portal incluye unidad, edificio y dirección', async () => {
    const { token } = await emitir();

    const response = await request(app.getHttpServer())
      .get('/guest/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      unitName: 'P12',
      buildingName: 'Pradera',
      buildingAddress: 'Av. de ejemplo 123, Quito',
    });
    // La planta solo sirve para abrir correctivos; el portal no la necesita.
    expect(response.body).not.toHaveProperty('floorId');
  });

  describe('POST /guest/incidents', () => {
    it('no acepta reportes sin enlace', async () => {
      await request(app.getHttpServer())
        .post('/guest/incidents')
        .field('description', 'No hay agua caliente')
        .expect(401);

      expect(createIncident).not.toHaveBeenCalled();
    });

    it('abre el correctivo con la estancia del enlace, no con lo que envía el cliente', async () => {
      const { token } = await emitir();

      const response = await request(app.getHttpServer())
        .post('/guest/incidents')
        .set('Authorization', `Bearer ${token}`)
        .field('description', 'No hay agua caliente')
        .field('buildingId', '999')
        .expect(201);

      expect(response.body).toEqual({
        incidentId: 777,
        attachmentsUploaded: 0,
        attachmentsFailed: 0,
      });

      const [sessionId, requesterId, dto] = createIncident.mock.calls[0] as [
        string,
        number,
        { buildingId: number; unitId: number; notes: string },
      ];

      expect(sessionId).toBe('sesion-servicio');
      expect(requesterId).toBe(555);
      expect(dto).toMatchObject({ buildingId: BUILDING, unitId: 4242 });
      expect(dto.notes).toContain('No hay agua caliente');
    });

    it('rechaza adjuntos que no son imágenes', async () => {
      const { token } = await emitir();

      await request(app.getHttpServer())
        .post('/guest/incidents')
        .set('Authorization', `Bearer ${token}`)
        .field('description', 'Adjunto un documento')
        .attach('images', Buffer.from('hola'), {
          filename: 'nota.txt',
          contentType: 'text/plain',
        })
        .expect(400);

      expect(createIncident).not.toHaveBeenCalled();
    });

    it('no acepta reportes antes del check-in', async () => {
      getPortalData.mockResolvedValue(
        portalDataWith({ checkInAt: new Date(Date.now() + 2 * HOUR) }),
      );
      const { token } = await emitir();

      await request(app.getHttpServer())
        .post('/guest/incidents')
        .set('Authorization', `Bearer ${token}`)
        .field('description', 'Todavía no llego')
        .expect(403);

      expect(createIncident).not.toHaveBeenCalled();
    });

    it('explica que la reserva no está vinculada a un edificio', async () => {
      getPortalData.mockResolvedValue(portalDataWith({ buildingId: null }));
      const { token } = await emitir();

      await request(app.getHttpServer())
        .post('/guest/incidents')
        .set('Authorization', `Bearer ${token}`)
        .field('description', 'Algo pasa')
        .expect(422);
    });
  });
});
