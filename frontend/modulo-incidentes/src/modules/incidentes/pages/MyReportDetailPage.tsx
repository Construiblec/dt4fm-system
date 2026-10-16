import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CircleAlert,
  MapPin,
  X,
} from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import {
  ProgressRing,
  ReporterChip,
} from "@/modules/incidentes/components/ProgressRing";
import {
  REPORTER_STEPS,
  REPORTER_TONES,
  toReporterStep,
} from "@/modules/incidentes/constants/reporterStatus";
import {
  REPORTED_INCIDENTS_KEY,
  useReportedIncidents,
} from "@/modules/incidentes/hooks/useReportedIncidents";
import { getIncidentById } from "@/modules/incidentes/services/incidentDetailService";
import type { IncidentDetail } from "@/modules/incidentes/types/IncidentDetail";
import type { LogEntry } from "@/shared/components/NotesLogCard";
import { PhotoLightbox } from "@/shared/components/PhotoLightbox";
import { formatDayMonthTime } from "@/shared/utils/dateUtils";
import { formatPlace } from "@/shared/utils/locationLabel";

type StepState = "done" | "current" | "todo" | "fail";

type TimelineStep = {
  label: string;
  at: string | null;
  text: string | null;
  state: StepState;
};

const lastEntry = (log: LogEntry[], stepCode: string, withNote = false) =>
  [...log]
    .reverse()
    .find(
      (entry) =>
        entry.stepCode === stepCode &&
        !entry.isRejection &&
        (!withNote || entry.note.trim()),
    ) ?? null;

const buildTimeline = (
  detail: IncidentDetail,
  extra: { plannedStart?: string | null; execStartDate?: string | null },
): TimelineStep[] => {
  const status = toReporterStep(detail.statusCode);
  const log = detail.log ?? [];

  if (status.step < 0) {
    const last = log[log.length - 1] ?? null;
    return [
      { label: "Recibido", at: detail.createdAt, text: null, state: "done" },
      {
        label: "Descartado",
        at: last?.at ?? null,
        text: "Revisado por el supervisor de mantenimiento.",
        state: "fail",
      },
    ];
  }

  const at = [
    detail.createdAt,
    lastEntry(log, "CM02")?.at ?? null,
    extra.execStartDate ?? lastEntry(log, "CM03")?.at ?? null,
    status.step === 3 ? (log[log.length - 1]?.at ?? null) : null,
  ];

  const text = [
    "Tu reporte llegó al equipo de mantenimiento.",
    extra.plannedStart
      ? `Atención prevista ${formatDayMonthTime(extra.plannedStart)}.`
      : "Un técnico tomó tu caso.",
    status.step === 2 ? `${status.phrase}.` : "El técnico trabajó en el sitio.",
    status.step === 3
      ? "Trabajo revisado y aprobado."
      : "Aquí verás cuando quede listo.",
  ];

  return REPORTER_STEPS.map((label, index) => ({
    label,
    at: index <= status.step ? at[index] : null,
    text: text[index],
    state:
      index < status.step || status.step === 3
        ? "done"
        : index === status.step
          ? "current"
          : "todo",
  }));
};

