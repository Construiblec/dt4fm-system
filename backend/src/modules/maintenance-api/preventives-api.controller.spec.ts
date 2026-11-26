import {
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
import { PreventivesApiController } from './preventives-api.controller';

const KEY = 'k'.repeat(32);
const BASE = '/integrations/v1/preventives';

describe('PreventivesApiController', () => {
  let app: INestApplication;
  let reader: Record<keyof MaintenanceReadContract, jest.Mock>;

  const get = (path: string) =>
    request(app.getHttpServer() as Server)
      .get(path)
      .set('x-api-key', KEY);

  beforeEach(async () => {
    reader = {
      list: jest.fn().mockResolvedValue({ items: [{ id: 1 }], total: 1 }),
      detail: jest.fn().mockResolvedValue({ id: 7 }),
      attachment: jest.fn(),
      technicians: jest.fn(),
      categories: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [PreventivesApiController],
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
    await request(app.getHttpServer() as Server)
      .get(BASE)
      .expect(401);
    expect(reader.list).not.toHaveBeenCalled();
  });

  it('convierte los filtros y lleva los instantes a UTC', async () => {
    const res = await get(BASE)
      .query({
        status: 'Acceptance',
        assigned: 'true',
        employeeId: '4',
        teamId: '5',
        buildingId: '6',
        assetId: '7',
        planId: '8',
        openedFrom: '2026-11-16T00:00-05:00',
        plannedFrom: '2026-11-16T05:00:00Z',
        plannedTo: '2026-11-17T05:00:00Z',
        dueFrom: '2026-11-16T00:00:00-05:00',
        dueTo: '2026-11-30T05:00:00Z',
        startedTo: '2026-11-17T05:00:00Z',
        endedFrom: '2026-11-16T05:00:00Z',
        limit: '10',
        offset: '10',
      })
      .expect(200);

    expect(reader.list).toHaveBeenCalledWith('preventive', {
      status: 'Acceptance',
      assigned: true,
      employeeId: 4,
      teamId: 5,
      buildingId: 6,
      assetId: 7,
      planId: 8,
      openedFrom: '2026-11-16T05:00:00.000Z',
      plannedFrom: '2026-11-16T05:00:00.000Z',
      plannedTo: '2026-11-17T05:00:00.000Z',
      dueFrom: '2026-11-16T05:00:00.000Z',
      dueTo: '2026-11-30T05:00:00.000Z',
      startedTo: '2026-11-17T05:00:00.000Z',
      endedFrom: '2026-11-16T05:00:00.000Z',
      limit: 10,
      offset: 10,
    });
    expect(res.body).toEqual({
      data: [{ id: 1 }],
      meta: { total: 1, limit: 10, offset: 10, nextOffset: null },
    });
  });

  it.each([
    'status=Assigned',
    'status=Assignment',
    'status=Acceptance,Execution',
    'unitId=1',
    'priority=High',
    'assetId=0',
    'planId=x',
    'dueFrom=2026-11-16',
    'dueFrom=2026-11-17T00:00:00Z&dueTo=2026-11-16T00:00:00Z',
    'assigned=false&employeeId=4',
    'limit=101',
  ])('400 con ?%s', async (query) => {
    await get(`${BASE}?${query}`).expect(400);
    expect(reader.list).not.toHaveBeenCalled();
  });

  it('ficha y descarga usan el tipo preventive', async () => {
    reader.attachment.mockResolvedValue({
      data: Buffer.from('pdf'),
      contentType: 'application/pdf',
      fileName: 'manual.pdf',
    });

    await get(`${BASE}/7`).expect(200);
    const res = await get(`${BASE}/7/attachments/a1`).expect(200);

    expect(reader.detail).toHaveBeenCalledWith('preventive', 7);
    expect(reader.attachment).toHaveBeenCalledWith('preventive', 7, 'a1');
    expect(res.headers['content-type']).toMatch(/^application\/octet-stream/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('404 si no existe', async () => {
    reader.detail.mockRejectedValue(new NotFoundException('no'));

    await get(`${BASE}/9`).expect(404);
  });

  it('400 con id inválido', async () => {
    await get(`${BASE}/1e2`).expect(400);
    await get(`${BASE}/0/attachments/a1`).expect(400);
  });
});
