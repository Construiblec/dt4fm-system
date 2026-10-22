import { useEffect, useState } from "react";
import { Siren } from "lucide-react";
import {
  useReportedIncidents,
  useUnseenReportChanges,
} from "@/modules/incidentes/hooks/useReportedIncidents";
import { ReportsSheet } from "./ReportsSheet";

const BUTTON_CLASS =
  "pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e5372b] text-white shadow-[0_10px_24px_rgba(229,55,43,0.4)] transition active:scale-95";

/**
 * Abre la hoja «Novedades»: reportes recientes y el acceso a reportar.
 * `corner`: para las vistas de escritorio de ancho completo (coordinación), donde
 * no hay columna móvil ni barra inferior: el botón va a la esquina de la ventana.
 */
export const FloatingReportButton = ({
  corner = false,
}: {
  corner?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const reported = useReportedIncidents();
  const { unseen, markSeen } = useUnseenReportChanges(reported.data);

  // Con la hoja abierta todo lo que llega se da por visto.
  useEffect(() => {
    if (open) markSeen();
  }, [open, markSeen]);

  const openSheet = () => {
    setOpen(true);
    void reported.refetch();
  };

  const badge =
    unseen > 0 ? (
      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-slate-900 px-1 text-[11px] font-bold">
        {unseen}
      </span>
    ) : null;

  const label =
    unseen > 0
      ? `Novedades: ${unseen} reporte${unseen === 1 ? "" : "s"} con cambios`
      : "Novedades";

  const sheet = (
    <ReportsSheet
      open={open}
      onClose={() => setOpen(false)}
      reports={reported.data}
      loading={reported.isPending && reported.fetchStatus !== "idle"}
      error={reported.isError}
    />
  );

  if (corner) {
    return (
      <>
        <button
          type="button"
          onClick={openSheet}
          aria-label={label}
          title="Novedades"
          className={`${BUTTON_CLASS} fixed bottom-6 right-6 z-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5372b]`}
        >
          <Siren className="h-6 w-6" />
          {badge}
        </button>
        {sheet}
      </>
    );
  }

  return (
    <>
      {/* Mismo envoltorio que la barra inferior (`w-full max-w-md` centrado) para
          que el botón se ancle al borde del contenedor móvil y no al de la
          ventana, que en escritorio queda mucho más a la derecha. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center">
        <div className="relative w-full max-w-md">
          <button
            type="button"
            onClick={openSheet}
            aria-label={label}
            title="Novedades"
            className={`${BUTTON_CLASS} absolute right-[18px] bottom-[calc(5.25rem+env(safe-area-inset-bottom))]`}
          >
            <Siren className="h-6 w-6" />
            {badge}
          </button>
        </div>
      </div>
      {sheet}
    </>
  );
};
