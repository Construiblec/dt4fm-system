import { ChevronRight, Siren } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { BottomSheet } from "@/shared/components/BottomSheet";
import type { ReportedIncident } from "@/modules/incidentes/services/incidentsService";
import { ReportRow } from "./ReportRow";

const RECENT = 3;

type Props = {
  open: boolean;
  onClose: () => void;
  reports: ReportedIncident[] | undefined;
  loading: boolean;
  error: boolean;
};

/** Hoja del botón rojo: los reportes recientes y, al final, reportar uno nuevo. */
export const ReportsSheet = ({
  open,
  onClose,
  reports,
  loading,
  error,
}: Props) => {
  const navigate = useNavigate();
  const recent = (reports ?? []).slice(0, RECENT);

  return (
    <BottomSheet open={open} title="Novedades" onClose={onClose}>
      <div className="px-5">
        <div className="flex items-center justify-between pt-1">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            Mis reportes recientes
          </h3>
          {reports && reports.length > 0 ? (
            <Link
              to="/mis-reportes"
              onClick={onClose}
              className="flex items-center gap-0.5 text-sm font-semibold text-blue-600"
            >
              Ver todos
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null}
        </div>

        <div className="divide-y divide-slate-100">
          {loading ? (
            <p className="py-4 text-sm text-slate-500">
              Cargando tus reportes…
            </p>
          ) : error ? (
            <p className="py-4 text-sm text-red-600">
              No se pudieron cargar tus reportes.
            </p>
          ) : recent.length === 0 ? (
            <p className="py-4 text-sm text-slate-500">
              Aún no has reportado novedades.
            </p>
          ) : (
            recent.map((report) => (
              <ReportRow key={report.id} report={report} onOpen={onClose} />
            ))
          )}
        </div>

        <button
          type="button"
          onClick={() => navigate("/reportar-incidente")}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#e5372b] py-3.5 text-[15px] font-semibold text-white transition active:scale-[0.99]"
        >
          <Siren className="h-5 w-5" />
          Reportar una novedad
        </button>
      </div>
    </BottomSheet>
  );
};
