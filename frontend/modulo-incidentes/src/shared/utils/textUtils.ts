export function cleanObservationText(text: string | null | undefined): string {
  if (!text) return "";
  // Elimina "Nota X" seguido de saltos de línea, o simplemente "Nota X"
  return text.replace(/Nota \d+\r?\n?/g, "").trim();
}
