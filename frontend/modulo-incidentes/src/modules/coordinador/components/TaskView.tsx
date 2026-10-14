import { useState, type ReactNode } from "react";
import {
  Ban,
  ChevronDown,
  ChevronUp,
  CirclePause,
  FileText,
  Play,
  RotateCcw,
} from "lucide-react";
import type { CoordTaskDetail, EmployeeOption } from "../types/Coordinador";
import {
  formatDate,
  formatDuration,
  formatTime,
  relativeDay,
  todayYmd,
  ymdOf,
} from "../domain/dates";
import { isReopened, parseTeamLog } from "../domain/tasks";
import { ChecklistPreview, ChecklistSummaryLine } from "./pickers";
import { employeeName, plannedLabel, unitLabel } from "./taskLabels";
import { Button, Details, InlineAlert } from "./ui";
import { cx } from "./uiUtils";

const lastPause = (task: CoordTaskDetail) => {
  const pauses = parseTeamLog(task.teamObservations).filter(
    (e) => e.type === "pause",
  );
  return pauses.length ? pauses[pauses.length - 1] : null;
};

const StateBanner = ({ task }: { task: CoordTaskDetail }) => {
  const who = employeeName(task.employee);

  if (task.phase === "Cancelled") {
    return (
      <InlineAlert tone="error" icon={Ban} title="Cancelada">
        No aparece en la agenda y no se puede editar.
      </InlineAlert>
    );
  }
  if (task.phase === "Reviewed") {
    return (
      <InlineAlert tone="success" title="Revisada">
        Supervisión la aprobó. Solo lectura.
      </InlineAlert>
    );
  }
  if (task.phase === "Completed") {
    return (
      <InlineAlert tone="review" title="Completada">
        Espera la revisión de supervisión. Solo lectura.
      </InlineAlert>
    );
  }
  if (task.phase === "InExecution") {
    return (
      <InlineAlert tone="progress" title="En ejecución">
        {who} empezó a las {formatTime(task.actualStartTime)}. Solo lectura.
      </InlineAlert>
    );
  }
  if (task.isPaused) {
    const pause = lastPause(task);
    const sentence =
      `${who} la empezó a las ${formatTime(task.actualStartTime)}` +
      (pause ? ` y la pausó a las ${pause.time}` : "") +
      (pause?.text && /[p{L}p{N}]/u.test(pause.text)
        ? `: «${pause.text}»`
        : ".") +
      ` Lleva ${formatDuration(task.executionTime ?? 0)} trabajados.` +
      " Mientras esté en pausa no se puede editar ni reasignar.";
    return (
      <InlineAlert tone="paused" title="En pausa">
        {sentence}
      </InlineAlert>
    );
  }
  if (isReopened(task)) {
    return (
      <InlineAlert tone="reopened" title="Reabierta por supervisión">
        La gestiona Supervisión de limpieza: el coordinador no la edita.
      </InlineAlert>
    );
  }
  return null;
};

const TEAM_LOG = {
  pause: { label: "Pausa", icon: CirclePause, color: "text-violet-600" },
  resume: { label: "Reanudada", icon: Play, color: "text-blue-600" },
  restart: { label: "Reiniciada", icon: RotateCcw, color: "text-rose-600" },
  note: { label: "Nota", icon: FileText, color: "text-slate-500" },
} as const;

