import type {
  SupervisionArea,
  SupervisionFinding,
} from "@/modules/supervisor/types/Supervision";

/** Tope del backend por novedad. */
export const MAX_FINDING_PHOTOS = 2;

/** Tope de la observación en el backend. */
export const MAX_FINDING_OBSERVATION = 500;

/** Iniciales para el avatar redondo de un operario («maria.lopez» → «ML»). */
export const initialsOf = (name: string) =>
  name
    .replace(/[._-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

/** Novedades de un punto del checklist, por su número de fila. */
export const findingsOfPoint = (
  findings: SupervisionFinding[],
  index: number,
) => findings.filter((finding) => finding.index === index);

/** Cuántas novedades tiene cada área. Un área sin novedades no prueba nada: solo no tiene registros. */
export const findingsByArea = (
  areas: SupervisionArea[],
  findings: SupervisionFinding[],
) =>
  areas.map((area) => {
    const indexes = new Set(area.points.map((point) => point.index));
    return {
      name: area.name,
      count: findings.filter(
        (finding) => finding.index !== null && indexes.has(finding.index),
      ).length,
    };
  });

/** «Dormitorios · Polvo en superficies», o el número si el checklist no se pudo leer. */
export const pointLabel = (finding: SupervisionFinding) =>
  finding.point
    ? `${finding.point.area} · ${finding.point.name}`
    : `Punto ${finding.index ?? "?"}`;

/** Título de la novedad: la observación si es «Otro», si no la subcategoría. */
export const findingTitle = (finding: SupervisionFinding) => {
  const name = finding.subcategory?.name ?? "Novedad";
  if (finding.subcategory?.isOther && finding.observation) {
    return `${name} · ${finding.observation}`;
  }
  return name;
};

export const countPhotos = (findings: SupervisionFinding[]) =>
  findings.reduce((total, finding) => total + finding.photos.length, 0);

export const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** Las que van a corrección: las que el supervisor no resolvió. */
export const pendingFindings = (findings: SupervisionFinding[]) =>
  findings.filter((finding) => !finding.resolvedBySupervisor);

/** Las que el supervisor resolvió al momento: no se envían al operario. */
export const resolvedFindings = (findings: SupervisionFinding[]) =>
  findings.filter((finding) => finding.resolvedBySupervisor);
