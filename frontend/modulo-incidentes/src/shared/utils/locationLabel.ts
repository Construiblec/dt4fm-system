/**
 * OpenMAINT describe edificios y espacios como «Código - Nombre» («REP3 - Proy2»).
 * Para mostrar solo interesa el nombre; si no sigue ese patrón se deja tal cual.
 */
export const withoutCode = (value: string | null | undefined): string | null => {
  const text = value?.trim();
  if (!text) return null;
  const name = /^[^\s]+\s+-\s+(.+)$/.exec(text)?.[1]?.trim();
  return name || text;
};

/** «Edificio · Área», o la planta si no hay área. */
export const formatPlace = (
  site: string | null | undefined,
  area: string | null | undefined,
  floor: string | null | undefined,
): string | null =>
  [withoutCode(site), withoutCode(area) ?? withoutCode(floor)]
    .filter(Boolean)
    .join(" · ") || null;