const TeamLog = ({ text }: { text: string | null }) => {
  const entries = parseTeamLog(text);
  if (entries.length === 0) return null;

  return (
    <ol className="space-y-2">
      {entries.map((entry, i) => {
        const meta = TEAM_LOG[entry.type];
        const Icon = meta.icon;
        return (
          <li key={i} className="flex items-start gap-3 text-sm">
            <Icon
              className={cx("mt-0.5 h-4 w-4 shrink-0", meta.color)}
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="font-semibold text-slate-800">
                {meta.label}
                {entry.time ? (
                  <span className="ml-1 font-normal tabular-nums text-slate-500">
                    {formatDate(entry.date)} · {entry.time}
                  </span>
                ) : null}
                {entry.carryMinutes != null ? (
                  <span className="ml-1 font-normal text-slate-500">
                    · {entry.carryMinutes} min previos
                  </span>
                ) : null}
              </p>
              {entry.text ? (
                <p className="text-slate-600">{entry.text}</p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
};

const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm">
    <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
    {children}
  </section>
);

/** La tarjeta de solo lectura: lo que se programó, lo que pasó en la ejecución y lo que dijo supervisión. */
export const TaskView = ({
  task,
  employees,
  nowMs,
}: {
  task: CoordTaskDetail;
  employees: EmployeeOption[];
  nowMs: number;
}) => {
  const [showChecklist, setShowChecklist] = useState(false);
  const today = todayYmd(nowMs);
  const full = task.employee
    ? employees.find((e) => e.id === task.employee?.id)
    : null;
  const isHostaway = task.source === "Hostaway";
  const listingLabel = task.description?.replace(/^Limpieza - /, "") ?? "";

  const programacion = [
    {
      label: "Unidad",
      value: task.unit
        ? `${unitLabel(task.unit)} (${task.unit.code})`
        : task.hostawayListingId
          ? "Sin unidad: el listing no tiene una única unidad en openMAINT"
          : null,
    },
    isHostaway
      ? {
          label: "Listing de Hostaway",
          value: [listingLabel, task.hostawayListingId]
            .filter(Boolean)
            .join(" · "),
        }
      : null,
    isHostaway
      ? {
          label: "Reserva de Hostaway",
          value: <span className="font-mono">{task.hostawayReservation}</span>,
        }
      : null,
    isHostaway
      ? {
          label: "Fecha de checkout",
          value: `${formatDate(task.checkoutDate)} (${relativeDay(task.checkoutDate, today)})`,
        }
      : null,
    {
      label: isHostaway ? "Sincronizada el" : "Creada el",
      value: formatDate(task.generatedDate),
    },
    {
      label: "Horario planificado",
      value: task.plannedStartTime ? plannedLabel(task) : null,
    },
    {
      label: "Empleado",
      value: task.employee
        ? employeeName(task.employee) +
          (full?.team ? ` · ${full.team.name}` : "")
        : null,
    },
    {
      label: "Checklist",
      value: task.checklistDetail ? (
        <>
          {task.checklistDetail.templateName ??
            task.checklistDetail.description}
          <br />
          <span className="text-xs text-slate-500">
            <ChecklistSummaryLine rows={task.checklistDetail.activities} />
          </span>
        </>
      ) : null,
    },
    { label: "Observaciones", value: task.taskObservations, wide: true },
  ];

  const executed = task.actualStartTime
    ? [
        {
          label: "Inicio real",
          value: `${formatDate(ymdOf(task.actualStartTime))} · ${formatTime(task.actualStartTime)}`,
        },
        {
          label: "Fin real",
          value: task.actualEndTime
            ? formatTime(task.actualEndTime)
            : task.phase === "InExecution"
              ? "En curso"
              : null,
        },
        {
          label: "Tiempo trabajado",
          value:
            task.executionTime != null
              ? formatDuration(task.executionTime)
              : null,
        },
        {
          label: "Retraso al empezar",
          value:
            task.delayTime != null
              ? task.delayTime > 0
                ? formatDuration(task.delayTime)
                : "Sin retraso"
              : null,
        },
      ]
    : null;

  return (
    <div className="space-y-4">
      <StateBanner task={task} />

      <Section title="Programación">
        <Details items={programacion} />
      </Section>

      {executed ? (
        <Section title="Ejecución">
          <Details items={executed} />
        </Section>
      ) : null}

      {task.teamObservations ? (
        <Section title="Bitácora del equipo">
          <TeamLog text={task.teamObservations} />
        </Section>
      ) : null}

      {task.supervisionObserv ? (
        <Section title="Supervisión">
          <p className="rounded-xl bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
            {task.supervisionObserv}
          </p>
        </Section>
      ) : null}

      {task.phase === "Cancelled" && task.cancelReason ? (
        <Section title="Motivo de cancelación">
          <p className="text-sm text-slate-700">{task.cancelReason}</p>
        </Section>
      ) : null}

      {task.checklistDetail ? (
        <Section title="Checklist">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
            <span>
              {task.checklistDetail.templateName ??
                task.checklistDetail.description}
            </span>
            <Button
              size="sm"
              variant="ghost"
              icon={showChecklist ? ChevronUp : ChevronDown}
              onClick={() => setShowChecklist((v) => !v)}
            >
              {showChecklist ? "Ocultar actividades" : "Ver actividades"}
            </Button>
          </div>
          {showChecklist ? (
            <ChecklistPreview rows={task.checklistDetail.activities} />
          ) : null}
        </Section>
      ) : null}
    </div>
  );
};
