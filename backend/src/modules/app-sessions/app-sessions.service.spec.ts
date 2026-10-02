import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { FindOperator, Repository } from 'typeorm';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';
import {
  AppSessionsService,
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
const memoryRepository = () => {
  const rows: AppSession[] = [];
  let nextId = 1;

  const matches = (row: AppSession, where: Where = {}) =>
    Object.entries(where).every(([field, expected]) => {
      const actual = row[field as keyof AppSession];

      if (expected instanceof FindOperator) {
        const value = expected.value as Date;
        if (expected.type === 'lessThan') return actual < value;
        if (expected.type === 'moreThanOrEqual') return actual >= value;
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
    findOne: jest.fn(({ where }: { where: Where }) =>
      Promise.resolve(rows.find((row) => matches(row, where)) ?? null),
    ),
    find: jest.fn(({ where, take }: { where?: Where; take?: number }) =>
      Promise.resolve(
        rows.filter((row) => matches(row, where)).slice(0, take ?? rows.length),
      ),
    ),
    save: jest.fn((row: AppSession) => Promise.resolve(row)),
    delete: jest.fn((where: Where) => {
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (matches(rows[i], where)) rows.splice(i, 1);
      }
      return Promise.resolve();
    }),
  };

  return { rows, repository };
};

const buildHarness = (env: Record<string, string> = {}) => {
  const { rows, repository } = memoryRepository();

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

  describe('touch', () => {
    it('abrir la app aplaza la caducidad desde ese momento', async () => {
      const { service, rows } = buildHarness();
      await service.register(issued('sesion-a'), true);

      jest.setSystemTime(T0.getTime() + 10 * 24 * HOUR_MS);
      await service.touch('sesion-a');

      expect(rows[0].lastUsedAt.getTime()).toBe(Date.now());
      expect(rows[0].expiresAt.getTime()).toBe(Date.now() + REMEMBER_MS);
    });

    it('ignora una sesión que no está registrada', async () => {
      const { service, repository } = buildHarness();

      await service.touch('desconocida');

      expect(repository.save).not.toHaveBeenCalled();
    });
  });

  describe('close', () => {
    it('la cierra en openMAINT y la saca del registro', async () => {
      const { service, rows, openmaint } = buildHarness();
      await service.register(issued('sesion-a'), true);

      await service.close('sesion-a');

      expect(openmaint.logout).toHaveBeenCalledWith('sesion-a');
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

    it('nunca lanza: la contraseña ya cambió', async () => {
      const { service, repository } = buildHarness();
      repository.find.mockRejectedValueOnce(new Error('db caída'));

      await expect(service.closeAllForUser('wilmer.palma')).resolves.toBe(0);
    });
  });

  describe('keepAlive (tarea cada 20 min)', () => {
    it('mantiene vivas solo las recordadas', async () => {
      const { service, openmaint } = buildHarness();
      await service.register(issued('recordada'), true);
      await service.register(issued('pasajera'), false);

      await service.keepAlive();

      expect(openmaint.keepAlive).toHaveBeenCalledTimes(1);
      expect(openmaint.keepAlive).toHaveBeenCalledWith('recordada');
    });

    it('olvida las que openMAINT ya no reconoce', async () => {
      const { service, rows, openmaint } = buildHarness();
      await service.register(issued('recordada'), true);
      openmaint.keepAlive.mockRejectedValueOnce(httpError(401));

      await service.keepAlive();

      expect(rows).toHaveLength(0);
    });

    it('con openMAINT caído las conserva para la siguiente pasada', async () => {
      const { service, rows, openmaint } = buildHarness();
      await service.register(issued('recordada'), true);
      openmaint.keepAlive.mockRejectedValueOnce(httpError(502));

      await service.keepAlive();

      expect(rows).toHaveLength(1);
    });

    it('cierra en openMAINT las recordadas que llevan 30 días sin uso', async () => {
      const { service, rows, openmaint } = buildHarness();
      await service.register(issued('olvidada'), true);

      jest.setSystemTime(T0.getTime() + REMEMBER_MS + HOUR_MS);
      await service.keepAlive();

      expect(openmaint.logout).toHaveBeenCalledWith('olvidada');
      expect(openmaint.keepAlive).not.toHaveBeenCalled();
      expect(rows).toHaveLength(0);
    });

    it('recoge al día siguiente las no recordadas', async () => {
      const { service, rows } = buildHarness();
      await service.register(issued('pasajera'), false);

      jest.setSystemTime(T0.getTime() + TRANSIENT_MS - HOUR_MS);
      await service.keepAlive();
      expect(rows).toHaveLength(1);

      jest.setSystemTime(T0.getTime() + TRANSIENT_MS + HOUR_MS);
      await service.keepAlive();
      expect(rows).toHaveLength(0);
    });

    it('descarta una fila que no descifra (clave rotada o manipulada)', async () => {
      const { service, rows, openmaint } = buildHarness();
      await service.register(issued('recordada'), true);
      rows[0].sessionEnc = rows[0].sessionEnc.replace(/.$/, (c) =>
        c === 'A' ? 'B' : 'A',
      );

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
});
