import {
  getPreventiveStatusBar,
  getPreventiveStatusLabel,
  getPreventiveStatusPill,
} from "@/modules/incidentes/constants/preventiveStatus";
import {
  preventiveFields,
  preventiveNoticeText,
  type PreventivePerspective,
} from "@/modules/incidentes/utils/preventiveCard";
import { PriorityPill, WorkCard } from "@/shared/components/WorkCard";
import { toPriorityCode } from "@/shared/constants/priority";
import { OVERDUE_STYLE } from "@/shared/constants/statusPalette";
import { useMinuteClock } from "@/shared/hooks/useMinuteClock";

/**
 * Vista mínima del preventivo para su tarjeta. El correctivo tiene la suya:
 * `CorrectiveCard`.
 */
export type MaintenanceCardData = {
  id: number;
  number: string | null;
  /** Asunto del preventivo */
  subject: string | null;
  /** Código estable; nunca la etiqueta traducida */
  statusCode: string | null;
  /** Etiqueta de OpenMAINT, como respaldo si el código no está mapeado */
  status: string | null;
  site: string | null;
  /** Equipo o activo intervenido */
  target: string | null;
  assignee: string | null;
  /** Los preventivos no la traen hoy; se pinta si algún día llega */
  priorityCode: string | null;
  plannedStart: string | null;
  dueDate: string | null;
  execStartDate: string | null;
  execEndDate: string | null;
  /** Solo mientras está suspendido */
  suspensionReason: string | null;
  isOverdue: boolean;
};

type Props = {
  maintenance: MaintenanceCardData;
  /** El equipo ve sus propias tareas: mostrar el responsable sobra */
  perspective: PreventivePerspective;
  /** Ruta del detalle; con `disabledReason` la tarjeta no se abre */
  to: string;
  disabledReason?: string | null;
  actionLabel?: string;
};

/** Tarjeta de mantenimiento preventivo, para el equipo y para el supervisor. */
export const MaintenanceCard = ({
  maintenance,
  perspective,
  to,
  disabledReason = null,
  actionLabel,
}: Props) => {
  const code = maintenance.statusCode ?? "";
  const now = useMinuteClock(maintenance.isOverdue);
  const priority = toPriorityCode(maintenance.priorityCode);
  const noticeText = preventiveNoticeText(maintenance, now);

  return (
    <WorkCard
      number={maintenance.number ?? "Preventivo"}
      statusLabel={getPreventiveStatusLabel(code, maintenance.status)}
      statusPill={getPreventiveStatusPill(code)}
      bar={
        maintenance.isOverdue
          ? OVERDUE_STYLE.bar
          : getPreventiveStatusBar(code)
      }
      title={maintenance.subject?.trim() || "Sin descripción"}
      notice={noticeText ? { tone: "overdue", text: noticeText } : null}
      fields={preventiveFields(maintenance, perspective)}
      footerStart={priority ? <PriorityPill code={priority} /> : null}
      to={to}
      disabledReason={disabledReason}
      actionLabel={
        actionLabel ??
        (perspective === "operator" && code === "Execution"
          ? "Continuar"
          : "Ver detalle")
      }
    />
  );
};
