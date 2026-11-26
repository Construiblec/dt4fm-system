import { CorrectiveMaintOpenmaintService } from './corrective-maint.openmaint.service';
import { CM_STATUS_IDS } from './constants/corrective-maint.constants';

const simple = (attribute: string, operator: string, value?: string[]) => ({
  simple: { attribute, operator, ...(value ? { value } : {}) },
});

describe('CorrectiveMaintOpenmaintService.search', () => {
  const client = { get: jest.fn() };
  const service = new CorrectiveMaintOpenmaintService(client as never);

  const query = async (options: Record<string, unknown>) => {
    client.get.mockResolvedValue({ data: [], meta: { total: 0 } });
    await service.search('sid', { limit: 50, offset: 0, ...options });
    const [path, session] = client.get.mock.calls.at(-1) as [string, string];
    const params = new URL(path, 'http://x').searchParams;
    return {
      session,
      params,
      filter: JSON.parse(params.get('filter') ?? '{}') as unknown,
    };
  };

  beforeEach(() => client.get.mockReset());

  it('pide la tarjeta completa, ordenada y paginada', async () => {
    const { params, session, filter } = await query({ limit: 10, offset: 20 });

    expect(session).toBe('sid');
    expect(params.get('onlyGridAttrs')).toBeNull();
    expect(params.get('start')).toBe('20');
    expect(params.get('limit')).toBe('10');
    expect(JSON.parse(params.get('sort') as string)).toEqual([
      { property: 'Sorting', direction: 'DESC' },
    ]);
    expect(filter).toEqual({});
  });

  it('una sola condición va dentro de attribute', async () => {
    const { filter } = await query({ buildingId: 3019998 });

    expect(filter).toEqual({
      attribute: simple('Site', 'equal', ['3019998']),
    });
  });

  it('varias condiciones van en un and dentro de attribute', async () => {
    const { filter } = await query({
      teamId: 5,
      unitId: 7,
      priorityId: 118,
      categoryId: 2,
      subcategoryId: 21,
    });

    expect(filter).toEqual({
      attribute: {
        and: [
          simple('Team', 'equal', ['5']),
          simple('Unit', 'equal', ['7']),
          simple('Priority', 'equal', ['118']),
          simple('Category', 'equal', ['2']),
          simple('Subcategory', 'equal', ['21']),
        ],
      },
    });
  });

  it('rango [desde, hasta): greater con desde menos 1 ms y less con hasta', async () => {
    const { filter } = await query({
      planned: {
        from: '2026-11-16T00:00:00-05:00',
        to: '2026-11-17T00:00:00-05:00',
      },
    });

    expect(filter).toEqual({
      attribute: {
        and: [
          simple('ExpExecStartDate', 'greater', ['2026-11-16T04:59:59.999Z']),
          simple('ExpExecStartDate', 'less', ['2026-11-17T05:00:00.000Z']),
        ],
      },
    });
  });

  it('cada rango usa su atributo y admite un solo extremo', async () => {
    const { filter } = await query({
      opened: { from: '2026-11-16T05:00:00Z' },
      started: { to: '2026-11-17T05:00:00Z' },
      ended: { from: '2026-11-16T05:00:00Z' },
    });

    expect(filter).toEqual({
      attribute: {
        and: [
          simple('OpeningDate', 'greater', ['2026-11-16T04:59:59.999Z']),
          simple('ExecStartDate', 'less', ['2026-11-17T05:00:00.000Z']),
          simple('ExecEndDate', 'greater', ['2026-11-16T04:59:59.999Z']),
        ],
      },
    });
  });

  it('Assigned es Execution sin inicio real', async () => {
    const { filter } = await query({ status: 'Assigned' });

    expect(filter).toEqual({
      attribute: {
        and: [
          simple('ProcessStatus', 'equal', [String(CM_STATUS_IDS.EXECUTION)]),
          simple('ExecStartDate', 'isnull'),
        ],
      },
    });
  });

  it('Execution exige inicio real', async () => {
    const { filter } = await query({ status: 'Execution' });

    expect(filter).toEqual({
      attribute: {
        and: [
          simple('ProcessStatus', 'equal', [String(CM_STATUS_IDS.EXECUTION)]),
          simple('ExecStartDate', 'isnotnull'),
        ],
      },
    });
  });

  it('un estado normal filtra por su id', async () => {
    const { filter } = await query({ status: 'Canceled' });

    expect(filter).toEqual({
      attribute: simple('ProcessStatus', 'equal', [
        String(CM_STATUS_IDS.CANCELED),
      ]),
    });
  });

  it('un estado desconocido falla en vez de quitar el filtro', async () => {
    await expect(
      service.search('sid', { limit: 1, offset: 0, status: 'Otro' }),
    ).rejects.toThrow('desconocido');
    expect(client.get).not.toHaveBeenCalled();
  });

  it('assigned filtra por cesionario salvo que venga employeeId', async () => {
    expect((await query({ assigned: false })).filter).toEqual({
      attribute: simple('Assignee', 'isnull'),
    });
    expect((await query({ assigned: true, employeeId: 9 })).filter).toEqual({
      attribute: simple('Assignee', 'equal', ['9']),
    });
  });
});
