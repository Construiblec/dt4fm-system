import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Box } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { CorrectiveDocumentationTab } from "@/modules/incidentes/components/corrective/CorrectiveDocumentationTab";
import { CorrectiveSummaryCard } from "@/modules/incidentes/components/corrective/CorrectiveSummaryCard";
import { EvidenceGallery } from "@/modules/incidentes/components/corrective/EvidenceGallery";
import { WorkDatesCard } from "@/modules/incidentes/components/corrective/WorkDatesCard";
import {
  getCorrectiveStatusLabel,
  getCorrectiveStatusPill,
} from "@/modules/incidentes/constants/correctiveStatus";
import { getIncidentById } from "@/modules/incidentes/services/incidentDetailService";
import type { IncidentDetail } from "@/modules/incidentes/types/IncidentDetail";
import { ActionNotice } from "@/shared/components/ActionNotice";
import { formatReporter } from "@/shared/utils/reporterLabel";
import { DetailTabs } from "@/shared/components/DetailTabs";
import { NotesLogCard } from "@/shared/components/NotesLogCard";
import { ReportDetailCard } from "@/shared/components/ReportDetailCard";
import { withoutCode } from "@/shared/utils/locationLabel";

type Tab = "report" | "documentation";

const TABS: { value: Tab; label: string }[] = [
  { value: "report", label: "Reporte" },
  { value: "documentation", label: "Documentación" },
];

/** Correctivo cerrado del historial de un equipo, en solo lectura. */
export const CorrectiveHistoryDetailPage = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("report");

  useEffect(() => {
    getIncidentById(id)
      .then(setIncident)
      .catch(() => setError("No se pudo cargar el correctivo"));
  }, [id]);

  const location =
    [
      incident?.building,
      incident?.floor,
      incident?.unit ?? incident?.commonArea,
    ]
      .map(withoutCode)
      .filter(Boolean)
      .join(" · ") || null;

  return (
    <AppLayout className="bg-[#f1f1f2]">
      <main className="min-h-screen bg-[#f1f1f2]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="Volver"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <p className="text-sm font-medium text-slate-600">
                  Correctivo anterior
                </p>
                <h1 className="text-lg font-bold text-slate-900">
                  {incident?.number ?? "Detalle"}
                </h1>
              </div>
            </div>
            {incident ? (
              <span className={getCorrectiveStatusPill(incident.statusCode)}>
                {getCorrectiveStatusLabel(incident.statusCode, incident.status)}
              </span>
            ) : null}
          </div>
        </header>

        <div className="space-y-5 px-4 py-5">
          {!incident && !error ? (
            <section className="rounded-3xl bg-white p-5 text-sm text-slate-600 shadow-sm">
              Cargando correctivo...
            </section>
          ) : null}

          {error ? (
            <section className="rounded-3xl bg-white p-5 text-sm text-red-700 shadow-sm">
              {error}
            </section>
          ) : null}

          {incident ? (
            <>
              <ActionNotice
                tone="slate"
                title="Mantenimiento cerrado del mismo equipo"
                message="Solo puedes consultarlo."
              />

              <CorrectiveSummaryCard
                description={incident.location}
                priority={incident.priorityCode ?? incident.priority}
                location={location}
                reporter={
                  formatReporter(incident.reporter) ??
                  incident.requesterName ??
                  null
                }
                reportedAt={incident.createdAt}
                responsible={incident.assigneeName}
                extra={
                  incident.asset
                    ? { icon: Box, label: "Equipo", value: incident.asset }
                    : null
                }
              />

              <DetailTabs
                label="Secciones del correctivo"
                tabs={TABS}
                value={tab}
                onChange={setTab}
              />

              {tab === "report" ? (
                <>
                  <ReportDetailCard notes={incident.reportNotes} />
                  <EvidenceGallery
                    images={incident.images}
                    reference={`el correctivo ${incident.number}`}
                  />
                  <WorkDatesCard
                    execStartDate={incident.execStartDate}
                    execEndDate={incident.execEndDate}
                  />
                  <NotesLogCard entries={incident.log} />
                </>
              ) : null}

              <CorrectiveDocumentationTab
                id={String(incident.id)}
                active={tab === "documentation"}
                canManage={false}
              />
            </>
          ) : null}
        </div>
      </main>
    </AppLayout>
  );
};