const Timeline = ({
  steps,
  stroke,
}: {
  steps: TimelineStep[];
  stroke: string;
}) => (
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="text-[15px] font-bold text-slate-900">Seguimiento</h2>
    <ol className="mt-3">
      {steps.map((step, index) => {
        const last = index === steps.length - 1;
        const color = step.state === "fail" ? "#e11d48" : stroke;

        return (
          <li key={step.label} className="flex gap-3">
            <div className="flex w-[22px] shrink-0 flex-col items-center">
              <span
                className="flex h-[22px] w-[22px] items-center justify-center rounded-full border-2"
                style={{
                  borderColor: step.state === "todo" ? "#cbd5e1" : color,
                  backgroundColor:
                    step.state === "done" || step.state === "fail"
                      ? color
                      : "#fff",
                }}
              >
                {step.state === "done" ? (
                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                ) : step.state === "fail" ? (
                  <X className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                ) : step.state === "current" ? (
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                ) : null}
              </span>
              {!last ? (
                <span
                  className="w-0.5 flex-1"
                  style={{
                    backgroundColor: step.state === "done" ? color : "#e2e8f0",
                  }}
                />
              ) : null}
            </div>

            <div className={`min-w-0 flex-1 ${last ? "" : "pb-4"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <p
                  className={`text-sm ${
                    step.state === "todo"
                      ? "font-medium text-slate-400"
                      : "font-bold text-slate-900"
                  }`}
                >
                  {step.label}
                </p>
                {step.at ? (
                  <span className="shrink-0 text-xs text-slate-500">
                    {formatDayMonthTime(step.at)}
                  </span>
                ) : null}
              </div>
              {step.text ? (
                <p
                  className={`mt-0.5 text-[13px] ${
                    step.state === "todo" ? "text-slate-400" : "text-slate-600"
                  }`}
                >
                  {step.text}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  </section>
);

export const MyReportDetailPage = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const [photo, setPhoto] = useState<string | null>(null);
  const reported = useReportedIncidents();
  const listItem = reported.data?.find((report) => String(report.id) === id);

  const {
    data: detail,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: [...REPORTED_INCIDENTS_KEY, id],
    queryFn: () => getIncidentById(id),
    enabled: Boolean(id),
  });

  const status = toReporterStep(detail?.statusCode ?? listItem?.statusCode);
  const tone = REPORTER_TONES[status.tone];
  const log = detail?.log ?? [];
  const resolution = lastEntry(log, "CM03", true)?.note ?? null;
  const reason = status.step < 0 ? log[log.length - 1]?.note || null : null;
  const place = detail
    ? formatPlace(
        detail.building,
        detail.unit ?? detail.commonArea,
        detail.floor,
      )
    : null;

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen bg-gray-100 pb-8">
        <header className="flex items-center gap-3 px-4 pb-1 pt-4">
          <button
            type="button"
            onClick={() =>
              window.history.length > 1
                ? navigate(-1)
                : navigate("/mis-reportes")
            }
            aria-label="Volver"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-900"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-lg font-bold text-slate-900">Mi reporte</h1>
        </header>

        <div className="space-y-3.5 px-4 pt-3">
          {isPending ? (
            <p className="rounded-2xl bg-white p-4 text-sm text-slate-500 shadow-sm">
              Cargando tu reporte…
            </p>
          ) : isError || !detail ? (
            <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-600 shadow-sm">
              No se pudo cargar el reporte.{" "}
              <button
                type="button"
                onClick={() => void refetch()}
                className="font-semibold underline"
              >
                Reintentar
              </button>
            </div>
          ) : (
            <>
              <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <ProgressRing status={status} />
                  <div className="space-y-1">
                    <p className="text-xs font-bold text-slate-600">
                      {detail.number}
                    </p>
                    <ReporterChip status={status} />
                  </div>
                </div>
                <h2 className="text-lg font-bold leading-snug text-slate-900">
                  {detail.location || detail.number}
                </h2>
                <div className="space-y-1.5 rounded-xl bg-slate-50 px-3 py-2.5 text-[13px]">
                  {place ? (
                    <p className="flex items-center gap-2 font-medium text-slate-900">
                      <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                      {place}
                    </p>
                  ) : null}
                  <p className="flex items-center gap-2 text-slate-600">
                    <CalendarDays className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                    Reportado {formatDayMonthTime(detail.createdAt)}
                  </p>
                </div>
              </section>

              {status.step === 3 && resolution ? (
                <section className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <h2 className="flex items-center gap-2 text-[15px] font-bold text-emerald-800">
                    <Check className="h-4 w-4" strokeWidth={3} />
                    Cómo se resolvió
                  </h2>
                  <p className="text-sm leading-relaxed text-emerald-800">
                    {resolution}
                  </p>
                </section>
              ) : null}

              {status.step < 0 ? (
                <section className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 p-4">
                  <h2 className="flex items-center gap-2 text-[15px] font-bold text-rose-800">
                    <CircleAlert className="h-4 w-4" />
                    Por qué no procede
                  </h2>
                  <p className="text-sm leading-relaxed text-rose-800">
                    {reason ??
                      "El supervisor de mantenimiento lo revisó y lo cerró."}
                  </p>
                </section>
              ) : null}

              <Timeline
                steps={buildTimeline(detail, {
                  plannedStart: listItem?.plannedStart,
                  execStartDate: listItem?.execStartDate,
                })}
                stroke={
                  status.step < 0 ? REPORTER_TONES.received.stroke : tone.stroke
                }
              />

              {detail.reportNotes ? (
                <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="text-[15px] font-bold text-slate-900">
                    Lo que reportaste
                  </h2>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
                    {detail.reportNotes}
                  </p>
                </section>
              ) : null}

              {/* Fotos del reporte y del cierre: el adjunto no dice de cuál es. */}
              {detail.images.length > 0 ? (
                <section className="space-y-2.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <h2 className="text-[15px] font-bold text-slate-900">
                    Fotos
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {detail.images.map((image, index) => (
                      <button
                        key={index}
                        type="button"
                        onClick={() => setPhoto(image)}
                        className="h-[72px] w-[72px] overflow-hidden rounded-xl bg-slate-100"
                      >
                        <img
                          src={image}
                          alt={`Foto ${index + 1} del reporte`}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}
            </>
          )}
        </div>

        <PhotoLightbox url={photo} onClose={() => setPhoto(null)} />
      </main>
    </AppLayout>
  );
};
