import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { fetchTaskDetail } from "@/modules/supervisor/services/supervisorService";
import { assignPendingTask } from "@/modules/coordinador/services/coordinadorService";
import {
  CleaningAssignmentForm,
  type CleaningAssignmentSubmitValues,
} from "@/modules/coordinador/components/CleaningAssignmentForm";
import type { CleaningTaskDetail } from "@/modules/supervisor/types/SupervisorTask";
import { ErrorModal } from "@/shared/components/ErrorModal";

export const CoordinadorPendingDetailPage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const taskId = Number(id);

  const [task, setTask] = useState<CleaningTaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    fetchTaskDetail(taskId)
      .then((response) => {
        if (isMounted) setTask(response.data);
      })
      .catch(() => {
        if (isMounted) setError("No se pudo cargar la tarea");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [taskId]);

  const handleSubmit = async (values: CleaningAssignmentSubmitValues) => {
    try {
      setSubmitting(true);
      await assignPendingTask(taskId, {
        unitId: values.unitId,
        plannedStartTime: values.plannedStartTime,
        plannedEndTime: values.plannedEndTime,
        employeeId: values.employeeId,
        cleaningChecklistId: values.cleaningChecklistId,
        observations: values.observations,
      });
      navigate("/coordinador");
    } catch {
      setError("No se pudo completar la asignación");
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
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-slate-900">
                Completar asignación
              </h1>
              {task ? (
                <p className="truncate text-xs text-slate-400">
                  {task.taskNumber} · {task.description}
                </p>
              ) : null}
            </div>
          </div>
        </div>

        <div className="px-4 py-5">
          {loading ? (
            <p className="text-sm text-slate-500">Cargando...</p>
          ) : (
            <CleaningAssignmentForm
              variant="assign"
              submitLabel="Guardar"
              submitting={submitting}
              onCancel={() => navigate("/coordinador")}
              onSubmit={(values) => void handleSubmit(values)}
            />
          )}
        </div>

        <ErrorModal open={error !== null} message={error ?? undefined} onClose={() => setError(null)} />
      </main>
    </AppLayout>
  );
};
