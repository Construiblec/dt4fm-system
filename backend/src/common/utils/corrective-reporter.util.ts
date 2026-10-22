export type ReporterKind = 'staff' | 'guest' | 'visitor' | 'iot';

export type CorrectiveReporter = { name: string; kind: ReporterKind };

const IOT_HEADER = /^Alarma automática del Sistema IoT/;
const IOT_LABEL = 'Sistema IoT';

/** Lee `Nombre:` del bloque `--- Datos del huésped|visitante ---` de la nota de reporte. */
const readBlockName = (
  notes: string,
  block: 'huésped' | 'visitante',
): string | null => {
  const start = notes.search(
    new RegExp(`---\\s*Datos del ${block}\\s*---`, 'i'),
  );

  if (start < 0) {
    return null;
  }

  const name = /Nombre:\s*([^\n]+)/i.exec(notes.slice(start))?.[1]?.trim();

  return name && name !== 'No disponible' ? name : null;
};

/**
 * Quién reportó un correctivo. Huésped, visitante e IoT comparten un solicitante
 * técnico en OpenMAINT, así que su nombre real sale de la nota de reporte.
 */
export function resolveReporter(
  reportNotes: string | null,
  requesterDescription: string | null | undefined,
): CorrectiveReporter | null {
  const notes = reportNotes ?? '';

  if (IOT_HEADER.test(notes.trim())) {
    return { name: IOT_LABEL, kind: 'iot' };
  }

  const guest = readBlockName(notes, 'huésped');
  if (guest) {
    return { name: guest, kind: 'guest' };
  }

  const visitor = readBlockName(notes, 'visitante');
  if (visitor) {
    return { name: visitor, kind: 'visitor' };
  }

  return requesterDescription
    ? { name: requesterDescription, kind: 'staff' }
    : null;
}
