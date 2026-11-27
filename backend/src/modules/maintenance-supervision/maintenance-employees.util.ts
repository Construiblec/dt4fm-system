import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import {
  labelOrNull,
  requireList,
} from '../../common/integrations/upstream.util';
import type { OpenmaintService } from '../../integrations/openmaint/openmaint.service';
import { SUPPLIER_EMPLOYEE_TYPE } from './constants/supervision-roles.constants';
import type { MaintenanceEmployee } from './maintenance-integration.types';

const TEAM_IDS_VARIABLE = 'OPENMAINT_MAINTENANCE_TEAM_IDS';

export const parseTeamIds = (config: ConfigService): number[] => {
  const raw = config.get<string>(TEAM_IDS_VARIABLE)?.trim() ?? '';
  const ids = raw.split(',').map((part) => part.trim());

  if (!raw || ids.some((id) => !/^\d+$/.test(id) || !Number(id))) {
    throw new ServiceUnavailableException(
      'El equipo de mantenimiento no está configurado',
    );
  }

  return [...new Set(ids.map(Number))];
};

/** Empleados de los equipos de mantenimiento; una lista incompleta es un error. */
export const loadMaintenanceEmployees = async (
  openmaint: OpenmaintService,
  sessionId: string,
  teamIds: number[],
  run: <T>(read: () => Promise<T>) => Promise<T> = (read) => read(),
): Promise<MaintenanceEmployee[]> => {
  const teams = await Promise.all(
    teamIds.map((teamId) =>
      run(() => openmaint.getEmployees(sessionId, teamId)),
    ),
  );

  // `limit=500` en la fuente: si hay más, la lista quedaría incompleta.
  teams.forEach((response) => {
    const total = (response as { meta?: { total?: number } }).meta?.total;
    if (total !== undefined && total > requireList(response).length) {
      throw new Error('la fuente tiene más empleados de los leídos');
    }
  });

  const employees = new Map(
    teams.flatMap((response) => requireList(response)).map((e) => [e._id, e]),
  );
  return [...employees.values()].map((employee) => ({
    id: employee._id,
    name: employee.Description?.trim() || String(employee._id),
    team:
      employee.Team != null
        ? { id: employee.Team, name: labelOrNull(employee._Team_description) }
        : null,
    isSupplier: employee._type === SUPPLIER_EMPLOYEE_TYPE,
  }));
};
