import {
  INestApplication,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { validationPipeOptions } from '../../config/validation.config';
import { CleaningPlanningService } from '../cleaning-tasks/cleaning-planning.service';
import { CleaningSyncService } from '../cleaning-tasks/cleaning-sync.service';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import { CleaningsCacheService } from './cleanings-cache.service';
import { CleaningsPlanningController } from './cleanings-planning.controller';
import { resolveDefaultRange } from '../integrations-api/utils/default-range.util';

const READ = 'r'.repeat(32);
const WRITE = 'w'.repeat(32);
const ROOT = '/integrations/v1';
const FROM = '2026-11-16T05:00:00.000Z';
const TO = '2026-11-18T05:00:00.000Z';

describe('CleaningsPlanningController', () => {
  let app: INestApplication;
  let planning: { listCleaners: jest.Mock; listChecklists: jest.Mock };
  let sync: { status: jest.Mock };

  const get = (path: string, key = READ) =>
    request(app.getHttpServer() as Server)
      .get(`${ROOT}/${path}`)
      .set('x-api-key', key);

  beforeEach(async () => {
    planning = {
      listCleaners: jest.fn().mockResolvedValue([{ id: 4 }]),
      listChecklists: jest.fn().mockResolvedValue([{ id: 5 }]),
    };
    sync = { status: jest.fn().mockReturnValue({ enabled: true }) };

    const env: Record<string, string> = {
      INTEGRATIONS_READ_API_KEYS: `lector:${READ}`,
      INTEGRATIONS_WRITE_API_KEYS: `editor:${WRITE}`,
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CleaningsPlanningController],
      providers: [
        CleaningsCacheService,
        { provide: RateLimiterService, useValue: { hit: () => true } },
        { provide: CleaningPlanningService, useValue: planning },
        { provide: CleaningSyncService, useValue: sync },
        {
          provide: ConfigService,
          useValue: { get: (name: string) => env[name] },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    await app.init();
  });

  afterEach(() => app.close());

  it.each(['cleaners', 'checklists', 'cleaning-sync'])(
    '%s: vale cualquiera de las dos claves y ninguna consulta extra',
    async (path) => {
      const res = await get(path).expect(200);

      expect(res.headers['cache-control']).toBe('private, no-store');
      await get(path, WRITE).expect(200);
      await get(path, 'mala').expect(401);
      await get(`${path}?x=`).expect(400);
    },
  );

  describe('operarios', () => {
    it('lleva el rango a UTC y comparte caché entre equivalentes', async () => {
      const res = await get('cleaners')
        .query({
          from: '2026-11-16T00:00:00-05:00',
          to: '2026-11-18T00:00:00-05:00',
        })
        .expect(200);
      await get('cleaners').query({ from: FROM, to: TO }).expect(200);

      expect(res.body).toEqual({
        data: [{ id: 4 }],
        meta: { from: FROM, to: TO },
      });
      expect(planning.listCleaners).toHaveBeenCalledTimes(1);
      expect(planning.listCleaners).toHaveBeenCalledWith(FROM, TO);
    });

    it('por defecto, hoy y mañana', async () => {
      const range = resolveDefaultRange({});
      const res = await get('cleaners').expect(200);

      expect((res.body as { meta: unknown }).meta).toEqual(range);
    });

    it.each([
      ['2026-11-25T23:59:59.999Z', '2026-11-25', '2026-11-27'],
      ['2026-11-26T04:59:59.999Z', '2026-11-25', '2026-11-27'],
      ['2026-11-26T05:00:00.000Z', '2026-11-26', '2026-11-28'],
      ['2026-12-31T05:00:00.000Z', '2026-12-31', '2027-01-02'],
    ])('a las %s el día local empieza el %s', (now, from, to) => {
      jest.useFakeTimers({ now: new Date(now) });

      expect(resolveDefaultRange({})).toEqual({
        from: `${from}T05:00:00.000Z`,
        to: `${to}T05:00:00.000Z`,
      });
      jest.useRealTimers();
    });

    it('acepta 14 días justos', async () => {
      await get('cleaners')
        .query({ from: FROM, to: '2026-11-30T05:00:00Z' })
        .expect(200);
    });

    it.each([
      `from=${FROM}`,
      `to=${TO}`,
      `from=${FROM}&to=`,
      `from=&to=${TO}`,
      `from=${FROM}&to=2026-11-18`,
      `from=2026-02-31T00:00:00Z&to=${TO}`,
      `from=${TO}&to=${FROM}`,
      `from=${FROM}&to=${FROM}`,
      `from=${FROM}&to=2026-11-30T05:00:00.001Z`,
      `from=${FROM}&to=${TO}&to=${TO}`,
    ])('400 con ?%s', async (query) => {
      await get(`cleaners?${query}`).expect(400);
      expect(planning.listCleaners).not.toHaveBeenCalled();
    });

    it('un fallo se propaga y no queda en caché', async () => {
      planning.listCleaners.mockRejectedValueOnce(
        new ServiceUnavailableException('Sin equipo de limpieza'),
      );

      await get('cleaners').expect(503);
      await get('cleaners').expect(200);
    });
  });

  it('checklists: { data } con caché', async () => {
    const res = await get('checklists').expect(200);
    await get('checklists').expect(200);

    expect(res.body).toEqual({ data: [{ id: 5 }] });
    expect(planning.listChecklists).toHaveBeenCalledTimes(1);
  });

  it('cleaning-sync: { data } sin caché', async () => {
    const res = await get('cleaning-sync').expect(200);
    await get('cleaning-sync').expect(200);

    expect(res.body).toEqual({ data: { enabled: true } });
    expect(sync.status).toHaveBeenCalledTimes(2);
  });

  it('Swagger documenta las rutas', () => {
    const { paths } = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const params = paths[`${ROOT}/cleaners`].get?.parameters as {
      name: string;
    }[];

    expect(Object.keys(paths).sort()).toEqual([
      `${ROOT}/checklists`,
      `${ROOT}/cleaners`,
      `${ROOT}/cleaning-sync`,
    ]);
    expect(params.map((p) => p.name).sort()).toEqual(['from', 'to']);
    expect(paths[`${ROOT}/checklists`].get?.security).toEqual([
      { 'x-api-key': [] },
    ]);
  });
});
