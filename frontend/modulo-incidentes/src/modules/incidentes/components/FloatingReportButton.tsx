import { useNavigate } from "react-router-dom";

export const FloatingReportButton = () => {
  const navigate = useNavigate();

  return (
    // Se apoya justo encima de la barra inferior (h-16) y respeta el indicador
    // de inicio del iPhone; con `bottom-6` quedaba tapado por la barra.
    <div className="fixed bottom-[calc(5rem+env(safe-area-inset-bottom))] left-0 z-30 flex w-full justify-center px-4">
      <button
        type="button"
        onClick={() => navigate("/reportar-incidente")}
        className="rounded-full bg-red-500 px-6 py-3 text-sm font-semibold text-white shadow-lg"
      >
        Reportar Novedad
      </button>
    </div>
  );
};
