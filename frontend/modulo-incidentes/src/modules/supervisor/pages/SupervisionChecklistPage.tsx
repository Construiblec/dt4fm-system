import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Check, ChevronDown, ChevronUp, Info, Plus, X } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { TaskObservations } from "@/modules/supervisor/components/TaskObservations";
import { FindingCard } from "@/modules/supervisor/components/FindingCard";
import {
  FindingEditor,
  type FindingDraft,
} from "@/modules/supervisor/components/FindingEditor";
import { SupervisionHeader } from "@/modules/supervisor/components/SupervisionHeader";
import { useCleaningSubcategories } from "@/modules/supervisor/hooks/useCleaningSubcategories";
import { useFindingActions } from "@/modules/supervisor/hooks/useFindingActions";
import { useSupervision } from "@/modules/supervisor/hooks/useSupervision";
import type {
  SupervisionArea,
  SupervisionFinding,
} from "@/modules/supervisor/types/Supervision";
import {
  findingsOfPoint,
  pendingFindings,
  plural,
} from "@/modules/supervisor/utils/supervisionView";
import { ConfirmModal } from "@/shared/components/ConfirmModal";
import { ErrorModal } from "@/shared/components/ErrorModal";
import { LoadingModal } from "@/shared/components/LoadingModal";

type Editing =
  /** `retry`: lo escrito cuando la creación falló, para no perderlo. */
  | { mode: "create"; index: number; retry?: FindingDraft }
  | { mode: "edit"; finding: SupervisionFinding }
  | null;

type Mark = "ok" | "issue";
type Marks = Record<number, Mark>;

const marksKey = (id: number) => `supervision-marks-${id}`;

/**
 * Las ✓ son solo una guía en este dispositivo: openMAINT guarda únicamente las
 * novedades. Si el almacenamiento falla (ventana privada), se empieza sin marcas.
 */
const readMarks = (id: number): Marks => {
  try {
    const raw = localStorage.getItem(marksKey(id));
    return raw ? (JSON.parse(raw) as Marks) : {};
  } catch {
    return {};
  }
};

const writeMarks = (id: number, marks: Marks) => {
  try {
    localStorage.setItem(marksKey(id), JSON.stringify(marks));
  } catch {
    // Sin almacenamiento las marcas duran lo que dure la pantalla.
  }
};

/**
 * Pantalla 2 · Checklist. Cada punto tiene ✗ y ✓: la ✗ abre el registro de la
 * novedad en ese punto; la ✓ solo marca el punto mientras se supervisa. Se
 * guardan únicamente las novedades: no se exige marcar los 19 puntos, y una ✓
 * no queda en openMAINT como «revisado».
 */
