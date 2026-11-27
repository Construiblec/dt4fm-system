/** Condición de filtro de CMDBuild, simple o compuesta. */
export type FilterCondition =
  | { simple: { attribute: string; operator: string; value?: string[] } }
  | { or: FilterCondition[] }
  | { and: FilterCondition[] };

/** Rango `[from, to)` de instantes ISO; cualquiera de los extremos puede faltar. */
export type InstantRange = { from?: string; to?: string };

export const equalsCondition = (
  attribute: string,
  value: number,
): FilterCondition => ({
  simple: { attribute, operator: 'equal', value: [String(value)] },
});

export const nullCondition = (
  attribute: string,
  isNull: boolean,
): FilterCondition => ({
  simple: { attribute, operator: isNull ? 'isnull' : 'isnotnull' },
});

/**
 * `[from, to)`: `greater` y `less` son estrictos y comparan la marca completa,
 * así que el extremo inferior se corre 1 ms y el superior queda tal cual.
 */
export const instantRange = (
  attribute: string,
  { from, to }: InstantRange = {},
): FilterCondition | null => {
  const conditions: FilterCondition[] = [];

  if (from) {
    conditions.push({
      simple: {
        attribute,
        operator: 'greater',
        value: [new Date(new Date(from).getTime() - 1).toISOString()],
      },
    });
  }
  if (to) {
    conditions.push({
      simple: {
        attribute,
        operator: 'less',
        value: [new Date(to).toISOString()],
      },
    });
  }

  if (conditions.length === 0) return null;
  return conditions.length === 1 ? conditions[0] : { and: conditions };
};

/** Solo las condiciones presentes; el `and` va dentro de `attribute`. */
export const composeFilter = (conditions: (FilterCondition | null)[]) => {
  const present = conditions.filter(
    (condition): condition is FilterCondition => condition !== null,
  );

  if (present.length === 0) return {};

  return { attribute: present.length === 1 ? present[0] : { and: present } };
};
