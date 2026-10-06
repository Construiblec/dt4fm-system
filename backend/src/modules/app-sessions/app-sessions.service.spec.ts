import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { FindOperator, Repository } from 'typeorm';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';
import {
  AppSessionsService,
  PERSIST_TOUCH_MS,
  REMEMBER_MS,
  TRANSIENT_MS,
} from './app-sessions.service';
import { AppSession } from './entities/app-session.entity';

const KEY = randomBytes(32).toString('base64');
const T0 = new Date('2026-10-02T08:00:00Z');
const HOUR_MS = 60 * 60 * 1000;

const issued = (sessionId: string, username = 'wilmer.palma') => ({
  sessionId,
  username,
  userId: 628914,
});

type Where = Record<string, unknown>;

/** Lo justo de un Repository de TypeORM, en memoria. */
const memoryRepository = (rows: AppSession[] = []) => {
  let nextId = 1;

  const matches = (row: AppSession, where: Where = {}) =>
    Object.entries(where).every(([field, expected]) => {
      const actual = row[field as keyof AppSession];

      if (expected instanceof FindOperator) {
        if (expected.type === 'in') {
          return (expected.value as unknown[]).includes(actual);
        }
        throw new Error(`Operador no soportado: ${expected.type}`);
      }

      return actual === expected;
    });

  const repository = {
    upsert: jest.fn((entity: Omit<AppSession, 'id'>) => {
      const existing = rows.find((r) => r.sessionHash === entity.sessionHash);
      if (existing) Object.assign(existing, entity);
      else rows.push({ ...entity, id: String(nextId++) } as AppSession);
      return Promise.resolve();
    }),
    find: jest.fn(() => Promise.resolve(rows.map((row) => ({ ...row })))),
    update: jest.fn((where: Where, changes: Partial<AppSession>) => {
      rows
        .filter((row) => matches(row, where))
        .forEach((row) => {
          Object.assign(row, changes);
        });
      return Promise.resolve();
    }),
    delete: jest.fn((where: Where) => {
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (matches(rows[i], where)) rows.splice(i, 1);
      }
      return Promise.resolve();
    }),
  };

  return { rows, repository };
};

