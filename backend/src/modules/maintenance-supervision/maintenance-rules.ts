import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type {
  MaintenanceEmployee,
  MaintenanceKind,
} from './maintenance-integration.types';

export type PlanField =
  | 'employeeId'
  | 'plannedStartTime'
  | 'teamId'
  | 'priority'
  | 'category'
  | 'otherDescription';

/**
 * Estados (nombre público) en que cada campo se escribe sin pasos previos.
 * Fuera de ellos la fuente acepta el guardado pero descarta el campo.
 */
const WRITABLE: Record<
  MaintenanceKind,
  Partial<Record<PlanField, readonly string[]>>
> = {
  preventive: {
    employeeId: ['Planning', 'Acceptance', 'Execution', 'Suspension'],
    plannedStartTime: ['Acceptance'],
  },
  corrective: {
    employeeId: ['Assignment', 'Assigned', 'Execution'],
    teamId: ['Assignment'],
    plannedStartTime: ['Assignment'],
    priority: ['Assignment'],
    category: ['Assignment'],
    otherDescription: ['Assignment'],
  },
};

export const writableStatuses = (
  kind: MaintenanceKind,
  field: PlanField,
): readonly string[] => WRITABLE[kind][field] ?? [];

export const canWrite = (
  kind: MaintenanceKind,
  field: PlanField,
  status: string | null,
): boolean => status !== null && writableStatuses(kind, field).includes(status);

/** Segundos: la fuente no conserva los milisegundos. `null` = sin fecha. */
export const toSeconds = (value: string | null | undefined): number | null => {
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? null : Math.floor(time / 1000);
};

/**
 * El destino debe ser de un equipo de mantenimiento y no un proveedor; la
 * orden tampoco se le quita a un proveedor. `employees` ya viene cargada.
 * Un origen fuera de la lista exige `currentIsSupplier`: sin dato, nunca se permite.
 */
export const assertReassignable = (
  employees: readonly MaintenanceEmployee[],
  currentId: number | null | undefined,
  nextId: number,
  teamIds: readonly number[],
  currentIsSupplier?: boolean,
): void => {
  const next = employees.find((employee) => employee.id === nextId);
  if (!next) {
    throw new BadRequestException(
      'El técnico no existe o no pertenece a un equipo de mantenimiento',
    );
  }
  if (next.isSupplier) {
    throw new ConflictException(
      'No se puede asignar a un proveedor por esta vía',
    );
  }
  if (next.team === null || !teamIds.includes(next.team.id)) {
    throw new BadRequestException(
      'El técnico no pertenece a un equipo de mantenimiento',
    );
  }

  if (currentId == null) return;
  const current = employees.find((employee) => employee.id === currentId);
  const supplier = current ? current.isSupplier : currentIsSupplier;
  if (supplier === undefined) {
    throw new BadGatewayException(
      'No se pudo comprobar quién atiende la orden: comprobar antes de repetir',
    );
  }
  if (supplier) {
    throw new ConflictException(
      'La orden la atiende un proveedor y no se puede reasignar',
    );
  }
};

/** Lo que falta para asignar un correctivo, con los valores ya fusionados. */
export const missingForAssign = (merged: {
  plannedStartTime?: string | null;
  priority?: unknown;
  categoryId?: unknown;
  subcategoryId?: unknown;
}): string[] => {
  const missing: string[] = [];
  if (!merged.plannedStartTime) missing.push('plannedStartTime');
  if (merged.priority == null) missing.push('priority');
  if (merged.categoryId == null || merged.subcategoryId == null) {
    missing.push('categoryId');
  }
  return missing;
};
