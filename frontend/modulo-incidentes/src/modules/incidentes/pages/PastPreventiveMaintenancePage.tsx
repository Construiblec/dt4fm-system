import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, FileText, Paperclip } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { AttachmentListSection } from "@/modules/incidentes/components/AttachmentListSection";
import { ReadOnlyPreventiveChecklist } from "@/modules/incidentes/components/ReadOnlyPreventiveChecklist";
import {
  getPreventiveStatusLabel,
  getPreventiveStatusPill,
} from "@/modules/incidentes/constants/preventiveStatus";
import {
  getPreventiveMaintenanceAttachments,
  getPreventiveMaintenanceById,
} from "@/modules/incidentes/services/preventiveMaintenanceService";
import type {
  PreventiveMaintenanceAttachment,
  PreventiveMaintenanceDetail,
} from "@/modules/incidentes/types/PreventiveMaintenance";

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "—";
  }

  return new Date(value).toLocaleString("es-EC", {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

/** Duración real de la intervención, si se registraron ambas marcas. */
const formatDuration = (start: string | null, end: string | null) => {
  if (!start || !end) {
    return "—";
  }

  const minutes = Math.round(
    (new Date(end).getTime() - new Date(start).getTime()) / 60000,
  );

  if (!Number.isFinite(minutes) || minutes < 0) {
    return "—";
  }

  const hours = Math.floor(minutes / 60);

  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
};

type InfoRowProps = {
  label: string;
  value: string | null;
};

const InfoRow = ({ label, value }: InfoRowProps) => (
  <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 p-3">
    <span className="text-sm text-slate-500">{label}</span>
    <span className="text-right text-sm font-medium text-slate-900">
      {value ?? "—"}
    </span>
  </div>
);

/**
 * Consulta de un mantenimiento ya cerrado. A diferencia del detalle de
 * ejecución no pasa por `/start`: esa ruta avanza el flujo en OpenMAINT y no
 * tiene nada que hacer en una vista de solo lectura.
 */
export const PastPreventiveMaintenancePage = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const [maintenance, setMaintenance] =
    useState<PreventiveMaintenanceDetail | null>(null);
  const [attachments, setAttachments] = useState<
    PreventiveMaintenanceAttachment[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const load = async () => {
      if (!id) {
        setError("Mantenimiento preventivo no encontrado");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Los adjuntos son complementarios: si fallan, el detalle se ve igual
        const [detail, files] = await Promise.all([
          getPreventiveMaintenanceById(id),
          getPreventiveMaintenanceAttachments(id).catch(() => []),
        ]);

        if (isMounted) {
          setMaintenance(detail);
          setAttachments(files);
        }
      } catch {
        if (isMounted) {
          setError("No se pudo cargar el mantenimiento anterior");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      isMounted = false;
    };
  }, [id]);

  return (
    <AppLayout className="bg-[#f1f1f2]">
      <main className="min-h-screen bg-[#f1f1f2]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Mantenimiento anterior
                </p>
                <h1 className="text-base font-semibold text-slate-900">
                  {maintenance?.number ?? "Detalle"}
                </h1>
              </div>
            </div>

            {maintenance ? (
              <span className={getPreventiveStatusPill(maintenance.statusCode)}>
                {getPreventiveStatusLabel(
                  maintenance.statusCode,
                  maintenance.status,
                )}
              </span>
            ) : null}
          </div>
        </header>

        <div className="space-y-5 px-4 py-5">
          {loading ? (
            <section className="rounded-3xl bg-white p-5 text-sm text-slate-500 shadow-sm">
              Cargando mantenimiento anterior...
            </section>
          ) : null}

          {!loading && error ? (
            <section className="rounded-3xl bg-white p-5 text-sm text-red-600 shadow-sm">
              {error}
            </section>
          ) : null}

          {!loading && !error && maintenance ? (
            <>
              <section className="rounded-3xl bg-white p-5 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">
                  Datos del mantenimiento
                </p>
                <h2 className="mt-2 text-lg font-semibold text-slate-900">
                  {maintenance.subject ?? "Mantenimiento preventivo"}
                </h2>

                <div className="mt-5 space-y-2">
                  <InfoRow label="Equipo" value={maintenance.equipment} />
                  <InfoRow label="Sitio" value={maintenance.site} />
                  <InfoRow label="Equipo de trabajo" value={maintenance.team} />
                  <InfoRow label="Responsable" value={maintenance.assignee} />
                </div>
              </section>

              <section className="rounded-3xl bg-white p-5 shadow-sm">
                <h2 className="text-base font-semibold text-slate-900">
                  Fechas
                </h2>

                <div className="mt-4 space-y-2">
                  <InfoRow
                    label="Inicio real"
                    value={formatDateTime(maintenance.execStartDate)}
                  />
                  <InfoRow
                    label="Finalizado"
                    value={formatDateTime(maintenance.execEndDate)}
                  />
                  <InfoRow
                    label="Duración"
                    value={formatDuration(
                      maintenance.execStartDate,
                      maintenance.execEndDate,
                    )}
                  />
                </div>
              </section>

              <ReadOnlyPreventiveChecklist items={maintenance.checklist} />

              {maintenance.notes !== null ? (
                <section className="rounded-3xl bg-white p-5 shadow-sm">
                  <h2 className="text-base font-semibold text-slate-900">
                    Observaciones
                  </h2>
                  <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-600">
                    {maintenance.notes}
                  </p>
                </section>
              ) : null}

              <AttachmentListSection
                icon={Paperclip}
                title="Documentos adjuntos"
                subtitle="Archivos que se adjuntaron durante la ejecución."
                attachments={attachments.filter(
                  (attachment) => !attachment.isReport,
                )}
                emptyMessage="No se adjuntó ningún documento."
                hideWhenEmpty
              />

              <AttachmentListSection
                icon={FileText}
                title="Informe generado"
                subtitle="Informe que OpenMAINT generó al cerrar el mantenimiento."
                attachments={attachments.filter(
                  (attachment) => attachment.isReport,
                )}
                emptyMessage="Este mantenimiento no generó informe."
              />
            </>
          ) : null}
        </div>
      </main>
    </AppLayout>
  );
};
