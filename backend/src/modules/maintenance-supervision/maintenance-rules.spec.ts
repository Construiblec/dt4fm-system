import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import type { MaintenanceEmployee } from './maintenance-integration.types';
import {
  assertReassignable,
  canWrite,
  missingForAssign,
  toSeconds,
  writableStatuses,
} from './maintenance-rules';

const employee = (
  id: number,
  teamId: number | null,
  isSupplier = false,
): MaintenanceEmployee => ({
  id,
  name: `Empleado ${id}`,
  team: teamId === null ? null : { id: teamId, name: null },
  isSupplier,
});

const EMPLOYEES = [
  employee(1, 501),
  employee(2, 502),
  employee(3, 501, true),
  employee(4, 999),
  employee(5, null),
];
const TEAMS = [501, 502];

describe('maintenance-rules', () => {
  describe('estados en que se escribe cada campo', () => {
    it.each([
      ['preventive', 'employeeId', 'Planning', true],
      ['preventive', 'employeeId', 'Acceptance', true],
      ['preventive', 'employeeId', 'Execution', true],
      ['preventive', 'employeeId', 'Suspension', true],
      ['preventive', 'employeeId', 'Completed', false],
      ['preventive', 'employeeId', 'Canceled', false],
      ['preventive', 'plannedStartTime', 'Acceptance', true],
      ['preventive', 'plannedStartTime', 'Planning', false],
      ['preventive', 'plannedStartTime', 'Execution', false],
      ['preventive', 'teamId', 'Acceptance', false],
      ['preventive', 'priority', 'Acceptance', false],
      ['corrective', 'employeeId', 'Assignment', true],
      ['corrective', 'employeeId', 'Assigned', true],
      ['corrective', 'employeeId', 'Execution', true],
      ['corrective', 'employeeId', 'Accounting', false],
      ['corrective', 'plannedStartTime', 'Assignment', true],
      ['corrective', 'plannedStartTime', 'Assigned', false],
      ['corrective', 'teamId', 'Execution', false],
      ['corrective', 'priority', 'Assignment', true],
    ] as const)('%s · %s en %s: %s', (kind, field, status, expected) => {
      expect(canWrite(kind, field, status)).toBe(expected);
    });

    it('un estado desconocido no escribe nada', () => {
      expect(canWrite('preventive', 'employeeId', null)).toBe(false);
      expect(writableStatuses('preventive', 'category')).toEqual([]);
    });
  });

  describe('assertReassignable', () => {
    const run = (current: number | null, next: number) =>
      assertReassignable(EMPLOYEES, current, next, TEAMS);

    it('deja asignar a un técnico de un equipo de mantenimiento', () => {
      expect(() => run(null, 1)).not.toThrow();
      expect(() => run(1, 2)).not.toThrow();
    });

    it('400 si el destino no existe o es de otro equipo', () => {
      expect(() => run(null, 77)).toThrow(BadRequestException);
      expect(() => run(null, 4)).toThrow(BadRequestException);
      expect(() => run(null, 5)).toThrow(BadRequestException);
    });

    it('409 si el destino es un proveedor', () => {
      expect(() => run(null, 3)).toThrow(ConflictException);
    });

    it('409 si el origen es un proveedor', () => {
      expect(() => run(3, 1)).toThrow(ConflictException);
    });

    it('un origen fuera de la lista exige su ficha: sin ella, 502', () => {
      expect(() => run(77, 1)).toThrow(BadGatewayException);
      // En la lista, aunque sea de otro equipo, se sabe que no es proveedor.
      expect(() => run(4, 1)).not.toThrow();
    });

    it('un origen fuera de la lista: proveedor 409, no proveedor pasa', () => {
      expect(() => assertReassignable(EMPLOYEES, 77, 1, TEAMS, true)).toThrow(
        ConflictException,
      );
      expect(() =>
        assertReassignable(EMPLOYEES, 77, 1, TEAMS, false),
      ).not.toThrow();
    });

    it('un proveedor de un equipo fuera de la lista también es 409 como destino', () => {
      const list = [employee(8, 999, true)];
      expect(() => assertReassignable(list, null, 8, TEAMS)).toThrow(
        ConflictException,
      );
    });
  });

  describe('missingForAssign', () => {
    it('nada falta con todo presente', () => {
      expect(
        missingForAssign({
          plannedStartTime: '2026-11-26T10:00:00Z',
          priority: 'High',
          categoryId: 1,
          subcategoryId: 2,
        }),
      ).toEqual([]);
    });

    it('lista lo que falta', () => {
      expect(missingForAssign({})).toEqual([
        'plannedStartTime',
        'priority',
        'categoryId',
      ]);
      expect(
        missingForAssign({
          plannedStartTime: null,
          priority: 'Low',
          categoryId: 1,
        }),
      ).toEqual(['plannedStartTime', 'categoryId']);
    });
  });

  describe('toSeconds', () => {
    it('descarta los milisegundos y tolera lo vacío', () => {
      expect(toSeconds('2026-11-26T10:00:00.900Z')).toBe(
        toSeconds('2026-11-26T10:00:00Z'),
      );
      expect(toSeconds(null)).toBeNull();
      expect(toSeconds('no es fecha')).toBeNull();
    });
  });
});
