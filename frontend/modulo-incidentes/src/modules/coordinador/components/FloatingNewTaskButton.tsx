import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

/** Mismo envoltorio que `FloatingReportButton`, en índigo (color del rol). */
export const FloatingNewTaskButton = () => {
  const navigate = useNavigate();

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center">
      <div className="relative w-full max-w-md">
        <button
          type="button"
          onClick={() => navigate("/coordinador/nueva")}
          aria-label="Nueva limpieza"
          title="Nueva limpieza"
          className="pointer-events-auto absolute right-[18px] bottom-[calc(5.25rem+env(safe-area-inset-bottom))] flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 text-white shadow-[0_10px_24px_rgba(79,70,229,0.4)] transition active:scale-95"
        >
          <Plus className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
};
