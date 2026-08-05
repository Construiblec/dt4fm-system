import { ChevronRight } from "lucide-react";
import type { PreventiveMaintenanceAttachment } from "@/modules/incidentes/types/PreventiveMaintenance";
import { buildAttachmentUrl } from "@/shared/utils/attachmentUrl";

type Props = {
  attachment: PreventiveMaintenanceAttachment;
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

export const AttachmentRow = ({ attachment }: Props) => {
  const badge = getBadge(attachment);
  const uploadedAt = formatDate(attachment.uploadDate);
  const meta = [attachment.category, uploadedAt].filter(Boolean).join(" · ");

  return (
    <a
      href={buildAttachmentUrl(attachment.downloadUrl)}
      target="_blank"
      rel="noreferrer"
      className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 p-4 transition hover:bg-slate-100"
    >
      <span className="flex min-w-0 items-center gap-3">
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
            <span className="block text-xs text-slate-500">{meta}</span>
          ) : null}
        </span>
      </span>

      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
    </a>
  );
};
