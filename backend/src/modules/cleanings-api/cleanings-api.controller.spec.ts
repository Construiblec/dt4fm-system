import {
  BadGatewayException,
  GatewayTimeoutException,
  INestApplication,
  NotFoundException,
  ServiceUnavailableException,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import type { Server } from 'http';
import request from 'supertest';
import { validationPipeOptions } from '../../config/validation.config';
import { CleaningReadService } from '../cleaning-tasks/cleaning-read.service';
import type { CleaningReadContract } from '../cleaning-tasks/cleaning-read.types';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import { CleaningsApiController } from './cleanings-api.controller';
import { CleaningsCacheService } from './cleanings-cache.service';

const KEY = 'k'.repeat(32);
const BASE = '/integrations/v1/cleanings';
const PHOTO = `${BASE}/7/supervisions/8/findings/9/photos`;

describe('CleaningsApiController', () => {
  let app: INestApplication;
  let limiter: { hit: jest.Mock };
  let reader: Record<keyof CleaningReadContract, jest.Mock>;

  const get = (path: string) =>
    request(app.getHttpServer() as Server)
      .get(path)
      .set('x-api-key', KEY);

  const listOf = (count: number, total: number | null) =>
    ({
      items: Array.from({ length: count }, (_, i) => ({ id: i + 1 })),
      total,
    }) as unknown as Awaited<ReturnType<CleaningReadContract['list']>>;

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
      findingPhoto: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [CleaningsApiController],
      providers: [
        CleaningsCacheService,
        { provide: RateLimiterService, useValue: limiter },
        { provide: CleaningReadService, useValue: reader },
        {
          provide: ConfigService,
          useValue: { get: () => `agente:${KEY}` },
        },
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
      expect(reader.list).toHaveBeenCalledWith({ limit: 50, offset: 0 });
    });

    it('convierte los filtros y lleva los instantes a UTC', async () => {
      await get(BASE)
        .query({
          phase: 'Completed',
          date: '2028-02-29',
          plannedFrom: '2026-11-16T00:00-05:00',
          plannedTo: '2026-11-17T05:00:00.5Z',
          endedFrom: '2026-11-16T05:00:00Z',
          endedTo: '2026-11-16T10:00:00+04:30',
          employeeId: '4',
          unitId: '5',
          limit: '100',
          offset: '20',
        })
        .expect(200);

      expect(reader.list).toHaveBeenCalledWith({
        phase: 'Completed',
        date: '2028-02-29',
        plannedFrom: '2026-11-16T05:00:00.000Z',
        plannedTo: '2026-11-17T05:00:00.500Z',
        endedFrom: '2026-11-16T05:00:00.000Z',
        endedTo: '2026-11-16T05:30:00.000Z',
        employeeId: 4,
        unitId: 5,
        limit: 100,
        offset: 20,
      });
    });

    it.each([
      'fase=x',
      'sort=newest',
      'phase=',
      'phase=Paused',
      'phase=Assigned&phase=Completed',
      'phase[]=Assigned',
      'date=',
      'date=2026-02-31',
      'date=2026-2-1',
      'date=2026-02-01T00:00:00Z',
      'plannedFrom=',
      'plannedFrom=2026-11-16',
      'plannedFrom=2026-11-16T00:00:00',
      'plannedFrom=2026-02-31T00:00:00Z',
      'plannedFrom=2026-11-16T24:00:00Z',
      'plannedFrom=2026-11-16T00:00:00Z&plannedFrom=2026-11-17T00:00:00Z',
      'plannedFrom=2026-11-17T00:00:00Z&plannedTo=2026-11-16T00:00:00Z',
      'plannedFrom=2026-11-17T00:00:00Z&plannedTo=2026-11-17T00:00:00Z',
      'endedFrom=2026-11-17T00:00:00-05:00&endedTo=2026-11-17T05:00:00Z',
      'endedTo=mañana',
      'employeeId=',
      'employeeId=0',
      'employeeId=-1',
      'employeeId=1.5',
      'employeeId=0x10',
      'employeeId=1e2',
      'employeeId=1&employeeId=2',
      'employeeId=99999999999999999999',
      'unitId=0',
      'unitId=%201',
      'limit=',
      'limit=0',
      'limit=101',
      'offset=-1',
      'offset=',
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
      ['más allá del final', 0, 4, 'limit=2&offset=8', null],
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

    it('una sola lectura para consultas equivalentes, simultáneas o seguidas', async () => {
      const paths = [
        `${BASE}?unitId=3&endedFrom=2026-11-16T05:00:00Z`,
        `${BASE}?endedFrom=2026-11-16T00:00:00-05:00&unitId=3&limit=50`,
      ];

      await Promise.all(paths.map((path) => get(path).expect(200)));
      await get(paths[0]).expect(200);
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

  describe('detalle', () => {
    it('devuelve { data } y lo cachea', async () => {
      const res = await get(`${BASE}/7`).expect(200);
      await get(`${BASE}/7`).expect(200);

      expect(res.body).toEqual({ data: { id: 7 } });
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(reader.detail).toHaveBeenCalledTimes(1);
      expect(reader.detail).toHaveBeenCalledWith(7);
    });

    it.each([
      '0',
      '-1',
      'abc',
      '1.5',
      '1e2',
      '0x10',
      '1.0',
      '+1',
      '99999999999999999999',
      '7?x=1',
      '7?x=',
    ])('400 con /%s', async (path) => {
      await get(`${BASE}/${path}`).expect(400);
      expectNoReads();
    });

    it.each([
      [404, new NotFoundException('La limpieza no existe')],
      [502, new BadGatewayException('No se pudo leer')],
      [503, new ServiceUnavailableException('Sin sesión')],
      [504, new GatewayTimeoutException('Plazo agotado')],
    ])('propaga %i', async (status, error) => {
      reader.detail.mockRejectedValue(error);

      const res = await get(`${BASE}/7`).expect(status);

      expect((res.body as { message: string }).message).toBe(error.message);
      expect(res.headers['cache-control']).toBe('private, no-store');
    });
  });

  describe('descargas', () => {
    const file = (contentType: string, fileName: string | null) => ({
      data: Buffer.from('bytes'),
      contentType,
      fileName,
    });

    it('entrega el archivo con cabeceras seguras y sin caché', async () => {
      reader.attachment.mockResolvedValue(
        file('image/JPEG; charset=x', "baño (1)*'a.jpg"),
      );

      const res = await get(`${BASE}/7/attachments/ab-1_2;1.0`).expect(200);
      await get(`${BASE}/7/attachments/ab-1_2;1.0`).expect(200);

      expect(reader.attachment).toHaveBeenCalledTimes(2);
      expect(reader.attachment).toHaveBeenCalledWith(7, 'ab-1_2;1.0');
      expect(res.headers).toMatchObject({
        'content-type': 'image/jpeg',
        'content-length': '5',
        'content-disposition':
          "attachment; filename*=UTF-8''ba%C3%B1o%20%281%29%2A%27a.jpg",
        'x-content-type-options': 'nosniff',
        'cache-control': 'private, no-store',
      });
      expect(Buffer.from(res.body as Buffer).toString()).toBe('bytes');
    });

    it.each([
      ['image/png', 'image/png'],
      ['image/heic', 'image/heic'],
      ['image/heif', 'image/heif'],
      ['image/svg+xml', 'application/octet-stream'],
      ['text/html', 'application/octet-stream'],
      ['', 'application/octet-stream'],
    ])('tipo %s se sirve como %s', async (type, expected) => {
      reader.findingPhoto.mockResolvedValue(file(type, 'x'));

      const res = await get(`${PHOTO}/f1`).expect(200);

      expect(res.headers['content-type']).toBe(expected);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(reader.findingPhoto).toHaveBeenCalledWith(7, 8, 9, 'f1');
    });

    it.each([
      [null, 'archivo'],
      ['a\r\nX-Mal: 1.jpg', 'aX-Mal%3A%201.jpg'],
      ['a";b.jpg', 'a%22%3Bb.jpg'],
      ['../x\\y.jpg', '.._x_y.jpg'],
      ['\uD800.jpg', '%EF%BF%BD.jpg'],
    ])('nombre hostil %j', async (name, encoded) => {
      reader.attachment.mockResolvedValue(file('image/png', name));

      const res = await get(`${BASE}/7/attachments/f1`).expect(200);

      expect(res.headers['content-disposition']).toBe(
        `attachment; filename*=UTF-8''${encoded}`,
      );
      expect(res.headers['x-mal']).toBeUndefined();
    });

    it.each([
      '..%2F..%2Fclasses',
      'a%2Fb',
      'a%5Cb',
      'a..b',
      '.oculto',
      'a%00b',
      'a%0Ab',
      'a%0A',
      'a%20b',
      'a%252Fb',
      'a%3Fb',
      'a%23b',
      'x'.repeat(201),
    ])('400 con id de archivo %s', async (id) => {
      await get(`${BASE}/7/attachments/${id}`).expect(400);
      await get(`${PHOTO}/${id}`).expect(400);
      expectNoReads();
    });

    it.each([
      `${BASE}/0/attachments/f1`,
      `${BASE}/7/attachments/f1?token=x`,
      `${BASE}/7/supervisions/0/findings/9/photos/f1`,
      `${BASE}/7/supervisions/8/findings/x/photos/f1`,
      `${PHOTO}/f1?size=`,
    ])('400 en %s', async (path) => {
      await get(path).expect(400);
      expectNoReads();
    });

    it.each([404, 502, 503, 504])('propaga %i', async (status) => {
      const error = {
        404: new NotFoundException('x'),
        502: new BadGatewayException('x'),
        503: new ServiceUnavailableException('x'),
        504: new GatewayTimeoutException('x'),
      }[status];
      reader.attachment.mockRejectedValue(error);

      await get(`${BASE}/7/attachments/f1`).expect(status);
    });
  });

  it('Swagger documenta los filtros y la clave', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const { get: operation } = doc.paths[BASE];
    const names = (operation?.parameters as { name: string }[]).map(
      (p) => p.name,
    );

    expect(names.sort()).toEqual([
      'date',
      'employeeId',
      'endedFrom',
      'endedTo',
      'limit',
      'offset',
      'phase',
      'plannedFrom',
      'plannedTo',
      'unitId',
    ]);
    expect(operation?.security).toEqual([{ 'x-api-key': [] }]);
    expect(
      (
        doc.paths[`${BASE}/{id}/attachments/{attachmentId}`].get
          ?.parameters as { name: string }[]
      ).map((p) => p.name),
    ).toEqual(expect.arrayContaining(['id', 'attachmentId']));
  });
});
