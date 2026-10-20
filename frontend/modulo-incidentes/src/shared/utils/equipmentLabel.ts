/** «Código - Nombre» una sola vez, aunque la descripción ya traiga el código. */
export const equipmentLabel = (
  code: string | null | undefined,
  description: string | null | undefined,
): string => {
  if (!description) return code ?? "Equipo";
  if (!code || description.startsWith(code)) return description;
  return `${code} - ${description}`;
};
