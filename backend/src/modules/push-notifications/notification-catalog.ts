import { MAINTENANCE_SUPERVISOR_ROLES } from '../maintenance-supervision/constants/supervision-roles.constants';
import { SUPERVISOR_ROLES as CLEANING_SUPERVISOR_ROLES } from '../cleaning-tasks/constants/roles.constants';

/** Tipo estable que se persiste en `notifications.type`. */
export const NOTIFICATION_TYPES = {
  CORRECTIVE_OPENED: 'corrective.opened',
  CORRECTIVE_ASSIGNED: 'corrective.assigned',
  CORRECTIVE_COMPLETED: 'corrective.completed',
  PREVENTIVE_PLANNING_30D: 'preventive.planning-30d',
  PREVENTIVE_PLANNING_2D: 'preventive.planning-2d',
  PREVENTIVE_ASSIGNED: 'preventive.assigned',
  PREVENTIVE_SUSPENDED: 'preventive.suspended',
  PREVENTIVE_RESUMED: 'preventive.resumed',
  CLEANING_ASSIGNED: 'cleaning.assigned',
  CLEANING_DELAYED: 'cleaning.delayed',
  CLEANING_COMPLETED: 'cleaning.completed',
} as const;

export { MAINTENANCE_SUPERVISOR_ROLES, CLEANING_SUPERVISOR_ROLES };

/**
 * Los listados no tienen ruta propia (son sub-tabs en memoria del dashboard),
 * así que el deep link los selecciona por query param.
 */
export const DEEP_LINKS = {
  correctiveDetail: (id: string | number) =>
    `/supervisor-mantenimiento/corrective/${id}`,
  preventiveDetail: (id: string | number) =>
    `/supervisor-mantenimiento/preventive/${id}`,
  cleaningDetail: (id: string | number) => `/supervisor/task/${id}`,
  /** Vista del técnico, distinta de la del supervisor. */
  preventiveDetailAssignee: (id: string | number) =>
    `/preventive-maintenance/${id}`,
  correctiveList: '/dashboard?tab=maintenance&kind=corrective',
  preventiveList: '/dashboard?tab=maintenance&kind=preventive',
  cleaningList: '/dashboard?tab=cleaning',
};

export type PushMessage = {
  type: string;
  title: string;
  body: string;
  deepLink: string | null;
  entityKind: 'corrective' | 'preventive' | 'cleaning';
  entityId: string;
};

// Une los segmentos disponibles con " · ", descartando los vacíos.
export const LOCATION_SEPARATOR = ' · ';

const stripCodePrefix = (segment: string): string => {
  const index = segment.indexOf(' - ');

  if (index === -1) {
    return segment;
  }

  // Si detrás del código no queda nada, se conserva el segmento tal cual.
  return segment.slice(index + 3).trim() || segment;
};

export const joinLocation = (
  ...parts: (string | null | undefined)[]
): string => {
  const clean = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .map(stripCodePrefix);

  return clean.length > 0
    ? clean.join(LOCATION_SEPARATOR)
    : 'ubicación no especificada';
};

// ─── Correctivos ──────────────────────────────────────────────────────────────

export const correctiveOpened = (input: {
  id: string | number;
  requesterName: string;
  location: string;
}): PushMessage => ({
  type: NOTIFICATION_TYPES.CORRECTIVE_OPENED,
  title: 'Nueva Incidencia Reportada',
  body: `${input.requesterName} ha reportado un problema en ${input.location}`,
  deepLink: DEEP_LINKS.correctiveDetail(input.id),
  entityKind: 'corrective',
  entityId: String(input.id),
});

export const correctiveAssigned = (input: {
  id: string | number;
  location: string;
}): PushMessage => ({
  type: NOTIFICATION_TYPES.CORRECTIVE_ASSIGNED,
  title: 'Asignado: Mantenimiento Correctivo',
  body: `Realizar mantenimiento en ${input.location}`,
  deepLink: DEEP_LINKS.correctiveList,
  entityKind: 'corrective',
  entityId: String(input.id),
});