export const SupervisionChecklistPage = () => {
  const navigate = useNavigate();
  const { id: rawId = "" } = useParams();
  const id = Number(rawId);
  const { supervision, isLoading, isError } = useSupervision(id);
  const { subcategories, loading: loadingSubcategories } =
    useCleaningSubcategories();

  const [openAreas, setOpenAreas] = useState<Set<string> | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [toDelete, setToDelete] = useState<SupervisionFinding | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<Marks>(() => readMarks(id));
  const actions = useFindingActions(id, setError);

  const updateMarks = (next: Marks) => {
    setMarks(next);
    writeMarks(id, next);
  };

  /** Con novedades guardadas el punto siempre está mal; si no, lo que marcó el supervisor. */
  const markOf = (index: number, findingsCount: number): Mark | undefined =>
    findingsCount > 0 ? "issue" : marks[index];

  const markIssue = (index: number, findingsCount: number) => {
    updateMarks({ ...marks, [index]: "issue" });
    // Sin novedades todavía: la ✗ abre el formulario para registrarla.
    if (findingsCount === 0) setEditing({ mode: "create", index });
  };

  const markOk = (index: number) => updateMarks({ ...marks, [index]: "ok" });

  /** Quita la ✗ de un punto que se quedó sin novedades. */
  const clearMark = (index: number) =>
    setMarks((current) => {
      if (current[index] === undefined) return current;
      const next = { ...current };
      delete next[index];
      writeMarks(id, next);
      return next;
    });

  /** Cancelar la primera novedad de un punto quita la ✗: no quedó nada registrado. */
  const cancelCreate = (index: number, findingsCount: number) => {
    setEditing(null);
    if (findingsCount === 0) clearMark(index);
  };

  if (supervision && !supervision.can.editFindings) {
    // Ya no está en Borrador: las novedades no se editan, se ven en el resumen.
    return <Navigate to={`/supervision/${id}`} replace />;
  }

  const areas = supervision?.checklist.areas ?? [];
  const findings = supervision?.findings ?? [];
  const pending = pendingFindings(findings);
  // La primera área abierta al entrar; luego manda lo que abra el supervisor.
  const isOpen = (area: SupervisionArea) =>
    openAreas ? openAreas.has(area.name) : area.name === areas[0]?.name;
  const toggleArea = (area: SupervisionArea) => {
    const next = new Set(
      openAreas ?? (areas[0] ? [areas[0].name] : []),
    );
    if (next.has(area.name)) next.delete(area.name);
    else next.add(area.name);
    setOpenAreas(next);
  };

  /** Guardar no espera a openMAINT: la novedad aparece y las fotos suben después. */
  const save = (draft: FindingDraft) => {
    if (!editing) return;
    const current = editing;
    setEditing(null);

    if (current.mode === "edit") {
      void actions.save(current.finding, {
        subcategory: draft.subcategory,
        observation: draft.observation,
        resolvedBySupervisor: draft.resolvedBySupervisor,
      });
      return;
    }

    const point =
      areas
        .flatMap((area) => area.points)
        .find((p) => p.index === current.index) ?? null;
    void actions
      .create({
        index: current.index,
        point: point
          ? { area: point.area, name: point.name, criterion: point.criterion }
          : null,
        subcategory: draft.subcategory,
        observation: draft.observation,
        resolvedBySupervisor: draft.resolvedBySupervisor,
        files: draft.files,
      })
      .then((result) => {
        if (result.ok) return;
        // No se guardó: el formulario vuelve con lo escrito y las fotos.
        setError(result.error);
        setEditing({ mode: "create", index: current.index, retry: draft });
      });
  };

  /** Borra al instante. Si era la última del punto, la ✗ se desmarca. */
  const confirmDelete = () => {
    if (!toDelete) return;
    const target = toDelete;
    setToDelete(null);
    const lastOfPoint =
      target.index !== null &&
      findingsOfPoint(findings, target.index).length === 1;
    if (lastOfPoint && target.index !== null) clearMark(target.index);
    // Si el borrado falla, la novedad vuelve y con ella la ✗ (se deduce de las novedades).
    void actions.remove(target);
  };

  const unitName = supervision?.unit?.description ?? "Supervisión";

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen bg-gray-100 pb-36">
        <SupervisionHeader
          kicker="Checklist general"
          title={unitName}
          onBack={() =>
            navigate(
              supervision?.task?.id
                ? `/supervision/tarea/${supervision.task.id}`
                : "/supervisor",
            )
          }
        >
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-slate-900">
              {supervision?.checklist.totalPoints ?? 0} puntos de guía
            </span>
            <span className="text-slate-500">
              {plural(findings.length, "novedad", "novedades")}
            </span>
          </div>
        </SupervisionHeader>

        <div className="mx-auto w-full max-w-md space-y-3 px-4 pt-4">
          {isError ? (
            <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-600">
              No se pudo cargar la supervisión.
            </p>
          ) : null}

          {supervision && areas.length === 0 ? (
            <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">
              No se pudo leer el checklist de supervisión. Revisa la plantilla
              SUPERVISION en Checklists.
            </p>
          ) : null}

          {supervision ? (
            <TaskObservations task={supervision.task} collapsible />
          ) : null}

          {areas.map((area, areaIndex) => {
            const open = isOpen(area);
            const areaFindings = area.points.flatMap((point) =>
              findingsOfPoint(findings, point.index),
            );

            return (
              <section
                key={area.name}
                className="rounded-3xl bg-white p-5 shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleArea(area)}
                  aria-expanded={open}
                  className="flex w-full items-start justify-between gap-3 text-left"
                >
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-slate-900">
                      {areaIndex + 1}. {area.name}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {plural(area.points.length, "punto", "puntos")}
                      {areaFindings.length > 0
                        ? ` · ${plural(areaFindings.length, "novedad", "novedades")}`
                        : ""}
                    </p>
                  </div>
                  {open ? (
                    <ChevronUp className="mt-1 h-5 w-5 shrink-0 text-slate-500" />
                  ) : (
                    <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-slate-500" />
                  )}
                </button>

                {open ? (
                  <div className="mt-4 space-y-4">
                    {area.guide ? (
                      <p className="flex gap-2 rounded-2xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                        <span>
                          <strong>Guía:</strong> {area.guide}
                        </span>
                      </p>
                    ) : null}

                    {area.points.map((point) => {
                      const pointFindings = findingsOfPoint(
                        findings,
                        point.index,
                      );
                      const creatingHere =
                        editing?.mode === "create" &&
                        editing.index === point.index;

                      const mark = markOf(point.index, pointFindings.length);

                      return (
                        <div
                          key={point.index}
                          className="space-y-2 border-t border-slate-100 pt-4 first:border-t-0 first:pt-0"
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-bold text-slate-900">
                                {point.name}
                              </p>
                              {point.criterion ? (
                                <p className="text-xs text-slate-500">
                                  {point.criterion}
                                </p>
                              ) : null}
                            </div>
                            <div
                              className="flex shrink-0 gap-2"
                              role="group"
                              aria-label={`Resultado de ${point.name}`}
                            >
                              <button
                                type="button"
                                aria-label="Con novedad"
                                aria-pressed={mark === "issue"}
                                disabled={editing !== null}
                                onClick={() => markIssue(point.index, pointFindings.length)}
                                className={`flex h-11 w-11 items-center justify-center rounded-xl border transition disabled:opacity-50 ${
                                  mark === "issue"
                                    ? "border-orange-700 bg-orange-700 text-white"
                                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                <X className="h-5 w-5" aria-hidden />
                              </button>
                              <button
                                type="button"
                                aria-label="Bien"
                                aria-pressed={mark === "ok"}
                                disabled={editing !== null || pointFindings.length > 0}
                                title={
                                  pointFindings.length > 0
                                    ? "Tiene novedades: bórralas para marcarlo bien"
                                    : undefined
                                }
                                onClick={() => markOk(point.index)}
                                className={`flex h-11 w-11 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                  mark === "ok"
                                    ? "border-emerald-600 bg-emerald-600 text-white"
                                    : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                                }`}
                              >
                                <Check className="h-5 w-5" aria-hidden />
                              </button>
                            </div>
                          </div>

                          {pointFindings.map((finding) =>
                            editing?.mode === "edit" &&
                            editing.finding.id === finding.id ? (
                              <FindingEditor
                                key={finding.id}
                                idPrefix={`edit-${finding.id}`}
                                subcategories={subcategories}
                                loadingSubcategories={loadingSubcategories}
                                initial={{
                                  subcategoryId: finding.subcategory?.id ?? null,
                                  observation: finding.observation,
                                  resolvedBySupervisor:
                                    finding.resolvedBySupervisor,
                                }}
                                submitLabel="Guardar cambios"
                                onSave={save}
                                onCancel={() => setEditing(null)}
                                onError={setError}
                              />
                            ) : (
                              <FindingCard
                                key={finding.id}
                                finding={finding}
                                showPoint={false}
                                editable
                                localPhotos={actions.localPhotos[finding.id]}
                                onEdit={() => setEditing({ mode: "edit", finding })}
                                onDelete={() => setToDelete(finding)}
                                onToggleResolved={(resolved) =>
                                  void actions.save(finding, {
                                    resolvedBySupervisor: resolved,
                                  })
                                }
                                onAddPhotos={(files) =>
                                  void actions.addPhotos(finding, files)
                                }
                                onDeletePhoto={(photoId) =>
                                  void actions.deletePhoto(finding, photoId)
                                }
                                onRetryPhoto={(photo) =>
                                  void actions.retryPhoto(finding.id, photo)
                                }
                                onDiscardPhoto={(photo) =>
                                  actions.discardPhoto(finding.id, photo)
                                }
                                onError={setError}
                              />
                            ),
                          )}

                          {creatingHere ? (
                            <FindingEditor
                              idPrefix={`new-${point.index}`}
                              subcategories={subcategories}
                              loadingSubcategories={loadingSubcategories}
                              withPhotos
                              initial={
                                editing?.mode === "create" && editing.retry
                                  ? {
                                      subcategoryId: editing.retry.subcategory.id,
                                      observation: editing.retry.observation,
                                      resolvedBySupervisor:
                                        editing.retry.resolvedBySupervisor,
                                      files: editing.retry.files,
                                    }
                                  : undefined
                              }
                              submitLabel="Guardar novedad"
                              onSave={save}
                              onCancel={() =>
                                cancelCreate(point.index, pointFindings.length)
                              }
                              onError={setError}
                            />
                          ) : pointFindings.length > 0 ? (
                            <button
                              type="button"
                              onClick={() =>
                                setEditing({ mode: "create", index: point.index })
                              }
                              disabled={editing !== null}
                              className="flex items-center gap-1.5 rounded-xl border border-dashed border-amber-300 px-3 py-2 text-sm font-semibold text-amber-800 transition hover:bg-amber-50 disabled:opacity-50"
                            >
                              <Plus className="h-4 w-4" aria-hidden />
                              Otra novedad
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>

        {supervision ? (
          <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md border-t border-slate-200 bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
            <button
              type="button"
              onClick={() =>
                navigate(
                  pending.length > 0
                    ? `/supervision/${id}/asignar`
                    : `/supervision/${id}`,
                )
              }
              disabled={editing !== null || actions.busy}
              className="min-h-12 w-full rounded-2xl bg-brand px-4 text-sm font-bold text-white transition hover:bg-brand-hover disabled:opacity-60"
            >
              {actions.busy
                ? "Guardando cambios…"
                : pending.length > 0
                  ? `Asignar correcciones (${pending.length})`
                  : findings.length > 0
                    ? "Todo resuelto: ir a aprobar"
                    : "Sin novedades: ir a aprobar"}
            </button>
          </div>
        ) : null}

        <LoadingModal open={isLoading} message="Cargando checklist..." />
        <ConfirmModal
          open={toDelete !== null}
          title="Eliminar novedad"
          message="Se borran la novedad y sus fotos."
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
        <ErrorModal
          open={error !== null}
          title="Checklist de supervisión"
          message={error ?? ""}
          onClose={() => setError(null)}
        />
      </main>
    </AppLayout>
  );
};
