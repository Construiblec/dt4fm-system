import type { LucideIcon } from "lucide-react";
import { AttachmentRow } from "@/modules/incidentes/components/AttachmentRow";
import type { PreventiveMaintenanceAttachment } from "@/modules/incidentes/types/PreventiveMaintenance";

type Props = {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  attachments: PreventiveMaintenanceAttachment[];
  emptyMessage: string;
  loading?: boolean;
  error?: string | null;
};

/** Tarjeta con una lista de archivos y sus estados de carga, error y vacío. */
export const AttachmentListSection = ({
  icon: Icon,
  title,
  subtitle,
  attachments,
  emptyMessage,
  loading = false,
  error = null,
}: Props) => (
  <section className="rounded-3xl bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Icon className="h-5 w-5 text-slate-500" />
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
      </div>

      {attachments.length > 0 ? (
        <span className="text-xs text-slate-500">
          {attachments.length} archivo{attachments.length === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>

    <p className="mt-1 text-sm text-slate-500">{subtitle}</p>

    {loading ? (
      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
        <p className="text-sm text-slate-500">Cargando archivos...</p>
      </div>
    ) : null}

    {!loading && error ? (
      <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    ) : null}

    {!loading && !error && attachments.length === 0 ? (
      <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      </div>
    ) : null}

    {!loading && !error && attachments.length > 0 ? (
      <div className="mt-4 space-y-2">
        {attachments.map((attachment) => (
          <AttachmentRow key={attachment.id} attachment={attachment} />
        ))}
      </div>
    ) : null}
  </section>
);