export const correctiveCompleted = (input: {
  id: string | number;
  assigneeName: string;
  location: string;
}): PushMessage => ({
  type: NOTIFICATION_TYPES.CORRECTIVE_COMPLETED,
  title: 'Completado: Mantenimiento Correctivo',
  body: `${input.assigneeName} ha terminado mantenimiento en ${input.location}`,
  deepLink: DEEP_LINKS.correctiveDetail(input.id),
  entityKind: 'corrective',
  entityId: String(input.id),
});

// ─── Preventivos ──────────────────────────────────────────────────────────────

export const preventivePlanning = (input: {
  id: string | number;
  planName: string;
  horizon: '30d' | '2d';
}): PushMessage => ({
  type:
    input.horizon === '30d'
      ? NOTIFICATION_TYPES.PREVENTIVE_PLANNING_30D
      : NOTIFICATION_TYPES.PREVENTIVE_PLANNING_2D,
  title: 'Asignar: Mantenimiento Preventivo',
  body:
    `Debes asignar un cesionario para ${input.planName} que comienza en ` +
    `${input.horizon === '30d' ? 'un mes' : 'dos días'}`,
  deepLink: DEEP_LINKS.preventiveDetail(input.id),
  entityKind: 'preventive',
  entityId: String(input.id),
});

export const preventiveAssigned = (input: {
  id: string | number;
  location: string;
}): PushMessage => ({
  type: NOTIFICATION_TYPES.PREVENTIVE_ASSIGNED,
  title: 'Asignado: Mantenimiento Preventivo',
  body: `Realizar mantenimiento a ${input.location}`,
  deepLink: DEEP_LINKS.preventiveList,
  entityKind: 'preventive',
  entityId: String(input.id),
});

export const preventiveSuspended = (input: {
  id: string | number;
  assigneeName: string;
  location: string;
}): PushMessage => ({
  type: NOTIFICATION_TYPES.PREVENTIVE_SUSPENDED,
  title: 'Suspendido: Mantenimiento Preventivo',
  body: `${input.assigneeName} ha suspendido mantenimiento a ${input.location}`,
  deepLink: DEEP_LINKS.preventiveDetail(input.id),
  entityKind: 'preventive',
  entityId: String(input.id),
});

/** Va al cesionario, así que enlaza a su vista y no a la del supervisor. */
export const preventiveResumed = (input: {
  id: string | number;
  supervisorName: string;
  location: string;
}): PushMessage => ({
  type: NOTIFICATION_TYPES.PREVENTIVE_RESUMED,
  title: 'Reabierto: Mantenimiento Preventivo',
  body:
    `${input.supervisorName} ha reanudado la ejecución de mantenimiento a ` +
    `${input.location}`,
  deepLink: DEEP_LINKS.preventiveDetailAssignee(input.id),
  entityKind: 'preventive',
  entityId: String(input.id),
});

// ─── Limpieza ─────────────────────────────────────────────────────────────────

export const cleaningAssigned = (input: {
  id: string | number;
  location: string;
}): PushMessage => ({
  type: NOTIFICATION_TYPES.CLEANING_ASSIGNED,
  title: 'Asignada: Limpieza',
  body: `Realizar limpieza en ${input.location}`,
  deepLink: DEEP_LINKS.cleaningList,
  entityKind: 'cleaning',
  entityId: String(input.id),
});

export const cleaningDelayed = (input: {
  id: string | number;
  location: string;
}): PushMessage => ({
  type: NOTIFICATION_TYPES.CLEANING_DELAYED,
  title: 'Retraso: Limpieza',
  body: `Tienes una limpieza por realizar en ${input.location}`,
  deepLink: DEEP_LINKS.cleaningList,
  entityKind: 'cleaning',
  entityId: String(input.id),
});

export const cleaningCompleted = (input: {
  id: string | number;
  employeeName: string;
  location: string;
}): PushMessage => ({
  type: NOTIFICATION_TYPES.CLEANING_COMPLETED,
  title: 'Completada: Limpieza',
  body: `${input.employeeName} ha terminado una limpieza en ${input.location}`,
  deepLink: DEEP_LINKS.cleaningDetail(input.id),
  entityKind: 'cleaning',
  entityId: String(input.id),
});
