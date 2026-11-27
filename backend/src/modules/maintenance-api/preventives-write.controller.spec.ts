import {
  BadGatewayException,
  ConflictException,
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
import { MaintenanceCacheService } from '../integrations-api/maintenance-cache.service';
import type { MaintenancePlanningContract } from '../maintenance-supervision/maintenance-integration.types';
import { MaintenancePlanningService } from '../maintenance-supervision/maintenance-planning.service';
import { MaintenanceReadService } from '../maintenance-supervision/maintenance-read.service';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import { PreventivesApiController } from './preventives-api.controller';
import { PreventivesWriteController } from './preventives-write.controller';

const READ = 'r'.repeat(32);
const WRITE = 'w'.repeat(32);
const BASE = '/integrations/v1/preventives';
const ONE = `${BASE}/7`;
const CANCEL = `${ONE}/cancel`;
const PLANS = `${BASE}/plans`;

describe('PreventivesWriteController', () => {
  let app: INestApplication;
  let planning: Record<keyof MaintenancePlanningContract, jest.Mock>;
  let detail: jest.Mock;

  const send = (method: 'patch' | 'post', path: string, key = WRITE) =>
    request(app.getHttpServer() as Server)
      [method](path)
      .set('x-api-key', key);
  const patch = (body: object) => send('patch', ONE).send(body);
  const cancel = (body: object) => send('post', CANCEL).send(body);
  const plans = (body: object) => send('post', PLANS).send(body);
  const read = () =>
    request(app.getHttpServer() as Server)
      .get(ONE)
      .set('x-api-key', READ)
      .expect(200);

  const expectNoWrites = () => {
    for (const method of Object.values(planning)) {
      expect(method).not.toHaveBeenCalled();
    }
  };

  const expect400 = async (pending: request.Test) => {
    const res = await pending.expect(400);

    expect(JSON.stringify(res.body)).not.toMatch(/openmaint/i);
    expectNoWrites();
  };

  beforeEach(async () => {
    const applied = {
      id: 7,
      result: 'applied',
      warnings: ['started'],
      data: { id: 7 },
    };
    planning = {
      update: jest.fn().mockResolvedValue(applied),
      cancel: jest.fn().mockResolvedValue(applied),
      batch: jest.fn().mockResolvedValue([]),
    };
    detail = jest.fn().mockResolvedValue({ id: 7 });

    const env: Record<string, string> = {
      INTEGRATIONS_READ_API_KEYS: `lector:${READ}`,
      INTEGRATIONS_WRITE_API_KEYS: `editor:${WRITE}`,
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [PreventivesApiController, PreventivesWriteController],
      providers: [
        MaintenanceCacheService,
        { provide: RateLimiterService, useValue: { hit: () => true } },
        { provide: MaintenanceReadService, useValue: { detail } },
        { provide: MaintenancePlanningService, useValue: planning },
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

  it.each([
    ['patch', ONE],
    ['post', CANCEL],
    ['post', PLANS],
  ] as const)('%s %s exige clave de escritura', async (method, path) => {
    const res = await send(method, path, READ).send({}).expect(403);

    expect(res.headers['cache-control']).toBe('private, no-store');
    await send(method, path, 'mala').send({}).expect(401);
    expectNoWrites();
  });

  it.each([
    ['patch', `${ONE}?dryRun=true`, { employeeId: 4 }],
    ['post', `${CANCEL}?x=`, { reason: 'x' }],
    ['post', `${PLANS}?dryRun=true`, { changes: [{ id: 7, employeeId: 4 }] }],
    ['patch', `${BASE}/0`, { employeeId: 4 }],
    ['patch', `${BASE}/1e2`, { employeeId: 4 }],
    ['post', `${BASE}/abc/cancel`, { reason: 'x' }],
  ] as const)('400 con %s %s', async (method, path, body) => {
    await expect400(send(method, path).send(body));
  });

  it.each([
    ['patch', ONE],
    ['post', CANCEL],
    ['post', PLANS],
  ] as const)('%s %s: 400 sin un objeto JSON', async (method, path) => {
    await expect400(send(method, path));
    await expect400(send(method, path).send([]));

    for (const raw of ['null', '"x"', '{', '']) {
      await expect400(
        send(method, path).set('Content-Type', 'application/json').send(raw),
      );
    }
  });

  describe('cambiar', () => {
    it('devuelve { data, result, warnings } y pasa tipo, id y cliente', async () => {
      const res = await patch({ employeeId: 4 }).expect(200);

      expect(res.body).toEqual({
        data: { id: 7 },
        result: 'applied',
        warnings: ['started'],
      });
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(planning.update).toHaveBeenCalledWith(
        'preventive',
        7,
        { employeeId: 4 },
        'editor',
      );
    });

    it('normaliza la fecha a UTC y recorta la nota', async () => {
      await patch({
        employeeId: 4,
        plannedStartTime: '2026-11-26T10:00-05:00',
        notes: '  Urgente ',
      }).expect(200);

      expect(planning.update.mock.calls[0]).toStrictEqual([
        'preventive',
        7,
        {
          employeeId: 4,
          plannedStartTime: '2026-11-26T15:00:00.000Z',
          notes: 'Urgente',
        },
        'editor',
      ]);
    });

    it.each([
      [{}],
      [{ employeeId: null }],
      [{ plannedStartTime: null }],
      [{ notes: 'solo notas' }],
      [{ notes: null }],
      [{ employeeId: '4' }],
      [{ employeeId: 0 }],
      [{ employeeId: 1.5 }],
      [{ employeeId: [4] }],
      [{ plannedStartTime: '' }],
      [{ plannedStartTime: '2026-11-26' }],
      [{ plannedStartTime: '2026-11-26T10:00:00' }],
      [{ notes: '' }],
      [{ notes: '   ' }],
      [{ notes: 'x'.repeat(501) }],
      [{ notes: 5 }],
      [{ employeeId: 4, teamId: 5 }],
      [{ employeeId: 4, priority: 'High' }],
      [{ employeeId: 4, Assignee: 4 }],
      [{ employeeId: 4, id: 7 }],
      [{ employeeId: 4, toString: 1 }],
      [{ employeeId: 4, prototype: {} }],
    ])('400 con %j', async (body) => {
      await expect400(patch(body));
    });

    it('400 con __proto__', async () => {
      await expect400(
        send('patch', ONE)
          .set('Content-Type', 'application/json')
          .send('{"employeeId":4,"__proto__":{"a":1}}'),
      );
    });

    it.each([
      [404, new NotFoundException('El preventivo no existe')],
      [409, new ConflictException('Cerrado')],
      [502, new BadGatewayException('No se pudo guardar')],
      [503, new ServiceUnavailableException('Sin sesión')],
      [504, new GatewayTimeoutException('Plazo agotado')],
    ])('propaga %i', async (status, error) => {
      planning.update.mockRejectedValue(error);

      const res = await patch({ employeeId: 4 }).expect(status);

      expect((res.body as { message: string }).message).toBe(error.message);
    });
  });

  describe('cancelar', () => {
    it('200 con el motivo recortado', async () => {
      const res = await cancel({ reason: '  Duplicado  ' }).expect(200);

      expect(res.body).toEqual({
        data: { id: 7 },
        result: 'applied',
        warnings: ['started'],
      });
      expect(planning.cancel).toHaveBeenCalledWith(
        'preventive',
        7,
        'Duplicado',
        'editor',
      );
    });

    it.each([
      [{}],
      [{ reason: null }],
      [{ reason: '  ' }],
      [{ reason: 5 }],
      [{ reason: 'x'.repeat(501) }],
      [{ reason: 'x', status: 'Canceled' }],
    ])('400 con %j', async (body) => {
      await expect400(cancel(body));
    });

    it('propaga 409', async () => {
      planning.cancel.mockRejectedValue(new ConflictException('No'));

      await cancel({ reason: 'x' }).expect(409);
    });
  });

  describe('lote', () => {
    const change = (id: unknown, fields: object = { employeeId: 4 }) => ({
      id,
      ...fields,
    });

    it('aplica y resume por resultado', async () => {
      const results = ['applied', 'applied', 'unchanged', 'failed'].map(
        (result, i) => ({ id: i + 1, result, warnings: [], error: null }),
      );
      planning.batch.mockResolvedValue(results);

      const res = await plans({
        changes: [
          change(1, { plannedStartTime: '2026-11-26T10:00:00-05:00' }),
          change(2),
        ],
      }).expect(200);

      expect(res.body).toEqual({
        dryRun: false,
        results,
        summary: {
          applied: 2,
          unchanged: 1,
          valid: 0,
          failed: 1,
          not_attempted: 0,
        },
      });
      expect(planning.batch.mock.calls[0]).toStrictEqual([
        'preventive',
        [
          { id: 1, plannedStartTime: '2026-11-26T15:00:00.000Z' },
          { id: 2, employeeId: 4 },
        ],
        false,
        'editor',
      ]);
    });

    it('acepta 25 cambios y pasa dryRun', async () => {
      const changes = Array.from({ length: 25 }, (_, i) => change(i + 1));

      const res = await plans({ dryRun: true, changes }).expect(200);

      expect((res.body as { dryRun: boolean }).dryRun).toBe(true);
      expect(planning.batch).toHaveBeenCalledWith(
        'preventive',
        changes,
        true,
        'editor',
      );
    });

    it.each([
      ['sin changes', {}],
      ['changes null', { changes: null }],
      ['changes vacío', { changes: [] }],
      [
        'más de 25',
        { changes: Array.from({ length: 26 }, (_, i) => change(i + 1)) },
      ],
      ['ids repetidos', { changes: [change(1), change(2), change(1)] }],
      ['elemento null', { changes: [null] }],
      ['elemento número', { changes: [5] }],
      ['elemento array', { changes: [[change(1)]] }],
      ['sin id', { changes: [{ employeeId: 4 }] }],
      ['id texto', { changes: [change('1')] }],
      ['id 0', { changes: [change(0)] }],
      ['cambio sin campos', { changes: [change(1), change(2, {})] }],
      ['employeeId null', { changes: [change(1, { employeeId: null })] }],
      ['solo notas', { changes: [change(1, { notes: 'x' })] }],
      ['campo no admitido', { changes: [change(1, { teamId: 5 })] }],
      ['campo reservado', { changes: [change(1, { toString: 1 })] }],
      ['valor inválido', { changes: [change(1, { employeeId: '4' })] }],
      ['dryRun texto', { dryRun: 'true', changes: [change(1)] }],
      ['dryRun null', { dryRun: null, changes: [change(1)] }],
      ['campo desconocido', { dry_run: true, changes: [change(1)] }],
    ])('400: %s', async (_case, body) => {
      await expect400(plans(body));
    });
  });

  describe('caché de lecturas', () => {
    const changes = [{ id: 7, employeeId: 4 }];

    it.each([
      ['cambiar', () => patch({ employeeId: 4 })],
      ['cancelar', () => cancel({ reason: 'x' })],
      ['lote', () => plans({ changes })],
    ])('%s la vacía', async (_case, write) => {
      await read();
      await write().expect(200);
      await read();

      expect(detail).toHaveBeenCalledTimes(2);
    });

    it('también tras un error, pues pudo guardarse algo', async () => {
      planning.update.mockRejectedValue(new GatewayTimeoutException('x'));
      planning.batch.mockRejectedValue(new BadGatewayException('x'));

      await read();
      await patch({ employeeId: 4 }).expect(504);
      await read();
      await plans({ changes }).expect(502);
      await read();

      expect(detail).toHaveBeenCalledTimes(3);
    });

    it('no con dryRun ni con un cuerpo inválido', async () => {
      await read();
      await plans({ dryRun: true, changes }).expect(200);
      await patch({}).expect(400);
      await read();

      expect(detail).toHaveBeenCalledTimes(1);
    });
  });

  it('Swagger documenta rutas, cuerpos y permiso', () => {
    const doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().build(),
    );
    const operations = [
      doc.paths[`${BASE}/{id}`].patch,
      doc.paths[`${BASE}/{id}/cancel`].post,
      doc.paths[PLANS].post,
    ];
    const refs = operations.map((operation) => {
      const body = operation?.requestBody as unknown as {
        content: { 'application/json': { schema: { $ref: string } } };
      };

      expect(operation?.security).toEqual([{ 'x-api-key': [] }]);
      expect(Object.keys(operation?.responses ?? {})).toEqual(
        expect.arrayContaining(['200', '400', '401', '403', '429', '503']),
      );
      expect(operation?.responses).not.toHaveProperty('201');

      return body.content['application/json'].schema.$ref.split('/').at(-1);
    });

    expect(refs).toEqual([
      'PreventivePlanFieldsDto',
      'CancelMaintenanceDto',
      'PreventivePlanBatchDto',
    ]);
    expect(doc.components?.schemas?.PreventivePlanChangeDto).toMatchObject({
      required: ['id'],
      properties: {
        employeeId: { type: 'integer' },
        plannedStartTime: { format: 'date-time' },
      },
    });
    expect(
      JSON.stringify(doc.components?.schemas?.PreventivePlanFieldsDto),
    ).not.toMatch(/nullable/);
  });
});
