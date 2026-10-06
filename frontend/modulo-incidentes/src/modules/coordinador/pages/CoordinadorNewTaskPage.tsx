import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { createManualTask } from "@/modules/coordinador/services/coordinadorService";
import {
  CleaningAssignmentForm,
  type CleaningAssignmentSubmitValues,
} from "@/modules/coordinador/components/CleaningAssignmentForm";
import { ErrorModal } from "@/shared/components/ErrorModal";

export const CoordinadorNewTaskPage = () => {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: CleaningAssignmentSubmitValues) => {
    try {
      setSubmitting(true);
      await createManualTask({
        unitId: values.unitId,
        employeeId: values.employeeId,
        plannedStartTime: values.plannedStartTime,
        plannedEndTime: values.plannedEndTime,
        description: values.description ?? "",
        cleaningChecklistId: values.cleaningChecklistId,
        observations: values.observations,
      });
      navigate("/coordinador");
    } catch {
      setError("No se pudo crear la limpieza");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppLayout className="bg-[#f1f1f2]">
      <main className="min-h-screen bg-[#f1f1f2]">
        <div className="border-b border-slate-200 bg-white px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/coordinador")}
              aria-label="Regresar"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <h1 className="text-base font-semibold text-slate-900">
              Nueva limpieza manual
            </h1>
          </div>
        </div>

        <div className="px-4 py-5">
          <CleaningAssignmentForm
            variant="manual"
            submitLabel="Crear limpieza"
            submitting={submitting}
            onCancel={() => navigate("/coordinador")}
            onSubmit={(values) => void handleSubmit(values)}
          />
        </div>

        <ErrorModal open={error !== null} message={error ?? undefined} onClose={() => setError(null)} />
      </main>
    </AppLayout>
  );
};
