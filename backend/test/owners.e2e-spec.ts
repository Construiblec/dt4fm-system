import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import {
  createTestApp,
  resetMockCalls,
  TestAppMocks,
} from './helpers/test-app';
import { mockSession } from './mocks/openmaint-core.mock';

/** El residente de referencia de esta suite: tenantId 300, userId 900. */
const OWNER_SESSION = 'mock-session-id';
const OWNER_TENANT_ID = 300;
const OWNER_USER_ID = 900;

describe('OwnersController (e2e)', () => {
  let app: INestApplication;
  let mocks: TestAppMocks;

  beforeAll(async () => {
    ({ app, mocks } = await createTestApp());
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    // `OwnerSessionGuard` resuelve la identidad contra openMAINT antes de
    // dejar pasar cualquier ruta con :tenantId o :userId. Sin esto, la
    // sesión por defecto (equipo, sin ficha Tenant) daría 403 en todas.
    mocks.openmaint.getSession.mockResolvedValue(
      mockSession({
        userId: OWNER_USER_ID,
        userDescription: 'Juan Perez',
        role: 'Propietarios',
        availableRoles: ['Propietarios'],
      }),
    );
    mocks.openmaint.findTenantByDescription.mockResolvedValue(OWNER_TENANT_ID);
  });

  afterEach(() => resetMockCalls());

  // ─── La corrección de BP-001 ──────────────────────────────────────────────
  //
  // Antes, estos endpoints no pedían ninguna cabecera: la identidad salía del
  // número de la URL. Como los identificadores son secuenciales, recorrerlos
  // devolvía el estado de cuenta de cualquier residente sin iniciar sesión.
  describe('Acceso a datos de residentes', () => {
    const protegidos: [string, string][] = [
      ['get', `/owners/${OWNER_TENANT_ID}/units`],
      ['get', `/owners/${OWNER_TENANT_ID}/payments`],
      ['get', `/owners/${OWNER_USER_ID}/profile`],
    ];

    it.each(protegidos)('401 sin sesión: %s %s', async (method, path) => {
      await request(app.getHttpServer())[method as 'get'](path).expect(401);
    });

    it('403 al pedir los pagos de otro propietario', async () => {
      await request(app.getHttpServer())
        .get('/owners/301/payments')
        .set('authorization', OWNER_SESSION)
        .expect(403);
    });

    it('403 al pedir el perfil de otro usuario', async () => {
      await request(app.getHttpServer())
        .get('/owners/901/profile')
        .set('authorization', OWNER_SESSION)
        .expect(403);
    });

    it('403 cuando la cuenta no tiene ficha de propietario', async () => {
      // Sesión del equipo: existe y es válida, pero no es residente.
      mocks.openmaint.getSession.mockResolvedValue(
        mockSession({ userId: 555, availableRoles: ['MaintOffice'] }),
      );

      await request(app.getHttpServer())
        .get(`/owners/${OWNER_TENANT_ID}/payments`)
        .set('authorization', 'sesion-del-equipo')
        .expect(403);
    });

    it('401 con una sesión que openMAINT no reconoce', async () => {
      mocks.openmaint.getSession.mockRejectedValue({
        response: { status: 400 },
      });

      await request(app.getHttpServer())
        .get(`/owners/${OWNER_TENANT_ID}/payments`)
        .set('authorization', 'sesion-inventada')
        .expect(401);
    });

    it('los endpoints públicos siguen sin pedir sesión', async () => {
      mocks.openmaint.getBuildings.mockResolvedValueOnce({ data: [] });

      await request(app.getHttpServer()).get('/owners/buildings').expect(200);
    });
  });

  describe('POST /owners/verify', () => {
    it('201: cédula encontrada devuelve el tenant y un username sugerido', async () => {
      mocks.openmaint.findTenantByIdNumber.mockResolvedValueOnce({
        _id: 300,
        Description: 'Juan Perez',
        IDNumber: '1721548769',
        Email: 'juan@example.com',
      });

      const res = await request(app.getHttpServer())
        .post('/owners/verify')
        .send({ idNumber: '1721548769' })
        .expect(201);

      expect(res.body.found).toBe(true);
      expect(res.body.tenantId).toBe(300);
      expect(res.body.suggestedUsername).toBe('juan.perez');
    });

    it('400 si la cédula no corresponde a ningún propietario', async () => {
      mocks.openmaint.findTenantByIdNumber.mockResolvedValueOnce(null);

      await request(app.getHttpServer())
        .post('/owners/verify')
        .send({ idNumber: '0000000000' })
        .expect(400);
    });
  });

  describe('POST /owners/register', () => {
    it('201: crea la cuenta cuando la cédula existe', async () => {
      mocks.openmaint.findTenantByIdNumber.mockResolvedValueOnce({
        _id: 300,
        Description: 'Juan Perez',
        Email: 'juan@example.com',
      });
      mocks.openmaint.createOwnerUser.mockResolvedValueOnce({
        _id: 900,
        username: 'juan_perez',
      });

      const res = await request(app.getHttpServer())
        .post('/owners/register')
        .send({
          idNumber: '1721548769',
          username: 'juan_perez',
          password: 'secreto123',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
      expect(res.body.tenantId).toBe(300);
    });

    it('409 cuando el username ya está en uso', async () => {
      mocks.openmaint.findTenantByIdNumber.mockResolvedValueOnce({
        _id: 300,
        Description: 'Juan Perez',
      });
      mocks.openmaint.createOwnerUser.mockRejectedValueOnce({
        response: { status: 409 },
      });

      await request(app.getHttpServer())
        .post('/owners/register')
        .send({
          idNumber: '1721548769',
          username: 'ya_existe',
          password: 'secreto123',
        })
        .expect(409);
    });
  });

  describe('POST /owners/login', () => {
    it('201: usuario con rol de propietario', async () => {
      mocks.openmaintAuth.login.mockResolvedValueOnce({
        data: {
          _id: 'mock-session-id',
          username: 'juan_perez',
          userId: 900,
          availableRoles: ['Propietarios'],
        },
      });

      const res = await request(app.getHttpServer())
        .post('/owners/login')
        .send({ username: 'juan_perez', password: 'secreto123' })
        .expect(201);

      expect(res.body.sessionId).toBe('mock-session-id');
    });

    it('401 si el usuario no tiene el rol de propietario', async () => {
      mocks.openmaintAuth.login.mockResolvedValueOnce({
        data: {
          _id: 'mock-session-id',
          username: 'tecnico.mock',
          userId: 999,
          availableRoles: ['MaintOffice'],
        },
      });

      await request(app.getHttpServer())
        .post('/owners/login')
        .send({ username: 'tecnico.mock', password: 'password123' })
        .expect(401);
    });
  });

  describe('GET /owners/common-areas y reservas', () => {
    it('200: lista áreas comunales, excluyendo las técnicas', async () => {
      mocks.openmaintClient.get.mockResolvedValueOnce({
        data: [
          {
            _id: 1,
            Name: 'Salón comunal',
            _State_code: 'Available',
            Precio: 25,
          },
          { _id: 2, Name: 'Sala técnica', _State_code: 'Available', Precio: 0 },
        ],
      });

      const res = await request(app.getHttpServer())
        .get('/owners/common-areas')
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].id ?? res.body[0]._id).toBeDefined();
    });

    it('409 al reservar un área ya reservada', async () => {
      mocks.openmaintClient.get.mockResolvedValueOnce({
        data: {
          _id: 12,
          Name: 'Salón comunal',
          _State_code: 'Rent',
          Precio: 25,
        },
      });

      await request(app.getHttpServer())
        .post('/owners/300/reservations')
        .set('authorization', 'mock-session-id')
        .send({
          commonAreaId: '12',
          fechaInicio: '2026-06-03T18:00:00',
          fechaFin: '2026-06-03T20:00:00',
        })
        .expect(409);

      expect(mocks.openmaintClient.put).not.toHaveBeenCalled();
    });

    it('201: reserva un área disponible', async () => {
      mocks.openmaintClient.get.mockResolvedValueOnce({
        data: {
          _id: 12,
          Name: 'Salón comunal',
          _State_code: 'Available',
          Precio: 25,
        },
      });
      mocks.openmaintClient.put.mockResolvedValueOnce({});

      const res = await request(app.getHttpServer())
        .post('/owners/300/reservations')
        .set('authorization', 'mock-session-id')
        .send({
          commonAreaId: '12',
          fechaInicio: '2026-06-03T18:00:00',
          fechaFin: '2026-06-03T20:00:00',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });
  });

  describe('PUT /owners/:userId/password', () => {
    it('200: cambia la contraseña con la actual correcta', async () => {
      mocks.openmaintUsers.getAccount.mockResolvedValueOnce({
        _id: 900,
        username: 'juan_perez',
        active: true,
      });

      const res = await request(app.getHttpServer())
        .put('/owners/900/password')
        .set('authorization', 'mock-session-id')
        .send({ currentPassword: 'actual123', newPassword: 'nuevaClave123' })
        .expect(200);

      expect(res.body.success).toBe(true);
    });

    it('400 si la contraseña actual es incorrecta', async () => {
      mocks.openmaintUsers.getAccount.mockResolvedValueOnce({
        _id: 900,
        username: 'juan_perez',
        active: true,
      });
      mocks.openmaintAuth.login.mockRejectedValueOnce({
        response: { status: 401 },
      });

      await request(app.getHttpServer())
        .put('/owners/900/password')
        .set('authorization', 'mock-session-id')
        .send({ currentPassword: 'mala-clave', newPassword: 'nuevaClave123' })
        .expect(400);
    });
  });

  describe('POST /owners/:tenantId/contact', () => {
    it('201: envía el mensaje a administración', async () => {
      mocks.openmaintClient.post.mockResolvedValueOnce({});

      const res = await request(app.getHttpServer())
        .post('/owners/300/contact')
        .set('authorization', 'mock-session-id')
        .send({
          subject: 'Cobro duplicado',
          message: 'Revisen mi último recibo.',
        })
        .expect(201);

      expect(res.body.success).toBe(true);
    });

    it('400 si falta el mensaje', async () => {
      await request(app.getHttpServer())
        .post('/owners/300/contact')
        .set('authorization', 'mock-session-id')
        .send({ subject: 'Sin mensaje' })
        .expect(400);
    });
  });
});
