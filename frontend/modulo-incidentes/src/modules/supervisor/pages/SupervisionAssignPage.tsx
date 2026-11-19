import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { FindingCard } from "@/modules/supervisor/components/FindingCard";
import {
  Avatar,
  SectionLabel,
  SupervisionHeader,
} from "@/modules/supervisor/components/SupervisionHeader";
import { useSupervision } from "@/modules/supervisor/hooks/useSupervision";
import {
  assignCorrector,
  describeSupervisionError,
  fetchCleaningEmployees,
} from "@/modules/supervisor/services/supervisionService";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";
import { formatEmployeeName } from "@/shared/utils/nameUtils";
import {
  pendingFindings,
  resolvedFindings,
} from "@/modules/supervisor/utils/supervisionView";

/**
 * Pantalla 3 · Asignar. Se elige un operario del equipo de limpieza para el
 * conjunto de novedades. El selector empieza vacío (no se preselecciona a quien
 * limpió) y no hay disponibilidad ni horario. Sirve también para reasignar.
 */
export const SupervisionAssignPage = () => {
  const navigate = useNavigate();
  const { id: rawId = "" } = useParams();
  const id = Number(rawId);
  const { supervision, isLoading, setSupervision } = useSupervision(id);
  const employees = useQuery({
    queryKey: ["cleaning-employees"],
    queryFn: async () => (await fetchCleaningEmployees()).data,
    staleTime: 5 * 60_000,
  });

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (supervision && !supervision.can.assign) {
    return <Navigate to={`/supervision/${id}`} replace />;
  }

  // Solo van a corrección las que el supervisor no resolvió.
  const findings = pendingFindings(supervision?.findings ?? []);
  const resolved = resolvedFindings(supervision?.findings ?? []);
  const selected =
    employees.data?.find((employee) => employee.id === selectedId) ?? null;
  const cleanedById = supervision?.task?.employee?.id ?? null;
  const isReassign =
    supervision?.phase === "InCorrection" || supervision?.phase === "Fixed";

  const submit = async () => {
    if (!selected) return;
    try {
      setSubmitting(true);
      const { data } = await assignCorrector(id, selected.id);
      setSupervision(data);
      navigate(`/supervision/${id}`, { replace: true });
    } catch (err) {
      setError(
        describeSupervisionError(err, "No se pudieron asignar las correcciones."),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen bg-gray-100 pb-36">
        <SupervisionHeader
          kicker={supervision?.unit?.description ?? "Supervisión"}
          title={isReassign ? "Reasignar correcciones" : "Asignar correcciones"}
          onBack={() =>
            navigate(
              supervision?.phase === "Draft"
                ? `/supervision/${id}/checklist`
                : `/supervision/${id}`,
            )
          }
        />

        <div className="mx-auto w-full max-w-md space-y-4 px-4 pt-4">
          <div className="space-y-2">
            <SectionLabel>Novedades a corregir · {findings.length}</SectionLabel>
            {findings.map((finding) => (
              <FindingCard
                key={finding.id}
                finding={finding}
                showPhotos={false}
              />
            ))}
          </div>

          {resolved.length > 0 ? (
            <div className="space-y-2 opacity-80">
              <SectionLabel>
                Resueltas por el supervisor · {resolved.length} (no se envían)
              </SectionLabel>
              {resolved.map((finding) => (
                <FindingCard
                  key={finding.id}
                  finding={finding}
                  showPhotos={false}
                />
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <SectionLabel>Operario que corrige</SectionLabel>
            <section className="space-y-1 rounded-3xl bg-white p-2 shadow-sm">
              {employees.isLoading ? (
                <p className="p-3 text-sm text-slate-500">
                  Cargando operarios...
                </p>
              ) : null}
              {employees.isError ? (
                <p className="p-3 text-sm text-red-600">
                  No se pudieron cargar los operarios.
                </p>
              ) : null}
              {employees.data?.length === 0 ? (
                <p className="p-3 text-sm text-slate-500">
                  No hay operarios en el equipo de limpieza.
                </p>
              ) : null}

              <div role="radiogroup" aria-label="Operario que corrige">
                {employees.data?.map((employee) => {
                  const checked = employee.id === selectedId;
                  const name = formatEmployeeName(employee.name);
                  return (
                    <label
                      key={employee.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-2xl p-3 transition ${
                        checked ? "bg-blue-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name="corrector"
                        value={employee.id}
                        checked={checked}
                        onChange={() => setSelectedId(employee.id)}
                        className="sr-only"
                      />
                      <Avatar name={name} active={checked} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-slate-900">
                          {name}
                        </span>
                        {employee.id === cleanedById ? (
                          <span className="block text-xs text-slate-500">
                            Realizó esta limpieza
                          </span>
                        ) : supervision?.corrector?.id === employee.id ? (
                          <span className="block text-xs text-slate-500">
                            Corrector actual
                          </span>
                        ) : null}
                      </span>
                      <span
                        aria-hidden
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                          checked ? "border-brand" : "border-slate-300"
                        }`}
                      >
                        {checked ? (
                          <span className="h-3 w-3 rounded-full bg-brand" />
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            </section>
          </div>
        </div>

        <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-slate-200 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!selected || submitting}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            <Check className="h-5 w-5" aria-hidden />
            {submitting
              ? "Asignando..."
              : selected
                ? `Asignar ${findings.length === 1 ? "1 corrección" : `${findings.length} correcciones`} a ${formatEmployeeName(selected.name)}`
                : "Elige quién corrige"}
          </button>
        </div>

        <LoadingModal open={isLoading} message="Cargando supervisión..." />
        <ErrorModal
          open={error !== null}
          title="Asignar correcciones"
          message={error ?? ""}
          onClose={() => setError(null)}
        />
      </main>
    </AppLayout>
  );
};
