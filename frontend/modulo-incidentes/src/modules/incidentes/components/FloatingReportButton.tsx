import { useNavigate } from "react-router-dom";
import { Siren } from "lucide-react";

const BUTTON_CLASS =
  "pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#e5372b] text-white shadow-[0_10px_24px_rgba(229,55,43,0.4)] transition active:scale-95";

/**
 * `corner`: para las vistas de escritorio de ancho completo (coordinación), donde
 * no hay columna móvil ni barra inferior: el botón va a la esquina de la ventana.
 */
export const FloatingReportButton = ({
  corner = false,
}: {
  corner?: boolean;
}) => {
  const navigate = useNavigate();

  if (corner) {
    return (
      <button
        type="button"
        onClick={() => navigate("/reportar-incidente")}
        aria-label="Reportar novedad"
        title="Reportar novedad"
        className={`${BUTTON_CLASS} fixed bottom-6 right-6 z-30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#e5372b]`}
      >
        <Siren className="h-6 w-6" />
      </button>
    );
  }

  return (
    // Mismo envoltorio que la barra inferior (`w-full max-w-md` centrado) para
    // que el botón se ancle al borde del contenedor móvil y no al de la
    // ventana, que en escritorio queda mucho más a la derecha.
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center">
      <div className="relative w-full max-w-md">
        <button
          type="button"
          onClick={() => navigate("/reportar-incidente")}
          aria-label="Reportar novedad"
          title="Reportar novedad"
          className={`${BUTTON_CLASS} absolute right-[18px] bottom-[calc(5.25rem+env(safe-area-inset-bottom))]`}
        >
          <Siren className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
};
