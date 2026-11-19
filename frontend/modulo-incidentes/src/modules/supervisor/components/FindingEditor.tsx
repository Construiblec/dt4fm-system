import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import { formInputClass } from "@/modules/supervisor-mantenimiento/constants/formStyles";
import { SearchableSelect } from "@/shared/components/SearchableSelect";
import { TakePhotoButton } from "@/shared/components/TakePhotoButton";
import type {
  MaintSubcategory,
} from "@/shared/services/categoriesService";
import { preparePhotos } from "@/modules/supervisor/utils/findingPhotoUpload";
import {
  MAX_FINDING_OBSERVATION,
  MAX_FINDING_PHOTOS,
} from "@/modules/supervisor/utils/supervisionView";

export type FindingDraft = {
  subcategory: MaintSubcategory;
  observation: string;
  resolvedBySupervisor: boolean;
  /** Ya preparadas; vacío al editar (las fotos se gestionan en la tarjeta). */
  files: File[];
};

type Props = {
  /** Para que los id de los campos no choquen entre puntos. */
  idPrefix: string;
  subcategories: MaintSubcategory[];
  loadingSubcategories?: boolean;
  initial?: {
    subcategoryId: number | null;
    observation: string | null;
    resolvedBySupervisor?: boolean;
    files?: File[];
  };
  /** Solo al crear: al editar, las fotos se gestionan en la tarjeta. */
  withPhotos?: boolean;
  submitLabel: string;
  onSave: (draft: FindingDraft) => void;
  onCancel: () => void;
  onError: (message: string) => void;
};

/**
 * Formulario de una novedad: qué está mal (subcategoría de Limpieza), una
 * observación (obligatoria solo con «Otro»), hasta 2 fotos y si el supervisor
 * la resolvió al momento. Guardar no espera a openMAINT: la novedad aparece
 * enseguida y las fotos suben después.
 */
export const FindingEditor = ({
  idPrefix,
  subcategories,
  loadingSubcategories = false,
  initial,
  withPhotos = false,
  submitLabel,
  onSave,
  onCancel,
  onError,
}: Props) => {
  const [subcategoryId, setSubcategoryId] = useState(
    initial?.subcategoryId ? String(initial.subcategoryId) : "",
  );
  const [observation, setObservation] = useState(initial?.observation ?? "");
  const [resolved, setResolved] = useState(
    initial?.resolvedBySupervisor ?? false,
  );
  const [files, setFiles] = useState<File[]>(initial?.files ?? []);
  const [preparing, setPreparing] = useState(false);

  const previews = useMemo(
    () => files.map((file) => URL.createObjectURL(file)),
    [files],
  );
  useEffect(
    () => () => previews.forEach((url) => URL.revokeObjectURL(url)),
    [previews],
  );

  const subcategory =
    subcategories.find((s) => String(s.id) === subcategoryId) ?? null;
  const needsObservation = Boolean(subcategory?.isOther);
  const missing = !subcategory
    ? "Elige qué está mal"
    : needsObservation && !observation.trim()
      ? "Describe la novedad: con «Otro» es obligatorio"
      : null;
  const remaining = MAX_FINDING_PHOTOS - files.length;

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (picked.length === 0) return;
    if (picked.length > remaining) {
      onError(
        `Cada novedad admite ${MAX_FINDING_PHOTOS} fotos. Te ${remaining === 1 ? "queda 1" : `quedan ${remaining}`}.`,
      );
      return;
    }
    try {
      setPreparing(true);
      const prepared = await preparePhotos(picked);
      setFiles((current) => [...current, ...prepared].slice(0, MAX_FINDING_PHOTOS));
    } catch (error) {
      onError(error instanceof Error ? error.message : "No se pudo leer la foto.");
    } finally {
      setPreparing(false);
    }
  };

  return (
    <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">
        Novedad
      </p>

      <div>
        <label
          htmlFor={`${idPrefix}-subcategory`}
          className="mb-1.5 block text-xs font-semibold text-slate-600"
        >
          Incidencia
        </label>
        <SearchableSelect
          id={`${idPrefix}-subcategory`}
          value={subcategoryId}
          onChange={setSubcategoryId}
          options={subcategories.map((s) => ({
            value: String(s.id),
            label: s.name,
          }))}
          loading={loadingSubcategories}
          loadingMessage="Cargando incidencias..."
          placeholder="Selecciona la incidencia"
          searchPlaceholder="Buscar incidencia..."
          emptyMessage="Sin incidencias de limpieza"
        />
      </div>

      <div>
        <label
          htmlFor={`${idPrefix}-observation`}
          className="mb-1.5 block text-xs font-semibold text-slate-600"
        >
          {needsObservation
            ? "Describe la novedad (obligatorio)"
            : "Observación (opcional)"}
        </label>
        <textarea
          id={`${idPrefix}-observation`}
          value={observation}
          maxLength={MAX_FINDING_OBSERVATION}
          onChange={(event) => setObservation(event.target.value)}
          rows={2}
          placeholder={
            needsObservation
              ? "Ej.: Telaraña en la esquina del techo, sobre la cabecera."
              : "Algo que ayude a corregirla"
          }
          className={`${formInputClass} py-2.5`}
        />
        <p className="mt-1 text-right text-xs text-slate-500">
          {observation.length}/{MAX_FINDING_OBSERVATION}
        </p>
      </div>

      {withPhotos ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-600">
            Evidencia fotográfica ({files.length}/{MAX_FINDING_PHOTOS})
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {previews.map((url, i) => (
              <div
                key={url}
                className="relative h-16 w-16 overflow-hidden rounded-xl bg-slate-200"
              >
                <img
                  src={url}
                  alt="Foto elegida"
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() =>
                    setFiles((current) => current.filter((_, j) => j !== i))
                  }
                  aria-label="Quitar foto"
                  className="absolute right-0.5 top-0.5 rounded-full bg-slate-950/60 p-1 text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {remaining > 0 ? (
              <>
                <label
                  className={`flex h-16 items-center gap-1.5 rounded-xl border border-dashed border-slate-300 bg-white px-3 text-sm font-semibold text-brand ${
                    preparing ? "cursor-wait opacity-60" : "cursor-pointer"
                  }`}
                >
                  {preparing ? (
                    <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <ImagePlus className="h-4 w-4" aria-hidden />
                  )}
                  Galería
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/heic,image/heif"
                    multiple={remaining > 1}
                    className="hidden"
                    onChange={(event) => void handleFiles(event)}
                    disabled={preparing}
                  />
                </label>
                <TakePhotoButton
                  className="h-16 border-dashed"
                  onChange={(event) => void handleFiles(event)}
                  disabled={preparing}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}

      <label className="flex cursor-pointer items-center justify-end gap-2 text-sm font-semibold text-slate-700">
        Resuelto por el supervisor
        <input
          type="checkbox"
          checked={resolved}
          onChange={(event) => setResolved(event.target.checked)}
          className="h-5 w-5 rounded border-slate-300 accent-emerald-600"
        />
      </label>

      {missing && subcategoryId ? (
        <p role="status" className="text-xs font-medium text-amber-800">
          {missing}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={missing !== null || !subcategory || preparing}
          onClick={() =>
            subcategory &&
            onSave({
              subcategory,
              observation: observation.trim(),
              resolvedBySupervisor: resolved,
              files,
            })
          }
          className="min-h-11 rounded-xl bg-brand px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
};
