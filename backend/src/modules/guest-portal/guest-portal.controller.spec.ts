import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validationPipeOptions } from '../../config/validation.config';
import { SessionRoleService } from '../../integrations/openmaint/session-role.service';
import { GuestPortalDataService } from '../access-control/guest-portal-data.service';
import { GuestStay } from '../access-control/entities/guest-stay.entity';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import { GuestPortalController } from './guest-portal.controller';
import { GuestPortalService } from './guest-portal.service';
import { GuestTokenService } from './guest-token.service';

const HOUR = 60 * 60 * 1000;
const STAY = 'c47ca6f1-f675-4653-a3a6-31487feb054b';
const SESION_ADMIN = 'sesion-de-superuser';

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

  beforeAll(async () => {
    const config = {
      get: (key: string) =>
        ({
          GUEST_MAGICLINK_SECRET: 'secreto-de-pruebas-suficientemente-largo',
          APP_BASE_URL: 'https://dt4fm.example.com',
        })[key],
    } as unknown as ConfigService;

    const moduleRef = await Test.createTestingModule({
      controllers: [GuestPortalController],
      providers: [
        GuestPortalService,
        GuestTokenService,
        RateLimiterService,
        { provide: ConfigService, useValue: config },
        {
          provide: GuestPortalDataService,
          useValue: {
            findStay: jest.fn().mockResolvedValue(stay),
            getPortalData: jest.fn().mockResolvedValue({
              stayId: STAY,
              guestName: 'Bruno Salas',
              pinState: 'disponible',
              pin: '4813',
            }),
          },
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
});
