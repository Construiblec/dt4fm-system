import { PM_STATUS_IDS } from './constants/preventive-maint.constants';
import { PreventiveMaintenanceOpenmaintService } from './preventive-maintenance.openmaint.service';

const simple = (attribute: string, operator: string, value?: string[]) => ({
  simple: { attribute, operator, ...(value ? { value } : {}) },
});

describe('PreventiveMaintenanceOpenmaintService.search', () => {
  const client = { get: jest.fn() };
  const service = new PreventiveMaintenanceOpenmaintService(client as never);

  const query = async (options: Record<string, unknown>) => {
    client.get.mockResolvedValue({ data: [], meta: { total: 0 } });
    await service.search('sid', { limit: 50, offset: 0, ...options });
    const [path] = client.get.mock.calls.at(-1) as [string];
    const params = new URL(path, 'http://x').searchParams;
    return {
      params,
      filter: JSON.parse(params.get('filter') ?? '{}') as unknown,
    };
  };

  beforeEach(() => client.get.mockReset());

  it('pide la tarjeta completa, ordenada y paginada', async () => {
    const { params, filter } = await query({ limit: 10, offset: 30 });

    expect(params.get('onlyGridAttrs')).toBeNull();
    expect(params.get('start')).toBe('30');
    expect(params.get('limit')).toBe('10');
    expect(JSON.parse(params.get('sort') as string)).toEqual([
      { property: 'Sorting', direction: 'DESC' },
    ]);
    expect(filter).toEqual({});
  });

  it('estado, activo y plan son condiciones equal', async () => {
    const { filter } = await query({
      status: 'Acceptance',
      assetId: 11,
      planId: 12,
      buildingId: 13,
      teamId: 14,
    });

    expect(filter).toEqual({
      attribute: {
        and: [
          simple('ProcessStatus', 'equal', [String(PM_STATUS_IDS.ACCEPTANCE)]),
          simple('Team', 'equal', ['14']),
          simple('Site', 'equal', ['13']),
          simple('CI', 'equal', ['11']),
          simple('PrevMaintConfig', 'equal', ['12']),
        ],
      },
    });
  });

  it('los rangos son [desde, hasta), también el de vencimiento', async () => {
    const { filter } = await query({
      planned: { from: '2026-11-16T05:00:00Z', to: '2026-11-17T05:00:00Z' },
      due: { to: '2026-11-30T05:00:00Z' },
    });

    expect(filter).toEqual({
      attribute: {
        and: [
          {
            and: [
              simple('ExpExecStartDate', 'greater', [
                '2026-11-16T04:59:59.999Z',
              ]),
              simple('ExpExecStartDate', 'less', ['2026-11-17T05:00:00.000Z']),
            ],
          },
          simple('DueExecEndDate', 'less', ['2026-11-30T05:00:00.000Z']),
        ],
      },
    });
  });

  it('assigned filtra por cesionario salvo que venga employeeId', async () => {
    expect((await query({ assigned: false })).filter).toEqual({
      attribute: simple('Assignee', 'isnull'),
    });
    expect((await query({ employeeId: 4 })).filter).toEqual({
      attribute: simple('Assignee', 'equal', ['4']),
    });
  });

  it('un estado desconocido falla', async () => {
    await expect(
      service.search('sid', { limit: 1, offset: 0, status: 'Assigned' }),
    ).rejects.toThrow('desconocido');
  });
});
