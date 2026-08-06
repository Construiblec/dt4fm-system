/**
 * OpenMAINT describe el equipo como `Código - Descripción`, y el código es un
 * identificador autogenerado que no le dice nada al técnico.
 */
export const stripLeadingCode = (description: string) => {
  const separator = description.indexOf(" - ");

  return separator === -1
    ? description
    : description.slice(separator + 3).trim();
};
