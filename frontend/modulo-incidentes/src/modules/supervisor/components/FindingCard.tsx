import { CheckCircle2, LoaderCircle, Pencil, Trash2 } from "lucide-react";
import { FindingPhotos } from "@/modules/supervisor/components/FindingPhotos";
import type {
  LocalPhoto,
  SupervisionFinding,
} from "@/modules/supervisor/types/Supervision";
import {
  findingTitle,
  plural,
  pointLabel,
} from "@/modules/supervisor/utils/supervisionView";

type Props = {
  finding: SupervisionFinding;
  /** En el checklist se muestra bajo su punto, así que sobra repetirlo. */
  showPoint?: boolean;
  /** Acciones de editar, borrar, marcar resuelta y fotos (solo en Borrador). */
  editable?: boolean;
  /** Las fotos completas; si no, solo cuántas hay. */
  showPhotos?: boolean;
  localPhotos?: LocalPhoto[];
  onEdit?: () => void;
  onDelete?: () => void;
  onToggleResolved?: (resolved: boolean) => void;
  onAddPhotos?: (files: File[]) => void;
  onDeletePhoto?: (photoId: string) => void;
  onRetryPhoto?: (photo: LocalPhoto) => void;
  onDiscardPhoto?: (photo: LocalPhoto) => void;
  onError?: (message: string) => void;
};

const SYNC_LABEL: Record<NonNullable<SupervisionFinding["syncing"]>, string> = {
  creating: "Guardando…",
  saving: "Guardando cambios…",
  deleting: "Borrando…",
};

export const FindingCard = ({
  finding,
  showPoint = true,
  editable = false,
  showPhotos = true,
  localPhotos = [],
  onEdit,
  onDelete,
  onToggleResolved,
  onAddPhotos,
  onDeletePhoto,
  onRetryPhoto,
  onDiscardPhoto,
  onError,
}: Props) => {
  const isOther = Boolean(finding.subcategory?.isOther);
  // Mientras se crea no tiene id real: nada de esta tarjeta se puede tocar.
  const locked = finding.syncing !== undefined;
  const resolved = finding.resolvedBySupervisor;

  return (
    <article
      className={`space-y-2 rounded-2xl border p-4 ${
        resolved
          ? "border-emerald-200 bg-emerald-50/60"
          : "border-amber-200 bg-amber-50"
      }`}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          {showPoint ? (
            <p
              className={`text-xs font-semibold ${resolved ? "text-emerald-800" : "text-amber-800"}`}
            >
              {pointLabel(finding)}
            </p>
          ) : null}
          <p className="text-sm font-bold text-slate-900">
            {findingTitle(finding)}
          </p>
          {finding.observation && !isOther ? (
            <p className="mt-0.5 text-sm text-slate-700">
              {finding.observation}
            </p>
          ) : null}
          {!showPhotos ? (
            <p className="mt-1 text-xs text-slate-500">
              {finding.photos.length === 0
                ? "Sin fotos"
                : plural(
                    finding.photos.length,
                    "foto de evidencia",
                    "fotos de evidencia",
                  )}
            </p>
          ) : null}
          {finding.syncing ? (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-500">
              <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden />
              {SYNC_LABEL[finding.syncing]}
            </p>
          ) : null}
          {resolved && !editable ? (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              Resuelta por supervisor
            </p>
          ) : null}
        </div>
        {editable ? (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={onEdit}
              disabled={locked}
              aria-label="Editar novedad"
              className="rounded-full p-2 text-slate-600 transition hover:bg-amber-100 disabled:opacity-40"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={locked}
              aria-label="Eliminar novedad"
              className="rounded-full p-2 text-slate-600 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </div>

      {showPhotos ? (
        <FindingPhotos
          photos={finding.photos}
          localPhotos={localPhotos}
          editable={editable}
          disabled={locked}
          onAdd={onAddPhotos}
          onDelete={onDeletePhoto}
          onRetry={onRetryPhoto}
          onDiscard={onDiscardPhoto}
          onError={onError}
        />
      ) : null}

      {editable ? (
        <label
          className={`flex items-center justify-end gap-2 text-sm font-semibold text-slate-700 ${
            locked ? "opacity-50" : "cursor-pointer"
          }`}
        >
          Resuelto por el supervisor
          <input
            type="checkbox"
            checked={resolved}
            disabled={locked}
            onChange={(event) => onToggleResolved?.(event.target.checked)}
            className="h-5 w-5 rounded border-slate-300 accent-emerald-600"
          />
        </label>
      ) : null}
    </article>
  );
};
