import { FileText } from "lucide-react";
import { AttachmentRow } from "@/modules/incidentes/components/AttachmentRow";
import type { PreventiveMaintenanceAttachment } from "@/modules/incidentes/types/PreventiveMaintenance";

type Props = {
  documents: PreventiveMaintenanceAttachment[];
  loading: boolean;
  error: string | null;
};

const StateMessage = ({ children }: { children: string }) => (
  <div className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
    <p className="text-sm text-slate-500">{children}</p>
  </div>
);

/**
 * Documentación del equipo intervenido. Son los archivos del manual de
 * mantenimiento al que apunta el plan preventivo, no los informes que genera
 * el propio mantenimiento.
 */
export const PreventiveDocumentsSection = ({
  documents,
  loading,
  error,
}: Props) => (
  <section className="rounded-3xl bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <FileText className="h-5 w-5 text-slate-500" />
        <h2 className="text-base font-semibold text-slate-900">
          Documentos del equipo
        </h2>
      </div>

      {documents.length > 0 ? (
        <span className="text-xs text-slate-500">
          {documents.length} archivo{documents.length === 1 ? "" : "s"}
        </span>
      ) : null}
    </div>

    <p className="mt-1 text-sm text-slate-500">
      Manuales y fichas técnicas del equipo intervenido.
    </p>

    {loading ? <StateMessage>Cargando documentos...</StateMessage> : null}

    {!loading && error ? (
      <div className="mt-4 rounded-2xl border border-red-100 bg-red-50 px-4 py-6 text-center">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    ) : null}

    {!loading && !error && documents.length === 0 ? (
      <StateMessage>
        Este equipo todavía no tiene documentos disponibles.
      </StateMessage>
    ) : null}

    {!loading && !error && documents.length > 0 ? (
      <div className="mt-4 space-y-2">
        {documents.map((document) => (
          <AttachmentRow key={document.id} attachment={document} />
        ))}
      </div>
    ) : null}
  </section>
);
