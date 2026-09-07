import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { validationPipeOptions } from '../../config/validation.config';
import { GuestAccessModule } from './guest-access.module';

const ISSUER_SECRET = 'secreto-de-emision-para-la-prueba';

/** Reserva que devuelve el mock de Hostaway con HOSTAWAY_USE_MOCK=true. */
const RESERVATION_ID = 46157859;

/**
 * Comprueba el borde de autorización de `/guest` sobre la app real: que los
 * guards estén enganchados, que el token llegue por las tres vías previstas y
 * que sin credencial no pase nada. La lógica de firma y de ventana se prueba
 * aparte, en los specs de `GuestTokenService` y `GuestAccessService`.
 *
 * Se monta solo este módulo, así que no hace falta base de datos ni openMAINT.
 */
describe('GuestAccessController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.HOSTAWAY_USE_MOCK = 'true';
    process.env.GUEST_MAGICLINK_SECRET = 'clave-de-firma-para-la-prueba';
    process.env.GUEST_LINK_ISSUER_SECRET = ISSUER_SECRET;
    process.env.APP_BASE_URL = 'https://dt4fm.example.com';

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), GuestAccessModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  const issue = async (): Promise<{ token: string; url: string }> => {
    const response = await request(app.getHttpServer())
      .post('/guest/magic-link')
      .set('x-guest-link-secret', ISSUER_SECRET)
      .send({ reservationId: RESERVATION_ID })
      .expect(201);

    return response.body as { token: string; url: string };
  };

  it('emite un enlace al dashboard del huésped', async () => {
    const { url, token } = await issue();

    expect(url).toBe(
      `https://dt4fm.example.com/guest/dashboard?token=${encodeURIComponent(token)}`,
    );
  });

  it('canjea el enlace y devuelve la reserva del huésped', async () => {
    const { token } = await issue();

    const response = await request(app.getHttpServer())
      .get('/guest/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      reservationId: RESERVATION_ID,
      guestName: expect.any(String) as unknown as string,
      arrivalDate: expect.any(String) as unknown as string,
      departureDate: expect.any(String) as unknown as string,
    });
  });

  it('acepta el token también por cabecera propia y por query string', async () => {
    const { token } = await issue();

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

  it('no emite enlaces sin el secreto de emisión', async () => {
    await request(app.getHttpServer())
      .post('/guest/magic-link')
      .send({ reservationId: RESERVATION_ID })
      .expect(401);

    await request(app.getHttpServer())
      .post('/guest/magic-link')
      .set('x-guest-link-secret', 'equivocado')
      .send({ reservationId: RESERVATION_ID })
      .expect(401);
  });

  it('no deja entrar al dashboard sin un enlace válido', async () => {
    await request(app.getHttpServer()).get('/guest/me').expect(401);

    await request(app.getHttpServer())
      .get('/guest/me')
      .set('Authorization', 'Bearer inventado.deltodo')
      .expect(401);
  });

  it('rechaza un identificador de reserva que no es un número', async () => {
    await request(app.getHttpServer())
      .post('/guest/magic-link')
      .set('x-guest-link-secret', ISSUER_SECRET)
      .send({ reservationId: 'no-es-un-numero' })
      .expect(400);
  });
});
