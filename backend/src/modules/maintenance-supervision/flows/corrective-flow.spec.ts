import { BadRequestException, ConflictException } from '@nestjs/common';
import { CM_ACTIONS } from '../constants/corrective-maint.constants';
import type { MaintenanceEmployee } from '../maintenance-integration.types';
import { CorrectiveFlow } from './corrective-flow';
import type { FlowOutcome, PrepareContext } from './maintenance-flow.types';

const CODES: Record<string, string> = {
  Assignment: 'CM-Assignment',
  Management: 'CM-Management',
  Estimate: 'CM-Estimate',
  Execution: 'CM-Execution',
  Accounting: 'CM-Accounting',
  Completed: 'CM-Completed',
  Canceled: 'CM-Canceled',
};

const START = '2026-11-26T15:00:00.000Z';
const OTHER = '2026-11-27T15:00:00.000Z';
const BACK_ACTION = 555;

const CATEGORY = { id: 30, code: 'MNT', name: 'Mantenimiento' };
const SUB = { id: 31, name: 'Fuga de agua', isOther: false };
const SUB_OTHER = { id: 32, name: 'Otro', isOther: true };
const resolved = (subcategory = SUB) => ({
  category: { ...CATEGORY, subcategories: [SUB, SUB_OTHER] },
  subcategory,
});

/** Tarjeta lista para despachar: fecha, prioridad y categoría puestas. */
const card = (status: string, over: Record<string, unknown> = {}) => ({
  _id: 10,
  _ProcessStatus_code: CODES[status],
  ShortDescr: 'Fuga de agua',
  Assignee: null as number | null,
  Team: 501 as number | null,
  Priority: 118 as number | null,
  Category: 30 as number | null,
  Subcategory: 31 as number | null,
  ExpExecStartDate: START as string | null,
  ExecStartDate: null as string | null,
  _tasklist: [{ _id: 'act-1' }],
  ...over,
});

const employee = (
  id: number,
  team = 501,
  isSupplier = false,
): MaintenanceEmployee => ({
  id,
  name: `E${id}`,
  team: { id: team, name: null },
  isSupplier,
});

const context = (over: Partial<PrepareContext> = {}): PrepareContext => ({
  employees: [
    employee(7),
    employee(8),
    employee(9, 502),
    employee(11, 501, true),
  ],
  teamIds: [501, 502],
  ...over,
});

const like = (value: object) => expect.objectContaining(value) as unknown;

