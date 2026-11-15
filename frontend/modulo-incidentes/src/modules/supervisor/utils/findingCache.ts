import type {
  SupervisionDetail,
  SupervisionFinding,
} from "@/modules/supervisor/types/Supervision";

/**
 * Cambios optimistas sobre el detalle en caché. Funciones puras: reciben el
 * detalle y devuelven uno nuevo, así que se prueban sin React ni red.
 */

const withFindings = (
  detail: SupervisionDetail,
  findings: SupervisionFinding[],
): SupervisionDetail => ({ ...detail, findings });

/** Añade una novedad (la temporal, con id negativo) al final. */
export const addFinding = (
  detail: SupervisionDetail,
  finding: SupervisionFinding,
): SupervisionDetail => withFindings(detail, [...detail.findings, finding]);

/** Sustituye una novedad (por ejemplo, la temporal por la real). */
export const replaceFinding = (
  detail: SupervisionDetail,
  id: number,
  next: SupervisionFinding,
): SupervisionDetail =>
  withFindings(
    detail,
    detail.findings.map((finding) => (finding.id === id ? next : finding)),
  );

/** Aplica cambios parciales a una novedad. */
export const patchFinding = (
  detail: SupervisionDetail,
  id: number,
  patch: Partial<SupervisionFinding>,
): SupervisionDetail =>
  withFindings(
    detail,
    detail.findings.map((finding) =>
      finding.id === id ? { ...finding, ...patch } : finding,
    ),
  );

/** Quita una novedad y recuerda dónde estaba, para poder devolverla. */
export const removeFinding = (
  detail: SupervisionDetail,
  id: number,
): {
  detail: SupervisionDetail;
  removed: SupervisionFinding | null;
  position: number;
} => {
  const position = detail.findings.findIndex((finding) => finding.id === id);
  if (position === -1) return { detail, removed: null, position };
  return {
    detail: withFindings(
      detail,
      detail.findings.filter((finding) => finding.id !== id),
    ),
    removed: detail.findings[position],
    position,
  };
};

/** Devuelve una novedad a su posición (si el borrado falló). */
export const restoreFinding = (
  detail: SupervisionDetail,
  finding: SupervisionFinding,
  position: number,
): SupervisionDetail => {
  if (detail.findings.some((f) => f.id === finding.id)) return detail;
  const findings = [...detail.findings];
  findings.splice(Math.min(Math.max(position, 0), findings.length), 0, finding);
  return withFindings(detail, findings);
};

/** Quita una foto confirmada de una novedad (borrado optimista). */
export const removePhoto = (
  detail: SupervisionDetail,
  findingId: number,
  photoId: string,
): SupervisionDetail =>
  withFindings(
    detail,
    detail.findings.map((finding) =>
      finding.id === findingId
        ? {
            ...finding,
            photos: finding.photos.filter((photo) => photo.id !== photoId),
          }
        : finding,
    ),
  );
