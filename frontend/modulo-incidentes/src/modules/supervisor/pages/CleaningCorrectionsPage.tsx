import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, ClipboardList } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { FindingCard } from "@/modules/supervisor/components/FindingCard";
import {
  SectionLabel,
  SupervisionHeader,
} from "@/modules/supervisor/components/SupervisionHeader";
import { myCorrectionsKey } from "@/modules/supervisor/hooks/useMyCorrections";
import { useSupervision } from "@/modules/supervisor/hooks/useSupervision";
import {
  describeSupervisionError,
  markCorrectionsFixed,
} from "@/modules/supervisor/services/supervisionService";
import type { SupervisionPhase } from "@/modules/supervisor/types/Supervision";
import {
  groupFindingsByArea,
  plural,
} from "@/modules/supervisor/utils/supervisionView";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { SuccessModal } from "@/shared/components/SuccessModal";
import { formatDayMonthYear } from "@/shared/utils/dateUtils";

const BACK_ROUTE = "/dashboard?tab=cleaning";

/** Por qué ya no hay nada que hacer aquí (por ejemplo, al abrir un push viejo). */
const CLOSED_MESSAGE: Partial<Record<SupervisionPhase, string>> = {
  Fixed:
    "Ya marcaste estas correcciones como resueltas. El supervisor las revisará.",
  Confirmed: "El supervisor confirmó tus correcciones.",
  Approved: "La unidad quedó aprobada. No hay nada pendiente.",
  Cancelled:
    "Esta supervisión se anuló: la limpieza se reabrió o la unidad tiene una limpieza más reciente.",
  Draft: "Estas correcciones todavía no te han sido asignadas.",
};

/**
 * Correcciones del operario: las novedades que le asignó el supervisor, con
 * sus fotos, agrupadas por área. «Resuelto» cierra el conjunto; no se
 * resuelve punto por punto ni se suben fotos del arreglo.
 */
export const CleaningCorrectionsPage = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id: rawId = "" } = useParams();
  const id = Number(rawId);
  const { supervision, isLoading, error: loadError, reload } =
    useSupervision(id);

  const [confirming, setConfirming] = useState(false);
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findings = supervision?.findings ?? [];
  const groups = supervision
    ? groupFindingsByArea(supervision.checklist.areas, findings)
    : [];
  const canMarkFixed = Boolean(supervision?.can.markFixed);
  const closedMessage =
    supervision && !canMarkFixed && supervision.phase
      ? (CLOSED_MESSAGE[supervision.phase] ?? null)
      : null;

  const markFixed = async () => {
    setConfirming(false);
    try {
      setWorking(true);
      await markCorrectionsFixed(id);
      void queryClient.invalidateQueries({ queryKey: myCorrectionsKey });
      void reload();
      setDone(true);
    } catch (err) {
      setError(
        describeSupervisionError(
          err,
          "No se pudieron marcar las correcciones como resueltas. Vuelve a intentarlo.",
        ),
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <AppLayout className="bg-gray-100">
      <main
        className={`min-h-screen bg-gray-100 ${canMarkFixed ? "pb-32" : "pb-10"}`}
      >
        <SupervisionHeader
          kicker={supervision?.unit?.description ?? "Limpieza"}
          title="Correcciones"
          onBack={() => navigate(BACK_ROUTE)}
          aside={
            supervision?.task?.actualEndTime ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                {formatDayMonthYear(supervision.task.actualEndTime)}
              </span>
            ) : null
          }
        />

        <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-4">
          {loadError ? (
            <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">
              {describeSupervisionError(
                loadError,
                "No se pudieron cargar las correcciones.",
              )}
            </p>
          ) : null}

          {closedMessage ? (
            <p className="flex items-start gap-2 rounded-2xl bg-slate-100 p-4 text-sm text-slate-700">
              <CircleCheck
                className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600"
                aria-hidden
              />
              {closedMessage}
            </p>
          ) : null}

          {supervision && canMarkFixed ? (
            <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              <ClipboardList className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
              <span>
                El supervisor encontró{" "}
                <strong>{plural(findings.length, "novedad", "novedades")}</strong>
                . Corrígelas y pulsa «Resuelto».
              </span>
            </p>
          ) : null}

          {canMarkFixed
            ? groups.map((group) => (
                <section
                  key={group.name}
                  className="space-y-3 rounded-3xl bg-white p-5 shadow-sm"
                >
                  <SectionLabel>
                    {group.name} · {group.findings.length}
                  </SectionLabel>
                  {group.findings.map((finding) => (
                    <FindingCard key={finding.id} finding={finding} />
                  ))}
                </section>
              ))
            : null}

          {supervision && !canMarkFixed ? (
            <button
              type="button"
              onClick={() => navigate(BACK_ROUTE)}
              className="min-h-12 w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              Volver a mis tareas
            </button>
          ) : null}
        </div>

        {canMarkFixed ? (
          <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-slate-200 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={working}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-bold text-white shadow-md transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              <CircleCheck className="h-5 w-5" aria-hidden />
              Resuelto
            </button>
          </div>
        ) : null}

        <LoadingModal
          open={isLoading || working}
          message={working ? "Guardando..." : "Cargando correcciones..."}
        />
        <ConfirmModal
          open={confirming}
          title="Marcar como resuelto"
          message="Confirmas que corregiste todas las novedades. El supervisor recibirá un aviso para revisarlas."
          onConfirm={() => void markFixed()}
          onCancel={() => setConfirming(false)}
        />
        <SuccessModal
          open={done}
          title="Correcciones enviadas"
          message="Avisamos al supervisor para que revise la unidad."
          buttonLabel="Volver a mis tareas"
          onClose={() => navigate(BACK_ROUTE)}
        />
        <ErrorModal
          open={error !== null}
          title="Correcciones"
          message={error ?? ""}
          onClose={() => setError(null)}
        />
      </main>
    </AppLayout>
  );
};
