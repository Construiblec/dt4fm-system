import {
  INestApplication,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { validationPipeOptions } from '../../config/validation.config';
import { MaintenanceCacheService } from '../integrations-api/maintenance-cache.service';
import type { MaintenanceReadContract } from '../maintenance-supervision/maintenance-integration.types';
import { MaintenanceReadService } from '../maintenance-supervision/maintenance-read.service';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import { MaintenanceSupportController } from './maintenance-support.controller';

const KEY = 'k'.repeat(32);
const BASE = '/integrations/v1';

describe('MaintenanceSupportController', () => {
  let app: INestApplication;
  let reader: Record<keyof MaintenanceReadContract, jest.Mock>;

  const get = (path: string) =>
    request(app.getHttpServer() as Server)
      .get(path)
      .set('x-api-key', KEY);

  beforeEach(async () => {
    reader = {
      list: jest.fn(),
      detail: jest.fn(),
      attachment: jest.fn(),
      technicians: jest.fn().mockResolvedValue([{ id: 9 }]),
      categories: jest.fn().mockResolvedValue([{ id: 2 }]),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [MaintenanceSupportController],
      providers: [
        MaintenanceCacheService,
        { provide: RateLimiterService, useValue: { hit: () => true } },
        { provide: MaintenanceReadService, useValue: reader },
        { provide: ConfigService, useValue: { get: () => `agente:${KEY}` } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    await app.init();
  });

  afterEach(() => app.close());

  it('401 sin clave', async () => {
    for (const path of ['/technicians', '/corrective-categories']) {
      await request(app.getHttpServer() as Server)
        .get(`${BASE}${path}`)
        .expect(401);
    }
    expect(reader.technicians).not.toHaveBeenCalled();
    expect(reader.categories).not.toHaveBeenCalled();
  });

  describe('technicians', () => {
    it('sin rango usa hoy y mañana, y lo devuelve en meta', async () => {
      const res = await get(`${BASE}/technicians`).expect(200);
      const body = res.body as {
        data: unknown;
        meta: { from: string; to: string };
      };
      const { from, to } = body.meta;

      expect(Date.parse(to) - Date.parse(from)).toBe(2 * 24 * 60 * 60 * 1000);
      expect(reader.technicians).toHaveBeenCalledWith({ from, to });
      expect(body.data).toEqual([{ id: 9 }]);
    });

    it('con rango lo lleva a UTC', async () => {
      const res = await get(
        `${BASE}/technicians?from=2026-11-16T00:00:00-05:00&to=2026-11-18T00:00:00-05:00`,
      ).expect(200);

      expect((res.body as { meta: unknown }).meta).toEqual({
        from: '2026-11-16T05:00:00.000Z',
        to: '2026-11-18T05:00:00.000Z',
      });
    });

    it.each([
      'from=2026-11-16T00:00:00Z',
      'to=2026-11-16T00:00:00Z',
      'from=2026-11-16',
      'from=2026-11-17T00:00:00Z&to=2026-11-16T00:00:00Z',
      'from=2026-11-01T00:00:00Z&to=2026-11-16T00:00:01Z',
      'overlap=true',
    ])('400 con ?%s', async (query) => {
      await get(`${BASE}/technicians?${query}`).expect(400);
      expect(reader.technicians).not.toHaveBeenCalled();
    });

    it('acepta exactamente 14 días', async () => {
      await get(
        `${BASE}/technicians?from=2026-11-01T00:00:00Z&to=2026-11-15T00:00:00Z`,
      ).expect(200);
    });

    it('503 sin equipo configurado y sin cachear el fallo', async () => {
      reader.technicians.mockRejectedValueOnce(
        new ServiceUnavailableException(
          'El equipo de mantenimiento no está configurado',
        ),
      );
      const url = `${BASE}/technicians?from=2026-11-01T00:00:00Z&to=2026-11-02T00:00:00Z`;

      const res = await get(url).expect(503);
      await get(url).expect(200);

      expect(JSON.stringify(res.body)).toContain('no está configurado');
    });
  });

  describe('corrective-categories', () => {
    it('devuelve { data } y lo cachea', async () => {
      const res = await get(`${BASE}/corrective-categories`).expect(200);
      await get(`${BASE}/corrective-categories`).expect(200);

      expect(res.body).toEqual({ data: [{ id: 2 }] });
      expect(reader.categories).toHaveBeenCalledTimes(1);
    });

    it('400 con parámetros', async () => {
      await get(`${BASE}/corrective-categories?x=1`).expect(400);
      expect(reader.categories).not.toHaveBeenCalled();
    });
  });
});
