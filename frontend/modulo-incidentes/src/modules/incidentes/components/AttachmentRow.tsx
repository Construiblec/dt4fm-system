import { ChevronRight, Trash2 } from "lucide-react";
import type { PreventiveMaintenanceAttachment } from "@/modules/incidentes/types/PreventiveMaintenance";
import { buildAttachmentUrl } from "@/shared/utils/attachmentUrl";

type Props = {
  attachment: PreventiveMaintenanceAttachment;
  /** Solo se pasa cuando el mantenimiento admite quitar adjuntos */
  onDelete?: (attachment: PreventiveMaintenanceAttachment) => void;
  isDeleting?: boolean;
};

const BADGES: Record<string, { label: string; className: string }> = {
  pdf: { label: "PDF", className: "bg-red-50 text-red-700" },
  img: { label: "IMG", className: "bg-blue-50 text-blue-700" },
  doc: { label: "DOC", className: "bg-slate-100 text-slate-600" },
};

const getBadge = (attachment: PreventiveMaintenanceAttachment) => {
  if (attachment.isImage) {
    return BADGES.img;
  }

  return attachment.fileName.toLowerCase().endsWith(".pdf")
    ? BADGES.pdf
    : BADGES.doc;
};

const formatDate = (value: string | null) => {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleDateString("es-EC", { dateStyle: "medium" });
};

export const AttachmentRow = ({
  attachment,
  onDelete,
  isDeleting = false,
}: Props) => {
  const badge = getBadge(attachment);
  const uploadedAt = formatDate(attachment.uploadDate);
  // La descripción dice más que la categoría, que casi siempre es «Document».
  // La del informe se omite: solo repite el nombre con la marca de OpenMAINT.
  const detail = attachment.isReport
    ? null
    : (attachment.description ?? attachment.category);
  const meta = [detail, uploadedAt].filter(Boolean).join(" · ");

  return (
    // El botón de borrar no puede ir dentro del enlace, de ahí el contenedor
    <div className="flex items-center gap-1 rounded-2xl bg-slate-50 pr-2 transition hover:bg-slate-100">
      <a
        href={buildAttachmentUrl(attachment.downloadUrl)}
        target="_blank"
        rel="noreferrer"
        className="flex min-w-0 flex-1 items-center gap-3 p-4"
      >
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[9px] font-bold ${badge.className}`}
        >
          {badge.label}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {attachment.fileName}
          </span>
          {meta ? (
            <span className="block truncate text-xs text-slate-500">
              {meta}
            </span>
          ) : null}
        </span>
      </a>

      {onDelete ? (
        <button
          type="button"
          aria-label={`Eliminar ${attachment.fileName}`}
          disabled={isDeleting}
          onClick={() => onDelete(attachment)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      ) : (
        <ChevronRight className="mr-2 h-4 w-4 shrink-0 text-slate-400" />
      )}
    </div>
  );
};
