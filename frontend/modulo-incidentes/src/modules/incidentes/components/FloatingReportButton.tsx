import { useNavigate } from "react-router-dom";
import { Siren } from "lucide-react";

export const FloatingReportButton = () => {
  const navigate = useNavigate();

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
          className="pointer-events-auto absolute right-[18px] bottom-[calc(5.25rem+env(safe-area-inset-bottom))] flex h-14 w-14 items-center justify-center rounded-full bg-[#e5372b] text-white shadow-[0_10px_24px_rgba(229,55,43,0.4)] transition active:scale-95"
        >
          <Siren className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
};
