import { useNavigate } from "react-router-dom";

export const FloatingReportButton = () => {
  const navigate = useNavigate();

  return (
    <div className="fixed bottom-6 left-0 z-30 flex w-full justify-center px-4">
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
