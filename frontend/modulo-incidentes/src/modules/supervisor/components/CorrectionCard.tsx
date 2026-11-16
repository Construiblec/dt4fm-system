import { Building2, CalendarCheck, ListChecks, MapPin } from "lucide-react";
import { WorkCard } from "@/shared/components/WorkCard";
import {
  getSupervisionPhaseLabel,
  getSupervisionPhaseLevel,
} from "@/modules/supervisor/constants/supervisionStatus";
import type { MyCorrection } from "@/modules/supervisor/types/Supervision";
import { plural } from "@/modules/supervisor/utils/supervisionView";
import { barClass, pillClass } from "@/shared/constants/statusPalette";
import {
  dateField,
  type WorkCardField,
} from "@/shared/utils/workCardFields";

/** Tarjeta de una corrección asignada al operario, en su lista de Limpieza. */
export const CorrectionCard = ({ correction }: { correction: MyCorrection }) => {
  const level = getSupervisionPhaseLevel(correction.phase);
  const fields: WorkCardField[] = [
    {
      icon: MapPin,
      label: "Ubicación",
      value: correction.unit?.description ?? "Sin unidad",
    },
  ];
  if (correction.buildingName) {
    fields.push({
      icon: Building2,
      label: "Edificio",
      value: correction.buildingName,
    });
  }
  fields.push(
    {
      icon: ListChecks,
      label: "Por corregir",
      value: plural(correction.findingsCount, "novedad", "novedades"),
    },
    dateField(CalendarCheck, "Limpieza del", correction.actualEndTime),
  );

  return (
    <WorkCard
      number={correction.taskNumber ?? `Supervisión ${correction.id}`}
      statusLabel={getSupervisionPhaseLabel(correction.phase)}
      statusPill={pillClass(level)}
      bar={barClass(level)}
      title={`Corregir ${correction.unit?.description ?? "la unidad"}`}
      fields={fields}
      to={`/cleaning-corrections/${correction.id}`}
      actionLabel="Ver correcciones"
    />
  );
};
