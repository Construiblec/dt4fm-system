import type { PreventiveChecklistItem } from "@/modules/incidentes/types/PreventiveChecklist";

/** OpenMAINT etiqueta el Flag «Hecho / Que hacer»; al técnico le dice más un sí/no. */
export const FLAG_LABELS = ["Sí", "No"];

/**
 * Texto legible del resultado registrado, o `null` si no hay ninguno.
 *
 * Los desplegables guardan el ID del lookup y las fechas un ISO: mostrarlos
 * crudos no le dice nada al técnico.
 */
export const formatChecklistOutcome = (
  item: PreventiveChecklistItem,
): string | null => {
  if (item.value === null || item.value === "") {
    return null;
  }

  const raw = String(item.value);
  const index = item.options?.findIndex((option) => option.id === raw) ?? -1;

  if (item.options && index !== -1) {
    return item.kind === "flag"
      ? (FLAG_LABELS[index] ?? item.options[index].label)
      : item.options[index].label;
  }

  if (item.kind === "date" || item.kind === "datetime") {
    const date = new Date(raw);

    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString(
        "es-EC",
        item.kind === "date"
          ? { dateStyle: "medium" }
          : { dateStyle: "medium", timeStyle: "short" },
      );
    }
  }

  return raw;
};