const buildHarness = (
  env: Record<string, string> = {},
  existingRows: AppSession[] = [],
) => {
  const { rows, repository } = memoryRepository(existingRows);

  const openmaint = {
    keepAlive: jest.fn().mockResolvedValue(undefined),
    logout: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<OpenmaintAuthService>;

  const values: Record<string, string> = {
    APP_SESSION_KEY: KEY,
    APP_SESSION_KEEPALIVE_ENABLED: 'true',
    ...env,
  };

  const service = new AppSessionsService(
    repository as unknown as Repository<AppSession>,
    openmaint,
    { get: (key: string) => values[key] } as unknown as ConfigService,
  );

  return { service, rows, repository, openmaint };
};

/** Error tal y como lo re-lanza OpenmaintClient: un AxiosError crudo. */
const httpError = (status: number) =>
  Object.assign(new Error('Request failed'), { response: { status } });

/** Llamadas que despiertan la base: todo menos lo que no la toca. */
const dbCalls = (
  repository: ReturnType<typeof memoryRepository>['repository'],
) =>
  repository.find.mock.calls.length +
  repository.upsert.mock.calls.length +
  repository.update.mock.calls.length +
  repository.delete.mock.calls.length;

beforeEach(() => {
  jest.useFakeTimers({ now: T0, doNotFake: ['nextTick', 'setImmediate'] });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('AppSessionsService', () => {
  describe('configuración', () => {
    it.each([
      ['sin clave', ''],
      [
        'con una clave de longitud incorrecta',
        Buffer.alloc(16).toString('base64'),
      ],
    ])('%s no registra nada y el login sigue como antes', async (_, key) => {
      const { service, rows, openmaint } = buildHarness({
        APP_SESSION_KEY: key,
      });

      await service.onModuleInit();
      await service.register(issued('sesion-a'), true);

      expect(service.isEnabled()).toBe(false);
      expect(rows).toHaveLength(0);
      // Cerrar sesión sí se cierra en openMAINT: no depende del registro.
      await service.close('sesion-a');
      expect(openmaint.logout).toHaveBeenCalledWith('sesion-a');
    });
  });

  describe('register', () => {
    it('guarda el id cifrado y su huella, nunca en claro', async () => {
      const { service, rows } = buildHarness();

      await service.register(issued('sesion-secreta-123'), true);

      const [row] = rows;
      expect(row.sessionHash).toBe(
        createHash('sha256').update('sesion-secreta-123').digest('hex'),
      );
      expect(row.sessionEnc).not.toContain('sesion-secreta-123');
      expect(row.remember).toBe(true);
    });

    it('la recordada dura 30 días sin uso; la otra, uno', async () => {
      const { service, rows } = buildHarness();

      await service.register(issued('recordada'), true);
      await service.register(issued('pasajera'), false);

      expect(rows[0].expiresAt.getTime()).toBe(T0.getTime() + REMEMBER_MS);
      expect(rows[1].expiresAt.getTime()).toBe(T0.getTime() + TRANSIENT_MS);
    });
  });

  describe('la base no se despierta sin motivo', () => {
    // Es la razón de ser de la caché: Neon cobra por tiempo despierto y una
    // consulta cada 20 minutos lo mantendría activo las 24 horas.
    it('las pasadas de keepalive no consultan la base', async () => {
      const { service, repository, openmaint } = buildHarness();
      await service.onModuleInit();
      await service.register(issued('recordada'), true);
      const before = dbCalls(repository);

      for (let pass = 1; pass <= 6; pass += 1) {
        jest.setSystemTime(T0.getTime() + pass * 20 * 60 * 1000);
        await service.keepAlive();
      }

      expect(openmaint.keepAlive).toHaveBeenCalledTimes(6);
      expect(dbCalls(repository)).toBe(before);
    });

    it('carga las sesiones una sola vez', async () => {
      const { service, repository } = buildHarness();

      await service.onModuleInit();
      await service.keepAlive();
      await service.touch('cualquiera');
      await service.purgeExpired();

      expect(repository.find).toHaveBeenCalledTimes(1);
    });

    it('la limpieza de madrugada sin vencidas no toca la base', async () => {
      const { service, repository } = buildHarness();
      await service.onModuleInit();
      await service.register(issued('recordada'), true);
      const before = dbCalls(repository);

      await service.purgeExpired();

      expect(dbCalls(repository)).toBe(before);
    });
  });

  describe('touch', () => {
    it('aplaza la caducidad en memoria cada vez y en la base una vez al día', async () => {
      const { service, rows, repository } = buildHarness();
      await service.register(issued('sesion-a'), true);

      jest.setSystemTime(T0.getTime() + 2 * HOUR_MS);
      await service.touch('sesion-a');
      expect(repository.update).not.toHaveBeenCalled();

      jest.setSystemTime(T0.getTime() + PERSIST_TOUCH_MS + HOUR_MS);
      await service.touch('sesion-a');
      expect(repository.update).toHaveBeenCalledTimes(1);
      expect(rows[0].expiresAt.getTime()).toBe(Date.now() + REMEMBER_MS);

      jest.setSystemTime(Date.now() + HOUR_MS);
      await service.touch('sesion-a');
      expect(repository.update).toHaveBeenCalledTimes(1);
    });

    it('el aplazamiento en memoria evita que la limpieza la cierre', async () => {
      const { service, rows, openmaint } = buildHarness();
      await service.register(issued('sesion-a'), false);

      // Usada a las 20 h: en la base sigue venciendo a las 24 h, en memoria no.
      jest.setSystemTime(T0.getTime() + 20 * HOUR_MS);
      await service.touch('sesion-a');
      jest.setSystemTime(T0.getTime() + 30 * HOUR_MS);
      await service.purgeExpired();

      expect(openmaint.logout).not.toHaveBeenCalled();
      expect(rows).toHaveLength(1);
    });

    it('ignora una sesión que no está registrada', async () => {
      const { service, repository } = buildHarness();

      await service.touch('desconocida');

      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('la cierra en openMAINT, la olvida y deja de mantenerla viva', async () => {
      const { service, rows, openmaint } = buildHarness();
      await service.register(issued('sesion-a'), true);

      await service.close('sesion-a');
      await service.keepAlive();

      expect(openmaint.logout).toHaveBeenCalledWith('sesion-a');
      expect(openmaint.keepAlive).not.toHaveBeenCalled();
      expect(rows).toHaveLength(0);
    });

    it('una sesión ya cerrada en openMAINT no es un error', async () => {
      const { service, rows, openmaint } = buildHarness();
      await service.register(issued('sesion-a'), true);
      openmaint.logout.mockRejectedValueOnce(httpError(401));

      await expect(service.close('sesion-a')).resolves.toBeUndefined();
      expect(rows).toHaveLength(0);
    });
  });

  describe('closeAllForUser', () => {
    it('cierra las del usuario en otros dispositivos y conserva la actual', async () => {
      const { service, rows, openmaint } = buildHarness();
      await service.register(issued('este-movil'), true);
      await service.register(issued('otro-movil'), true);
      await service.register(issued('tablet-sin-recordar'), false);
      await service.register(issued('de-otra-persona', 'pamela.calo'), true);

      const closed = await service.closeAllForUser(
        'wilmer.palma',
        'este-movil',
      );

      expect(closed).toBe(2);
      expect(openmaint.logout.mock.calls.map(([id]) => id).sort()).toEqual([
        'otro-movil',
        'tablet-sin-recordar',
      ]);
      expect(rows.map((row) => row.username).sort()).toEqual([
        'pamela.calo',
        'wilmer.palma',
      ]);
    });

    it('sin sesión que conservar las cierra todas', async () => {
      const { service, rows } = buildHarness();
      await service.register(issued('movil'), true);
      await service.register(issued('tablet'), true);

      await expect(service.closeAllForUser('wilmer.palma')).resolves.toBe(2);
      expect(rows).toHaveLength(0);
    });

    it('encuentra también las registradas antes de un reinicio', async () => {
      const previous = buildHarness();
      await previous.service.register(issued('antes-del-reinicio'), true);

      const { service, openmaint } = buildHarness({}, previous.rows);
      await service.onModuleInit();

      await expect(service.closeAllForUser('wilmer.palma')).resolves.toBe(1);
      expect(openmaint.logout).toHaveBeenCalledWith('antes-del-reinicio');
    });

    it('nunca lanza: la contraseña ya cambió', async () => {
      const { service, repository } = buildHarness();
      repository.find.mockRejectedValueOnce(new Error('db caída'));

      await expect(service.closeAllForUser('wilmer.palma')).resolves.toBe(0);
    });
  });

  describe('keepAlive (cada 20 min)', () => {
    it('mantiene vivas solo las recordadas', async () => {
      const { service, openmaint } = buildHarness();
      await service.register(issued('recordada'), true);
      await service.register(issued('pasajera'), false);

      await service.keepAlive();

      expect(openmaint.keepAlive).toHaveBeenCalledTimes(1);
      expect(openmaint.keepAlive).toHaveBeenCalledWith('recordada');
    });

    it('tras un reinicio sigue manteniendo las que había', async () => {
      const previous = buildHarness();
      await previous.service.register(issued('antes-del-reinicio'), true);

      const { service, openmaint } = buildHarness({}, previous.rows);
      await service.onModuleInit();
      await service.keepAlive();

      expect(openmaint.keepAlive).toHaveBeenCalledWith('antes-del-reinicio');
    });

    it('si la carga falló al arrancar, la reintenta en la pasada', async () => {
      const previous = buildHarness();
      await previous.service.register(issued('antes-del-reinicio'), true);

      const { service, repository, openmaint } = buildHarness(
        {},
        previous.rows,
      );
      repository.find.mockRejectedValueOnce(new Error('db dormida'));
      await service.onModuleInit();

      await service.keepAlive();

      expect(repository.find).toHaveBeenCalledTimes(2);
      expect(openmaint.keepAlive).toHaveBeenCalledWith('antes-del-reinicio');
    });

    // 400 incluido: es lo que responden las rutas `/sessions/current` a una
    // sesión que ya no existe.
    it.each([400, 401])(
      'olvida las que openMAINT ya no reconoce (%s)',
      async (status) => {
        const { service, rows, openmaint } = buildHarness();
        await service.register(issued('recordada'), true);
        openmaint.keepAlive.mockRejectedValueOnce(httpError(status));

        await service.keepAlive();
        await service.keepAlive();

        expect(rows).toHaveLength(0);
        expect(openmaint.keepAlive).toHaveBeenCalledTimes(1);
      },
    );

    it('con openMAINT caído las conserva para la siguiente pasada', async () => {
      const { service, rows, openmaint } = buildHarness();
      await service.register(issued('recordada'), true);
      openmaint.keepAlive.mockRejectedValueOnce(httpError(502));

      await service.keepAlive();
      await service.keepAlive();

      expect(rows).toHaveLength(1);
      expect(openmaint.keepAlive).toHaveBeenCalledTimes(2);
    });

    it('no mantiene viva una recordada que ya cumplió sus 30 días', async () => {
      const { service, openmaint } = buildHarness();
      await service.register(issued('olvidada'), true);

      jest.setSystemTime(T0.getTime() + REMEMBER_MS + HOUR_MS);
      await service.keepAlive();

      expect(openmaint.keepAlive).not.toHaveBeenCalled();
    });

    it('descarta una sesión que no descifra (clave rotada o manipulada)', async () => {
      const previous = buildHarness();
      await previous.service.register(issued('recordada'), true);
      previous.rows[0].sessionEnc = previous.rows[0].sessionEnc.replace(
        /.$/,
        (c) => (c === 'A' ? 'B' : 'A'),
      );

      const { service, rows, openmaint } = buildHarness({}, previous.rows);
      await service.keepAlive();

      expect(openmaint.keepAlive).not.toHaveBeenCalled();
      expect(rows).toHaveLength(0);
    });

    it('con el planificador apagado no hace nada', async () => {
      const { service, openmaint } = buildHarness({
        APP_SESSION_KEEPALIVE_ENABLED: 'false',
      });
      await service.register(issued('recordada'), true);

      await service.keepAlive();

      expect(openmaint.keepAlive).not.toHaveBeenCalled();
    });

    it('no se solapa consigo misma si una pasada tarda', async () => {
      const { service, openmaint } = buildHarness();
      await service.register(issued('recordada'), true);

      let release: () => void = () => undefined;
      const gate = new Promise<void>((resolve) => (release = resolve));
      openmaint.keepAlive.mockImplementationOnce(() => gate);

      const first = service.keepAlive();
      await service.keepAlive();
      release();
      await first;

      expect(openmaint.keepAlive).toHaveBeenCalledTimes(1);
    });
  });

  describe('purgeExpired (de madrugada)', () => {
    it('cierra en openMAINT las recordadas que llevan 30 días sin uso', async () => {
      const { service, rows, openmaint } = buildHarness();
      await service.register(issued('olvidada'), true);
      await service.register(issued('en-uso'), true);

      jest.setSystemTime(T0.getTime() + REMEMBER_MS - HOUR_MS);
      await service.touch('en-uso');
      jest.setSystemTime(T0.getTime() + REMEMBER_MS + HOUR_MS);
      await service.purgeExpired();

      expect(openmaint.logout).toHaveBeenCalledTimes(1);
      expect(openmaint.logout).toHaveBeenCalledWith('olvidada');
      expect(rows.map((row) => row.sessionHash)).toEqual([
        createHash('sha256').update('en-uso').digest('hex'),
      ]);
    });

    it('recoge las no recordadas pasado un día', async () => {
      const { service, rows } = buildHarness();
      await service.register(issued('pasajera'), false);

      jest.setSystemTime(T0.getTime() + TRANSIENT_MS - HOUR_MS);
      await service.purgeExpired();
      expect(rows).toHaveLength(1);

      jest.setSystemTime(T0.getTime() + TRANSIENT_MS + HOUR_MS);
      await service.purgeExpired();
      expect(rows).toHaveLength(0);
    });

    it('con el planificador apagado no hace nada', async () => {
      const { service, rows } = buildHarness({
        APP_SESSION_KEEPALIVE_ENABLED: 'false',
      });
      await service.register(issued('pasajera'), false);

      jest.setSystemTime(T0.getTime() + TRANSIENT_MS + HOUR_MS);
      await service.purgeExpired();

      expect(rows).toHaveLength(1);
    });
  });
});