describe('CorrectiveFlow (escritura)', () => {
  const gateway = { advance: jest.fn(), saveFields: jest.fn() };
  let backAction: string | undefined;
  const config = { get: jest.fn(() => backAction) };
  const flow = new CorrectiveFlow(gateway as never, config as never);

  const prepare = (
    c: ReturnType<typeof card>,
    fields: object,
    ctx: PrepareContext = context({ category: resolved() }),
  ) => flow.prepare(c as never, fields, ctx);
  const plan = (outcome: FlowOutcome) => {
    if ('error' in outcome) throw outcome.error;
    return outcome;
  };
  const errorOf = (outcome: FlowOutcome): Error => {
    if (!('error' in outcome)) throw new Error('debía fallar');
    return outcome.error;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    backAction = String(BACK_ACTION);
  });

  describe('Assignment', () => {
    it('con técnico: un avance con la tarjeta fusionada y luego borra el inicio real', () => {
      const { steps, warnings } = plan(
        prepare(card('Assignment'), { employeeId: 7 }),
      );

      expect(warnings).toEqual([]);
      expect(steps).toEqual([
        like({
          type: 'advance',
          action: CM_ACTIONS.ASSIGN,
          fields: {
            Assignee: 7,
            Priority: 118,
            Category: 30,
            Subcategory: 31,
            ShortDescr: 'Fuga de agua',
            Team: 501,
          },
          expectStatus: ['Execution', 'Assigned'],
          expectFields: { Assignee: 7 },
          assigns: true,
        }),
        like({
          type: 'restoreExecStart',
          value: null,
          expectStatus: 'Assigned',
          warnIfFails: 'exec_start_not_restored',
        }),
      ]);
    });

    it('fusiona los cambios con la tarjeta: fecha, prioridad, categoría y equipo', () => {
      const { steps } = plan(
        prepare(
          card('Assignment', { Team: null }),
          {
            employeeId: 9,
            teamId: 502,
            plannedStartTime: OTHER,
            priority: 'Low',
            categoryId: 30,
            subcategoryId: 32,
            otherDescription: 'Puerta atascada',
          },
          context({ category: resolved(SUB_OTHER) }),
        ),
      );

      expect(steps[0]).toEqual(
        like({
          fields: {
            Assignee: 9,
            Priority: 120,
            Category: 30,
            Subcategory: 32,
            ShortDescr: 'Puerta atascada',
            Team: 502,
            ExpExecStartDate: OTHER,
          },
        }),
      );
    });

    it('repetir el mismo técnico despacha otra vez', () => {
      const { steps } = plan(
        prepare(card('Assignment', { Assignee: 7 }), { employeeId: 7 }),
      );
      expect(steps).toHaveLength(2);
    });

    it('sin equipo en la tarjeta ni en el cambio, escribe el del técnico', () => {
      const { steps } = plan(
        prepare(card('Assignment', { Team: null }), { employeeId: 8 }),
      );
      expect(steps[0]).toEqual(like({ fields: like({ Team: 501 }) }));
    });

    it.each([
      ['fecha', { ExpExecStartDate: null }, 'plannedStartTime'],
      ['prioridad', { Priority: null }, 'priority'],
      ['categoría', { Category: null, Subcategory: null }, 'categoryId'],
    ])('faltando %s: 400 con lo que falta', (_name, over, missing) => {
      const ctx = context({
        category: 'Category' in over ? undefined : resolved(),
      });
      const error = errorOf(
        prepare(card('Assignment', over), { employeeId: 7 }, ctx),
      );
      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toBe(`Faltan: ${missing}`);
    });

    it('un cambio de campos junto al técnico completa lo que falta', () => {
      const { steps } = plan(
        prepare(card('Assignment', { ExpExecStartDate: null }), {
          employeeId: 7,
          plannedStartTime: START,
        }),
      );
      expect(steps[0]).toEqual(
        like({ fields: like({ ExpExecStartDate: START }) }),
      );
    });

    it('«Otro» sin título usable: 400; con el título de la tarjeta, lo conserva', () => {
      const other = context({ category: resolved(SUB_OTHER) });
      const bare = card('Assignment', { Subcategory: 31, ShortDescr: 'Fuga' });
      expect(
        errorOf(prepare(bare, { categoryId: 30, subcategoryId: 32 }, other)),
      ).toBeInstanceOf(BadRequestException);

      const kept = card('Assignment', {
        Subcategory: 32,
        ShortDescr: 'Puerta atascada',
      });
      const { steps } = plan(prepare(kept, { employeeId: 7 }, other));
      expect(steps[0]).toEqual(
        like({ fields: like({ ShortDescr: 'Puerta atascada' }) }),
      );
    });

    it('sin técnico: guarda fecha, prioridad, categoría y equipo; blandos los que la fuente puede descartar', () => {
      const { steps, warnings } = plan(
        prepare(
          card('Assignment'),
          {
            plannedStartTime: OTHER,
            priority: 'Critical',
            teamId: 502,
            categoryId: 30,
            subcategoryId: 32,
            otherDescription: 'Puerta',
          },
          context({ category: resolved(SUB_OTHER) }),
        ),
      );

      expect(warnings).toEqual([]);
      expect(steps).toEqual([
        like({
          type: 'save',
          expectStatus: 'Assignment',
          expectFields: { ExpExecStartDate: OTHER, Team: 502 },
          softFields: {
            Priority: 117,
            Category: 30,
            Subcategory: 32,
            ShortDescr: 'Puerta',
          },
        }),
      ]);
    });

    it('sin técnico y con uno puesto sin despachar: aviso not_dispatched', () => {
      const { steps, warnings } = plan(
        prepare(card('Assignment', { Assignee: 7 }), { priority: 'Low' }),
      );
      expect(steps).toHaveLength(1);
      expect(warnings).toEqual(['not_dispatched']);
    });

    it('cambiar el equipo con un técnico de otro equipo puesto: 409 antes de guardar', () => {
      const error = errorOf(
        prepare(card('Assignment', { Assignee: 7 }), { teamId: 502 }),
      );
      expect(error).toBeInstanceOf(ConflictException);
    });

    it('diff vacío sin técnico: sin pasos', () => {
      expect(
        plan(prepare(card('Assignment'), { priority: 'High' })).steps,
      ).toEqual([]);
    });

    it('técnico fuera de los equipos, proveedor o de otro equipo: se rechaza', () => {
      expect(
        errorOf(prepare(card('Assignment'), { employeeId: 99 })),
      ).toBeInstanceOf(BadRequestException);
      expect(
        errorOf(prepare(card('Assignment'), { employeeId: 11 })),
      ).toBeInstanceOf(ConflictException);
      // Técnico de 502 con la tarjeta en 501: debe ser del equipo de destino.
      const error = errorOf(prepare(card('Assignment'), { employeeId: 9 }));
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toBe(
        'El técnico debe pertenecer al equipo de destino',
      );
      // Con teamId explícito sí.
      expect(
        plan(prepare(card('Assignment'), { employeeId: 9, teamId: 502 })).steps,
      ).toHaveLength(2);
    });

    it('un equipo que no es de mantenimiento: 400', () => {
      expect(
        errorOf(prepare(card('Assignment'), { teamId: 999 })),
      ).toBeInstanceOf(BadRequestException);
    });

    it('quitarle la orden a un proveedor: 409', () => {
      const outcome = prepare(card('Assignment', { Assignee: 11 }), {
        employeeId: 7,
      });
      expect(errorOf(outcome)).toBeInstanceOf(ConflictException);
    });

    it('otherDescription sin categoría resuelta: 400', () => {
      expect(
        errorOf(
          prepare(card('Assignment'), { otherDescription: 'x' }, context()),
        ),
      ).toBeInstanceOf(BadRequestException);
    });
  });

  describe('Assigned (Execution sin inicio real)', () => {
    const assigned = (over: Record<string, unknown> = {}) =>
      card('Execution', { Assignee: 7, ...over });

    it('solo el técnico: CM03-Return y borra el inicio real; conserva el aviso al nuevo', () => {
      const { steps, warnings } = plan(prepare(assigned(), { employeeId: 8 }));

      expect(warnings).toEqual([]);
      expect(steps).toEqual([
        like({
          type: 'advance',
          action: CM_ACTIONS.CHANGE_ASSIGNEE,
          fields: { Assignee: 8 },
          expectStatus: ['Execution', 'Assigned'],
          assigns: true,
        }),
        like({ type: 'restoreExecStart', value: null }),
      ]);
    });

    it('el técnico nuevo debe ser del equipo actual', () => {
      expect(errorOf(prepare(assigned(), { employeeId: 9 }))).toBeInstanceOf(
        ConflictException,
      );
    });

    it('mismo técnico y mismos valores: sin pasos', () => {
      expect(
        plan(
          prepare(assigned(), {
            employeeId: 7,
            plannedStartTime: START,
            priority: 'High',
          }),
        ).steps,
      ).toEqual([]);
    });

    it('reprogramar sin cambiar de técnico valida al actual con un mensaje propio', () => {
      const proveedor = card('Execution', { Assignee: 11 });
      const error = errorOf(prepare(proveedor, { plannedStartTime: OTHER }));
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toBe(
        'El técnico actual no es un técnico de mantenimiento o es un proveedor; reasignarlo antes de reprogramar',
      );

      const otroEquipo = card('Execution', { Assignee: 9 });
      expect(
        errorOf(prepare(otroEquipo, { plannedStartTime: OTHER })).message,
      ).toBe(
        'El técnico actual no pertenece al equipo de destino; reasignarlo antes de reprogramar',
      );
    });

    describe('con la acción de vuelta a asignación', () => {
      it.each([
        ['fecha', { plannedStartTime: OTHER }],
        ['prioridad', { priority: 'Low' }],
        ['equipo', { teamId: 502, employeeId: 9 }],
      ])('cambiar %s: vuelve a asignación y despacha', (_name, fields) => {
        const { steps } = plan(prepare(assigned(), fields));

        expect(steps).toEqual([
          like({
            type: 'advance',
            action: BACK_ACTION,
            fields: {},
            expectStatus: 'Assignment',
          }),
          like({
            type: 'advance',
            action: CM_ACTIONS.ASSIGN,
            assigns: true,
            failMessage:
              'El correctivo quedó por asignar sin aplicar el cambio; comprobar antes de repetir',
          }),
          like({ type: 'restoreExecStart', value: null }),
        ]);
      });

      it('cambiar la categoría fusiona título y subcategoría', () => {
        const { steps } = plan(
          prepare(
            assigned(),
            { categoryId: 30, subcategoryId: 32, otherDescription: 'Puerta' },
            context({ category: resolved(SUB_OTHER) }),
          ),
        );
        expect(steps[1]).toEqual(
          like({
            fields: like({
              Assignee: 7,
              Subcategory: 32,
              ShortDescr: 'Puerta',
            }),
          }),
        );
      });
    });

    describe('sin la acción de vuelta a asignación', () => {
      it.each([undefined, '', '  ', 'abc', '-3', '0', '1.5'])(
        'valor %p: 409 al reprogramar, pero cambiar de técnico funciona',
        (value) => {
          backAction = value;

          const error = errorOf(
            prepare(assigned(), { plannedStartTime: OTHER }),
          );
          expect(error).toBeInstanceOf(ConflictException);
          expect(error.message).toBe(
            'Reprogramar un correctivo ya asignado aún no está disponible; solo se puede cambiar el técnico',
          );
          expect(
            plan(prepare(assigned(), { employeeId: 8 })).steps,
          ).toHaveLength(2);
        },
      );
    });
  });

  describe('Execution (empezado)', () => {
    const started = (over: Record<string, unknown> = {}) =>
      card('Execution', {
        Assignee: 7,
        ExecStartDate: '2026-11-26T15:05:00Z',
        ...over,
      });

    it('solo el técnico: CM03-Return, restaura el inicio previo y avisa started', () => {
      const { steps, warnings } = plan(prepare(started(), { employeeId: 8 }));

      expect(warnings).toEqual(['started']);
      expect(steps).toEqual([
        like({
          type: 'advance',
          action: CM_ACTIONS.CHANGE_ASSIGNEE,
          expectStatus: 'Execution',
          assigns: true,
        }),
        like({
          type: 'restoreExecStart',
          value: '2026-11-26T15:05:00Z',
          expectStatus: 'Execution',
        }),
      ]);
    });

    it.each([
      { plannedStartTime: OTHER },
      { priority: 'Low' },
      { teamId: 502 },
      { categoryId: 30, subcategoryId: 32, otherDescription: 'x' },
    ])('cualquier otro campo (%j): 409', (fields) => {
      const withCategory = 'categoryId' in fields;
      const error = errorOf(
        prepare(
          started(),
          fields,
          context(withCategory ? { category: resolved(SUB_OTHER) } : {}),
        ),
      );
      expect(error).toBeInstanceOf(ConflictException);
      expect(error.message).toBe(
        'El correctivo ya empezó: solo se puede cambiar el técnico',
      );
    });

    it('sin diff: sin pasos y con el aviso', () => {
      expect(plan(prepare(started(), { employeeId: 7 }))).toEqual({
        steps: [],
        warnings: ['started'],
      });
    });
  });

  describe('Management', () => {
    it('técnico y equipo: un guardado', () => {
      const { steps } = plan(
        prepare(card('Management', { Assignee: 7 }), {
          employeeId: 9,
          teamId: 502,
        }),
      );
      expect(steps).toEqual([
        like({
          type: 'save',
          fields: { Assignee: 9, Team: 502 },
          expectStatus: 'Management',
        }),
      ]);
    });

    it('otro campo: 409', () => {
      expect(
        errorOf(prepare(card('Management'), { plannedStartTime: OTHER })),
      ).toBeInstanceOf(ConflictException);
    });
  });

  describe('Accounting, cerrados y otros estados', () => {
    it('Accounting sin diff: unchanged con pending_review; con cambio, 409', () => {
      const accounting = card('Accounting', { Assignee: 7 });
      expect(plan(prepare(accounting, { employeeId: 7 }))).toEqual({
        steps: [],
        warnings: ['pending_review'],
      });
      expect(errorOf(prepare(accounting, { employeeId: 8 }))).toBeInstanceOf(
        ConflictException,
      );
    });

    it.each(['Completed', 'Canceled'])(
      '%s sin diff: unchanged con closed; con cambio, 409',
      (status) => {
        const closed = card(status, { Assignee: 7 });
        expect(plan(prepare(closed, { employeeId: 7 }))).toEqual({
          steps: [],
          warnings: ['closed'],
        });
        expect(errorOf(prepare(closed, { priority: 'Low' }))).toBeInstanceOf(
          ConflictException,
        );
      },
    );

    it('Estimate: 409 con cambio', () => {
      expect(
        errorOf(prepare(card('Estimate'), { employeeId: 7 })),
      ).toBeInstanceOf(ConflictException);
    });
  });

  describe('categoryToResolve', () => {
    const resolve = (c: ReturnType<typeof card>, fields: object) =>
      flow.categoryToResolve(c as never, fields);

    it('lo pide al despachar, con categoría explícita o al reprogramar', () => {
      expect(resolve(card('Assignment'), { employeeId: 7 })).toEqual({
        categoryId: 30,
        subcategoryId: 31,
      });
      expect(
        resolve(card('Assignment'), { categoryId: 40, subcategoryId: 41 }),
      ).toEqual({ categoryId: 40, subcategoryId: 41 });
      expect(
        resolve(card('Execution', { Assignee: 7 }), {
          plannedStartTime: OTHER,
        }),
      ).toEqual({ categoryId: 30, subcategoryId: 31 });
    });

    it('no lo pide para guardar sin más ni para cambiar solo el técnico', () => {
      expect(resolve(card('Assignment'), { priority: 'Low' })).toBeNull();
      expect(
        resolve(card('Execution', { Assignee: 7 }), { employeeId: 8 }),
      ).toBeNull();
    });

    it('no lo pide si el cambio no cambia nada respecto a la tarjeta', () => {
      const assigned = card('Execution', { Assignee: 7 });
      expect(
        resolve(assigned, {
          plannedStartTime: START,
          priority: 'High',
          teamId: 501,
          categoryId: 30,
          subcategoryId: 31,
        }),
      ).toBeNull();
    });

    it('sin categoría en la tarjeta ni en el cambio, nada que resolver', () => {
      expect(
        resolve(card('Assignment', { Category: null, Subcategory: null }), {
          employeeId: 7,
        }),
      ).toBeNull();
    });
  });

  describe('cancelSteps', () => {
    it('Assignment: CM02-Reject con el motivo', () => {
      expect(
        plan(flow.cancelSteps(card('Assignment') as never, 'Duplicado')).steps,
      ).toEqual([
        like({
          type: 'advance',
          action: CM_ACTIONS.REJECT_AND_CLOSE,
          description: 'Duplicado',
          expectStatus: 'Canceled',
          cancels: true,
        }),
      ]);
    });

    it('Assigned con la acción: vuelve a asignación y rechaza; si falla el segundo, mensaje propio', () => {
      const { steps } = plan(
        flow.cancelSteps(
          card('Execution', { Assignee: 7 }) as never,
          'Duplicado',
        ),
      );
      expect(steps).toEqual([
        like({ action: BACK_ACTION, expectStatus: 'Assignment' }),
        like({
          action: CM_ACTIONS.REJECT_AND_CLOSE,
          cancels: true,
          failMessage:
            'El correctivo quedó por asignar sin cancelar; repetir lo cancela',
        }),
      ]);
    });

    it('Assigned sin la acción: 409', () => {
      backAction = undefined;
      const outcome = flow.cancelSteps(
        card('Execution', { Assignee: 7 }) as never,
        'x',
      );
      expect(errorOf(outcome)).toBeInstanceOf(ConflictException);
    });

    it('Canceled: unchanged con closed; empezado, Management o cerrado: 409', () => {
      expect(flow.cancelSteps(card('Canceled') as never, 'x')).toEqual({
        steps: [],
        warnings: ['closed'],
      });
      for (const c of [
        card('Execution', { ExecStartDate: START }),
        card('Management'),
        card('Completed'),
        card('Accounting'),
      ]) {
        expect(errorOf(flow.cancelSteps(c as never, 'x'))).toBeInstanceOf(
          ConflictException,
        );
      }
    });
  });

  describe('execute', () => {
    it('avanza con la actividad activa y la nota', async () => {
      await flow.execute(
        'sesion',
        card('Assignment') as never,
        {
          type: 'advance',
          action: 7,
          fields: { Assignee: 1 },
          description: 'd',
          expectStatus: 'x',
          expectFields: {},
        },
        'nota',
      );
      expect(gateway.advance).toHaveBeenCalledWith('sesion', 10, {
        activityId: 'act-1',
        action: 7,
        notes: 'nota',
        fields: { Assignee: 1 },
      });
    });

    it('restaurar el inicio real es un guardado de ExecStartDate', async () => {
      await flow.execute(
        'sesion',
        card('Execution') as never,
        {
          type: 'restoreExecStart',
          value: null,
          description: 'd',
          expectStatus: 'x',
          expectFields: {},
        },
        'nota',
      );
      expect(gateway.saveFields).toHaveBeenCalledWith('sesion', 10, {
        activityId: 'act-1',
        fields: { ExecStartDate: null },
      });
    });

    it('sin actividad activa: 409', async () => {
      await expect(
        flow.execute(
          'sesion',
          card('Assignment', { _tasklist: [] }) as never,
          {
            type: 'save',
            fields: {},
            description: 'd',
            expectStatus: 'x',
            expectFields: {},
          },
          'n',
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
