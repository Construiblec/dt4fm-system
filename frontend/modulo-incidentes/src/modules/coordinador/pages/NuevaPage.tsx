import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarDays, Eye, Inbox, Plus } from "lucide-react";
import type {
  CreateManualTaskPayload,
  EmployeeOption,
  UpdateTaskPayload,
} from "../types/Coordinador";
import { createManualTask } from "../services/coordinadorService";
import {
  useChecklists,
  useCoordTasks,
  useEmployees,
  useInvalidateCoord,
} from "../hooks/useCoordData";
import { formatDayShort, formatRange, ymdOf } from "../domain/dates";
import { TaskForm, type TaskFormContext } from "../components/TaskForm";
import { employeeName } from "../components/taskLabels";
import {
  Button,
  Card,
  Chip,
  InlineAlert,
  PageHeader,
  Skeleton,
} from "../components/ui";
import { useOpenTask } from "../layout/useOpenTask";

type Created = {
  taskId: number | null;
  taskNumber: string;
  employee: EmployeeOption | null;
  startIso: string | null;
  endIso: string | null;
};

/** Limpieza manual: para lo que no viene de Hostaway. Sin empleado, queda en Pendientes. */
export const NuevaPage = () => {
  const navigate = useNavigate();
  const { open } = useOpenTask();
  const invalidate = useInvalidateCoord();
  const tasksQ = useCoordTasks();
  const employeesQ = useEmployees();
  const checklistsQ = useChecklists();
  const [created, setCreated] = useState<Created | null>(null);
  const [formKey, setFormKey] = useState(0);

  const ready = tasksQ.data && employeesQ.data && checklistsQ.data;

  const submit = async (
    payload: UpdateTaskPayload | CreateManualTaskPayload,
    context: TaskFormContext,
  ) => {
    const result = await createManualTask(payload as CreateManualTaskPayload);
    await invalidate();
    setCreated({
      taskId: result.taskId,
      taskNumber: result.taskNumber,
      employee: context.employee,
      startIso: context.startIso,
      endIso: context.endIso,
    });
    window.scrollTo(0, 0);
  };

  const again = () => {
    setCreated(null);
    setFormKey((k) => k + 1);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Nueva limpieza"
        subtitle="Para limpiezas que no vienen de Hostaway: limpiezas profundas, repasos o pedidos del propietario."
      />

      {created ? (
        <Card>
          <div className="space-y-4">
            <InlineAlert
              tone="success"
              title={`Limpieza ${created.taskNumber} creada.`}
            >
              {created.employee && created.startIso
                ? `Asignada a ${employeeName(created.employee)} · ${formatDayShort(ymdOf(created.startIso))}, ${formatRange(created.startIso, created.endIso)}.`
                : "Quedó en Pendientes porque no tiene empleado."}
            </InlineAlert>
            <div className="flex flex-wrap gap-2">
              {created.taskId ? (
                <Button
                  icon={Eye}
                  onClick={() => open(created.taskId as number)}
                >
                  Ver ficha
                </Button>
              ) : null}
              {created.employee ? (
                <Button
                  icon={CalendarDays}
                  onClick={() => navigate("/coordinador/agenda")}
                >
                  Ver en la agenda
                </Button>
              ) : (
                <Button
                  icon={Inbox}
                  onClick={() => navigate("/coordinador/pendientes")}
                >
                  Ir a Pendientes
                </Button>
              )}
              <Button variant="primary" icon={Plus} onClick={again}>
                Crear otra
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm shadow-sm">
            <span className="text-slate-600">La tarjeta se crea con</span>
            <Chip tone="outline">Origen: Manual</Chip>
          </div>
          {ready ? (
            <TaskForm
              key={formKey}
              variant="nueva"
              task={null}
              employees={employeesQ.data ?? []}
              tasks={tasksQ.data ?? []}
              checklists={checklistsQ.data ?? []}
              submitLabel="Crear limpieza"
              inPage
              onSubmit={submit}
              onCancel={() => navigate("/coordinador/limpiezas")}
            />
          ) : (
            <Card bodyClass="">
              <Skeleton rows={6} />
            </Card>
          )}
        </div>
      )}
    </div>
  );
};
