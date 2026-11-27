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
import { CleaningPlanningService } from '../cleaning-tasks/cleaning-planning.service';
import type { CleaningPlanningContract } from '../cleaning-tasks/cleaning-planning.types';
import { CleaningReadService } from '../cleaning-tasks/cleaning-read.service';
import { RateLimiterService } from '../password-recovery/rate-limiter.service';
import { CleaningsApiController } from './cleanings-api.controller';
import { CleaningsCacheService } from './cleanings-cache.service';
import { CleaningsWriteController } from './cleanings-write.controller';

const READ = 'r'.repeat(32);
const WRITE = 'w'.repeat(32);
const ROOT = '/integrations/v1';
const CLEANING = `${ROOT}/cleanings/7`;
const CANCEL = `${CLEANING}/cancel`;
const PLANS = `${ROOT}/plans`;

describe('CleaningsWriteController', () => {
  let app: INestApplication;
  let planning: Record<keyof CleaningPlanningContract, jest.Mock>;
  let detail: jest.Mock;

  const send = (method: 'patch' | 'post', path: string, key = WRITE) =>
    request(app.getHttpServer() as Server)
      [method](path)
      .set('x-api-key', key);
  const patch = (body: object) => send('patch', CLEANING).send(body);
  const cancel = (body: object) => send('post', CANCEL).send(body);
  const plans = (body: object) => send('post', PLANS).send(body);
  const read = () =>
    request(app.getHttpServer() as Server)
      .get(CLEANING)
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
      warnings: [{ code: 'no_schedule' }],
      data: { id: 7 },
    };
    planning = {
      update: jest.fn().mockResolvedValue(applied),
      cancel: jest.fn().mockResolvedValue(applied),
      batch: jest.fn().mockResolvedValue([]),
      listCleaners: jest.fn(),
      listChecklists: jest.fn(),
    };
    detail = jest.fn().mockResolvedValue({ id: 7 });

    const env: Record<string, string> = {
      INTEGRATIONS_READ_API_KEYS: `lector:${READ}`,
      INTEGRATIONS_WRITE_API_KEYS: `editor:${WRITE}`,
    };
    const moduleRef = await Test.createTestingModule({
      controllers: [CleaningsApiController, CleaningsWriteController],
      providers: [
        CleaningsCacheService,
        { provide: RateLimiterService, useValue: { hit: () => true } },
        { provide: CleaningReadService, useValue: { detail } },
        { provide: CleaningPlanningService, useValue: planning },
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
    ['patch', CLEANING],
    ['post', CANCEL],
    ['post', PLANS],
  ] as const)('%s %s exige clave de escritura', async (method, path) => {
    const res = await send(method, path, READ).send({}).expect(403);

    expect(res.headers['cache-control']).toBe('private, no-store');
    await send(method, path, 'mala').send({}).expect(401);
    expectNoWrites();
  });

  it.each([
    ['patch', `${CLEANING}?dryRun=true`, { observations: 'x' }],
    ['post', `${CANCEL}?x=`, { reason: 'x' }],
    [
      'post',
      `${PLANS}?dryRun=true`,
      { changes: [{ id: 7, observations: 'x' }] },
    ],
    ['patch', `${ROOT}/cleanings/0`, { observations: 'x' }],
    ['patch', `${ROOT}/cleanings/1e2`, { observations: 'x' }],
    ['post', `${ROOT}/cleanings/abc/cancel`, { reason: 'x' }],
  ] as const)('400 con %s %s', async (method, path, body) => {
    await expect400(send(method, path).send(body));
  });

  it.each([
    ['patch', CLEANING],
    ['post', CANCEL],
    ['post', PLANS],
  ] as const)('%s %s: 400 sin un objeto JSON', async (method, path) => {
    await expect400(send(method, path));
    await expect400(send(method, path).send([]));
    await expect400(send(method, path).send([{ id: 7, observations: 'x' }]));

    for (const raw of ['null', '"x"', '{', '']) {
      await expect400(
        send(method, path).set('Content-Type', 'application/json').send(raw),
      );
    }

    await expect400(
      send(method, path).set('Content-Type', 'text/plain').send('{}'),
    );
  });

  describe('cambiar', () => {
    it('devuelve { data, result, warnings } y pasa el cliente', async () => {
      const res = await patch({ employeeId: 4 }).expect(200);

      expect(res.body).toEqual({
        data: { id: 7 },
        result: 'applied',
        warnings: [{ code: 'no_schedule' }],
      });
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(planning.update).toHaveBeenCalledWith(
        7,
        { employeeId: 4 },
        'editor',
      );
    });

    it('normaliza los valores', async () => {
      await patch({
        employeeId: 4,
        plannedStartTime: '2026-11-26T10:00-05:00',
        plannedEndTime: '2026-11-26T16:00:00Z',
        checklistId: 5,
        unitId: 6,
        observations: ' ',
        checkoutDate: '2026-11-26',
        description: '  Limpieza  ',
      }).expect(200);

      expect(planning.update.mock.calls[0]).toStrictEqual([
        7,
        {
          employeeId: 4,
          plannedStartTime: '2026-11-26T15:00:00.000Z',
          plannedEndTime: '2026-11-26T16:00:00.000Z',
          checklistId: 5,
          unitId: 6,
          observations: ' ',
          checkoutDate: '2026-11-26',
          description: 'Limpieza',
        },
        'editor',
      ]);
    });

    it.each([
      'employeeId',
      'plannedStartTime',
      'plannedEndTime',
      'checklistId',
      'unitId',
      'observations',
    ])('%s: null borra y lo ausente no aparece', async (field) => {
      await patch({ [field]: null }).expect(200);

      expect(planning.update.mock.calls[0]).toStrictEqual([
        7,
        { [field]: null },
        'editor',
      ]);
    });

    it('un extremo del horario puede borrarse y el otro cambiar', async () => {
      await patch({
        plannedStartTime: '2026-11-26T15:00:00Z',
        plannedEndTime: null,
      }).expect(200);
    });

    it.each([
      [{}],
      [{ checkoutDate: null }],
      [{ description: null }],
      [{ description: '   ' }],
      [{ description: 'x'.repeat(201) }],
      [{ description: 5 }],
      [{ observations: 'x'.repeat(501) }],
      [{ observations: 5 }],
      [{ observations: ['x'] }],
      [{ employeeId: '4' }],
      [{ employeeId: 0 }],
      [{ employeeId: -1 }],
      [{ employeeId: 1.5 }],
      [{ employeeId: true }],
      [{ employeeId: [4] }],
      [{ employeeId: { id: 4 } }],
      [{ employeeId: '' }],
      [{ employeeId: Number.MAX_SAFE_INTEGER + 1 }],
      [{ checklistId: '5' }],
      [{ unitId: '6' }],
      [{ checkoutDate: '2026-02-31' }],
      [{ checkoutDate: '2026-11-26T00:00:00Z' }],
      [{ plannedStartTime: '' }],
      [{ plannedStartTime: '2026-11-26' }],
      [{ plannedStartTime: '2026-11-26T10:00:00' }],
      [{ plannedStartTime: 1764000000000 }],
      [{ plannedEndTime: '2026-02-31T10:00:00Z' }],
      [
        {
          plannedStartTime: '2026-11-26T15:00:00Z',
          plannedEndTime: '2026-11-26T10:00:00-05:00',
        },
      ],
      [{ observations: 'x', phase: 'Completed' }],
      [{ observations: 'x', actualStartTime: '2026-11-26T15:00:00Z' }],
      [{ observations: 'x', executionTime: 10 }],
      [{ observations: 'x', id: 7 }],
      [{ observations: 'x', EmployeeId: 4 }],
      [{ observations: 'x', toString: 1 }],
      [{ observations: 'x', constructor: 1 }],
      [{ observations: 'x', prototype: {} }],
    ])('400 con %j', async (body) => {
      await expect400(patch(body));
    });

    it('400 con __proto__ y con anidamiento excesivo', async () => {
      const raw = (body: string) =>
        send('patch', CLEANING)
          .set('Content-Type', 'application/json')
          .send(body);

      await expect400(raw('{"observations":"x","__proto__":{"a":1}}'));
      await expect400(
        raw(`{"observations":${'['.repeat(40_000)}${']'.repeat(40_000)}}`),
      );
    });

    it.each([
      [404, new NotFoundException('La limpieza no existe')],
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
      const res = await cancel({ reason: '  Bloqueo  ' }).expect(200);

      expect(res.body).toEqual({
        data: { id: 7 },
        result: 'applied',
        warnings: [{ code: 'no_schedule' }],
      });
      expect(planning.cancel).toHaveBeenCalledWith(7, 'Bloqueo', 'editor');
    });

    it.each([
      [{}],
      [{ reason: null }],
      [{ reason: '  ' }],
      [{ reason: 5 }],
      [{ reason: 'x'.repeat(501) }],
      [{ reason: 'x', phase: 'Cancelled' }],
    ])('400 con %j', async (body) => {
      await expect400(cancel(body));
    });

    it('propaga 409', async () => {
      planning.cancel.mockRejectedValue(new ConflictException('Ya terminó'));

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
          change(2, { employeeId: null }),
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
        [
          { id: 1, plannedStartTime: '2026-11-26T15:00:00.000Z' },
          { id: 2, employeeId: null },
        ],
        { dryRun: false, actor: 'editor' },
      ]);
    });

    it('acepta 25 cambios y pasa dryRun', async () => {
      const changes = Array.from({ length: 25 }, (_, i) => change(i + 1));

      const res = await plans({ dryRun: true, changes }).expect(200);

      expect((res.body as { dryRun: boolean }).dryRun).toBe(true);
      expect(planning.batch).toHaveBeenCalledWith(changes, {
        dryRun: true,
        actor: 'editor',
      });
    });

    it.each([
      ['sin changes', {}],
      ['changes null', { changes: null }],
      ['changes objeto', { changes: { 0: change(1) } }],
      ['changes vacío', { changes: [] }],
      [
        'más de 25',
        { changes: Array.from({ length: 26 }, (_, i) => change(i + 1)) },
      ],
      ['ids repetidos', { changes: [change(1), change(2), change(1)] }],
      ['elemento null', { changes: [null] }],
      ['elemento número', { changes: [5] }],
      ['elemento texto', { changes: ['x'] }],
      ['elemento array', { changes: [[]] }],
      ['elemento array con cambios', { changes: [[change(1)]] }],
      ['sin id', { changes: [{ employeeId: 4 }] }],
      ['id texto', { changes: [change('1')] }],
      ['id null', { changes: [change(null)] }],
      ['id 0', { changes: [change(0)] }],
      ['cambio sin campos', { changes: [change(1), change(2, {})] }],
      [
        'campo anidado desconocido',
        { changes: [change(1, { employeeId: 4, phase: 'Completed' })] },
      ],
      [
        'campo anidado reservado',
        { changes: [change(1, { employeeId: 4, toString: 1 })] },
      ],
      ['valor anidado inválido', { changes: [change(1, { employeeId: '4' })] }],
      [
        'horario al revés',
        {
          changes: [
            change(1, {
              plannedStartTime: '2026-11-26T15:00:00Z',
              plannedEndTime: '2026-11-26T14:00:00Z',
            }),
          ],
        },
      ],
      ['dryRun texto', { dryRun: 'true', changes: [change(1)] }],
      ['dryRun número', { dryRun: 1, changes: [change(1)] }],
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
      doc.paths[`${ROOT}/cleanings/{id}`].patch,
      doc.paths[`${ROOT}/cleanings/{id}/cancel`].post,
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
      'CleaningPlanFieldsDto',
      'CancelCleaningDto',
      'CleaningPlanBatchDto',
    ]);
    expect(doc.components?.schemas?.CleaningPlanChangeDto).toMatchObject({
      required: ['id'],
      properties: {
        employeeId: { type: 'integer', nullable: true },
        plannedStartTime: { format: 'date-time', nullable: true },
      },
    });
  });
});
