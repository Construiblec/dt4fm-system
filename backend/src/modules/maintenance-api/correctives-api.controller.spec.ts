import {
  BadGatewayException,
  INestApplication,
  NotFoundException,
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
import { CorrectivesApiController } from './correctives-api.controller';

const KEY = 'k'.repeat(32);
const BASE = '/integrations/v1/correctives';

describe('CorrectivesApiController', () => {
  let app: INestApplication;
  let limiter: { hit: jest.Mock };
  let reader: Record<keyof MaintenanceReadContract, jest.Mock>;

  const get = (path: string) =>
    request(app.getHttpServer() as Server)
      .get(path)
      .set('x-api-key', KEY);

  const listOf = (count: number, total: number | null) => ({
    items: Array.from({ length: count }, (_, i) => ({ id: i + 1 })),
    total,
  });

  const expectNoReads = () => {
    for (const method of Object.values(reader)) {
      expect(method).not.toHaveBeenCalled();
    }
  };

  beforeEach(async () => {
    limiter = { hit: jest.fn().mockReturnValue(true) };
    reader = {
      list: jest.fn().mockResolvedValue(listOf(1, 1)),
      detail: jest.fn().mockResolvedValue({ id: 7 }),
      attachment: jest.fn(),
      technicians: jest.fn(),
      categories: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [CorrectivesApiController],
      providers: [
        MaintenanceCacheService,
        { provide: RateLimiterService, useValue: limiter },
        { provide: MaintenanceReadService, useValue: reader },
        { provide: ConfigService, useValue: { get: () => `agente:${KEY}` } },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(validationPipeOptions));
    await app.init();
  });

  afterEach(() => app.close());

  it('401 sin clave y 429 con cupo agotado, sin leer nada', async () => {
    await request(app.getHttpServer() as Server)
      .get(BASE)
      .expect(401);

    limiter.hit.mockReturnValue(false);
    await get(BASE).expect(429).expect('Retry-After', '60');
    expectNoReads();
  });

  describe('listado', () => {
    it('usa los valores por defecto', async () => {
      const res = await get(BASE).expect(200);

      expect(res.body).toEqual({
        data: [{ id: 1 }],
        meta: { total: 1, limit: 50, offset: 0, nextOffset: null },
      });
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(reader.list).toHaveBeenCalledWith('corrective', {
        limit: 50,
        offset: 0,
      });
    });

    it('convierte los filtros y lleva los instantes a UTC', async () => {
      await get(BASE)
        .query({
          status: 'Assigned',
          assigned: 'true',
          employeeId: '4',
          teamId: '5',
          buildingId: '6',
          unitId: '7',
          priority: 'High',
          categoryId: '2',
          subcategoryId: '21',
          openedFrom: '2026-11-16T00:00-05:00',
          openedTo: '2026-11-17T05:00:00.5Z',
          plannedFrom: '2026-11-16T05:00:00Z',
          plannedTo: '2026-11-16T10:00:00+04:30',
          startedFrom: '2026-11-16T05:00:00Z',
          startedTo: '2026-11-17T05:00:00Z',
          endedFrom: '2026-11-16T05:00:00Z',
          endedTo: '2026-11-17T05:00:00Z',
          limit: '100',
          offset: '20',
        })
        .expect(200);

      expect(reader.list).toHaveBeenCalledWith('corrective', {
        status: 'Assigned',
        assigned: true,
        employeeId: 4,
        teamId: 5,
        buildingId: 6,
        unitId: 7,
        priority: 'High',
        categoryId: 2,
        subcategoryId: 21,
        openedFrom: '2026-11-16T05:00:00.000Z',
        openedTo: '2026-11-17T05:00:00.500Z',
        plannedFrom: '2026-11-16T05:00:00.000Z',
        plannedTo: '2026-11-16T05:30:00.000Z',
        startedFrom: '2026-11-16T05:00:00.000Z',
        startedTo: '2026-11-17T05:00:00.000Z',
        endedFrom: '2026-11-16T05:00:00.000Z',
        endedTo: '2026-11-17T05:00:00.000Z',
        limit: 100,
        offset: 20,
      });
    });

    it.each([
      'estado=x',
      'sort=newest',
      'status=',
      'status=Paused',
      'status=Planning',
      'status=assigned',
      'status=Assigned,Execution',
      'status=Assigned&status=Execution',
      'priority=Urgent',
      'priority=',
      'assigned=',
      'assigned=1',
      'assigned=TRUE',
      'assigned=false&employeeId=4',
      'employeeId=4&assigned=false',
      'employeeId=0',
      'employeeId=1e2',
      'employeeId=1&employeeId=2',
      'teamId=0',
      'buildingId=-1',
      'unitId=0',
      'categoryId=x',
      'subcategoryId=0',
      'openedFrom=2026-11-16',
      'openedFrom=2026-11-16T00:00:00',
      'openedFrom=2026-11-17T00:00:00Z&openedTo=2026-11-16T00:00:00Z',
      'plannedFrom=2026-11-17T00:00:00Z&plannedTo=2026-11-17T00:00:00Z',
      'startedTo=mañana',
      'endedFrom=2026-11-17T00:00:00-05:00&endedTo=2026-11-17T05:00:00Z',
      'dueFrom=2026-11-16T00:00:00Z',
      'assetId=1',
      'limit=0',
      'limit=101',
      'limit=',
      'offset=-1',
    ])('400 con ?%s', async (query) => {
      const res = await get(`${BASE}?${encodeURI(decodeURI(query))}`).expect(
        400,
      );

      expect(JSON.stringify(res.body)).not.toMatch(/openmaint/i);
      expectNoReads();
    });

    it.each([
      ['quedan más', 2, 5, 'limit=2&offset=2', 4],
      ['última página exacta', 2, 4, 'limit=2&offset=2', null],
      ['sin total y página llena', 2, null, 'limit=2', 2],
      ['sin total y página incompleta', 1, null, 'limit=2', null],
    ])('nextOffset: %s', async (_case, count, total, query, expected) => {
      reader.list.mockResolvedValue(listOf(count, total));

      const res = await get(`${BASE}?${query}`).expect(200);
      const body = res.body as {
        meta: { total: number | null; nextOffset: number | null };
      };

      expect(body.meta.total).toBe(total);
      expect(body.meta.nextOffset).toBe(expected);
    });

    it('una sola lectura para consultas equivalentes', async () => {
      const paths = [
        `${BASE}?unitId=3&endedFrom=2026-11-16T05:00:00Z`,
        `${BASE}?endedFrom=2026-11-16T00:00:00-05:00&unitId=3&limit=50`,
      ];

      await Promise.all(paths.map((path) => get(path).expect(200)));
      expect(reader.list).toHaveBeenCalledTimes(1);

      await get(`${BASE}?unitId=4`).expect(200);
      expect(reader.list).toHaveBeenCalledTimes(2);
    });

    it('un fallo no queda en caché', async () => {
      reader.list.mockRejectedValueOnce(new BadGatewayException('falló'));

      await get(BASE).expect(502);
      await get(BASE).expect(200);
    });
  });

  describe('ficha', () => {
    it('devuelve { data } y la cachea', async () => {
      const res = await get(`${BASE}/7`).expect(200);
      await get(`${BASE}/7`).expect(200);

      expect(res.body).toEqual({ data: { id: 7 } });
      expect(reader.detail).toHaveBeenCalledTimes(1);
      expect(reader.detail).toHaveBeenCalledWith('corrective', 7);
    });

    it.each(['0', '-1', 'abc', '1.5', '1e2', '0x10', '+1', '7?x=1', '7?x='])(
      '400 con /%s',
      async (path) => {
        await get(`${BASE}/${path}`).expect(400);
        expectNoReads();
      },
    );

    it('404 si no existe', async () => {
      reader.detail.mockRejectedValue(new NotFoundException('no'));

      await get(`${BASE}/8`).expect(404);
    });
  });

  describe('descarga', () => {
    it('envía el archivo con cabeceras seguras', async () => {
      reader.attachment.mockResolvedValue({
        data: Buffer.from('abc'),
        contentType: 'text/html',
        fileName: 'a"\r\nb.html',
      });

      const res = await get(`${BASE}/7/attachments/att-1%3B1.0`).expect(200);

      expect(reader.attachment).toHaveBeenCalledWith(
        'corrective',
        7,
        'att-1;1.0',
      );
      expect(res.headers['content-type']).toMatch(/^application\/octet-stream/);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['content-disposition']).toMatch(
        /^attachment; filename\*=UTF-8''/,
      );
      expect(res.headers['content-disposition']).not.toMatch(/[\r\n"]/);
    });

    it('permite imágenes', async () => {
      reader.attachment.mockResolvedValue({
        data: Buffer.from('x'),
        contentType: 'image/jpeg',
        fileName: 'f.jpg',
      });

      const res = await get(`${BASE}/7/attachments/a1`).expect(200);

      expect(res.headers['content-type']).toMatch(/^image\/jpeg/);
    });

    it('404 si el adjunto no es de la orden', async () => {
      reader.attachment.mockRejectedValue(new NotFoundException('no'));

      await get(`${BASE}/7/attachments/a1`).expect(404);
    });

    it('400 con un id de archivo inválido o parámetros', async () => {
      await get(`${BASE}/7/attachments/a1?x=1`).expect(400);
      await get(`${BASE}/0/attachments/a1`).expect(400);
      expectNoReads();
    });
  });
});
