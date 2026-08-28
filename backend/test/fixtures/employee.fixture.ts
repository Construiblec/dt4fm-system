export interface EmployeeOptions {
  id: number;
  team?: number | null;
  type?: string;
  description?: string;
}

/** Ficha `Employee` de openMAINT — usada en reasignación de cesionario. */
export const employeeCard = (opts: EmployeeOptions) => ({
  _id: opts.id,
  Description: opts.description ?? `Empleado ${opts.id}`,
  Team: opts.team ?? null,
  _Team_description: opts.team ? `Equipo ${opts.team}` : null,
  _type: opts.type ?? 'Employee',
});

export const employeesResponse = (
  employees: ReturnType<typeof employeeCard>[],
) => ({
  data: employees,
});
