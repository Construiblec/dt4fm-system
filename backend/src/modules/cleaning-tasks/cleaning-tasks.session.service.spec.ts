import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AxiosError, type AxiosResponse } from 'axios';
import type { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { CleaningTasksSessionService } from './cleaning-tasks.session.service';

const PASSWORD = 'clave-de-prueba';
const COOLDOWN_MS = 5 * 60 * 1000;
const SESSION_MS = 30 * 60 * 1000;

const httpError = (status: number) =>
  new AxiosError('fallo', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    data: {},
    headers: {},
  } as AxiosResponse);

const networkError = () => new AxiosError('timeout', 'ECONNABORTED');

const loginOk = (id: string) => ({ data: { _id: id } });

describe('CleaningTasksSessionService', () => {
  let post: jest.Mock;
  let configGet: jest.Mock;
  let service: CleaningTasksSessionService;
  let logs: jest.SpyInstance[];

  beforeEach(() => {
    jest.useFakeTimers();
    logs = (['log', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(Logger.prototype, level).mockImplementation(),
    );
    post = jest.fn().mockResolvedValue(loginOk('s1'));
    configGet = jest.fn((key: string) =>
      key === 'OPENMAINT_PASSWORD' ? PASSWORD : 'svc',
    );
    service = new CleaningTasksSessionService(
      { post } as unknown as OpenmaintClient,
      { get: configGet } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('inicia sesión con plazo de 15 s', async () => {
    await service.onModuleInit();

    expect(post).toHaveBeenCalledWith(
      '/sessions?scope=service&returnId=true',
      { username: 'svc', password: PASSWORD },
      undefined,
      { timeout: 15000 },
    );
  });

  it('reutiliza la sesión vigente y la renueva al vencer', async () => {
    expect(await service.getSessionId()).toBe('s1');
    jest.advanceTimersByTime(SESSION_MS - 1);
    expect(await service.getSessionId()).toBe('s1');
    expect(post).toHaveBeenCalledTimes(1);

    post.mockResolvedValue(loginOk('s2'));
    jest.advanceTimersByTime(1);
    expect(await service.getSessionId()).toBe('s2');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('varias getSessionId simultáneas hacen un solo login', async () => {
    const ids = await Promise.all(
      Array.from({ length: 10 }, () => service.getSessionId()),
    );

    expect(ids).toEqual(Array(10).fill('s1'));
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('varias refreshSession simultáneas hacen un solo login; la siguiente, otro', async () => {
    await Promise.all(
      Array.from({ length: 10 }, () => service.refreshSession()),
    );
    expect(post).toHaveBeenCalledTimes(1);

    await service.refreshSession();
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('tras invalidarla, la siguiente llamada inicia sesión', async () => {
    await service.getSessionId();
    service.invalidateSession();
    await service.getSessionId();

    expect(post).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403])(
    'un login %i no se reintenta durante el enfriamiento y sí después',
    async (status) => {
      post.mockRejectedValue(httpError(status));

      await Promise.all([service.getSessionId(), service.refreshSession()]);
      expect(post).toHaveBeenCalledTimes(1);
      expect(service.isCoolingDown()).toBe(true);

      jest.advanceTimersByTime(COOLDOWN_MS - 1);
      await service.refreshSession();
      expect(await service.getSessionId()).toBe('');
      expect(post).toHaveBeenCalledTimes(1);

      post.mockResolvedValue(loginOk('s2'));
      jest.advanceTimersByTime(1);
      expect(service.isCoolingDown()).toBe(false);
      expect(await service.getSessionId()).toBe('s2');
      expect(post).toHaveBeenCalledTimes(2);
    },
  );

  it('un rechazo tras el enfriamiento vuelve a enfriar', async () => {
    post.mockRejectedValue(httpError(401));
    await service.refreshSession();
    jest.advanceTimersByTime(COOLDOWN_MS);
    await service.refreshSession();

    expect(post).toHaveBeenCalledTimes(2);
    expect(service.isCoolingDown()).toBe(true);
  });

  it.each([
    ['500', () => httpError(500)],
    ['de red', networkError],
    ['desconocido', () => new Error('otro')],
  ])('un fallo %s no rechaza ni enfría', async (_name, build) => {
    post.mockRejectedValueOnce(build());

    await expect(service.refreshSession()).resolves.toBeUndefined();
    expect(service.isCoolingDown()).toBe(false);
    expect(await service.getSessionId()).toBe('s1');
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('no rechaza sin id en la respuesta, sin respuesta o si falla la configuración', async () => {
    post.mockResolvedValueOnce({ data: {} }).mockResolvedValueOnce(undefined);
    expect(await service.getSessionId()).toBe('');
    expect(await service.getSessionId()).toBe('');

    configGet.mockImplementationOnce(() => {
      throw new Error('config');
    });
    expect(await service.getSessionId()).toBe('');

    expect(service.isCoolingDown()).toBe(false);
    expect(await service.getSessionId()).toBe('s1');
  });

  it('ni el id de sesión ni la contraseña llegan al log', async () => {
    post.mockResolvedValueOnce(loginOk('id-secreto'));
    await service.refreshSession();
    post.mockRejectedValueOnce(httpError(401));
    await service.refreshSession();

    const text = JSON.stringify(
      logs.flatMap((spy) => spy.mock.calls as unknown[][]),
    );
    expect(text).toContain('Credencial de servicio rechazada');
    expect(text).not.toContain('id-secreto');
    expect(text).not.toContain(PASSWORD);
  });
});
