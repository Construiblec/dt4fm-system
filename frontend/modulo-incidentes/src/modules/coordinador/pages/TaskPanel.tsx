import { useState } from "react";
import { Ban, Pencil, UserCheck } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import type {
  CoordTaskDetail,
  CreateManualTaskPayload,
  UpdateTaskPayload,
} from "../types/Coordinador";
import {
  cancelTask,
  describeApiError,
  updateTask,
} from "../services/coordinadorService";
import {
  useChecklists,
  useCoordTasks,
  useEmployees,
  useInvalidateCoord,
  useTaskDetail,
} from "../hooks/useCoordData";
import { useNow } from "../hooks/useNow";
import { canEdit, isPending, STATUS, statusKey } from "../domain/tasks";
import {
  formatDayShort,
  formatRange,
  relativeDay,
  todayYmd,
  ymdOf,
} from "../domain/dates";
import { Drawer, Modal } from "../components/overlays";
import { TaskForm, type TaskFormContext } from "../components/TaskForm";
import { TaskView } from "../components/TaskView";
import { SourceBadge, StatusBadges } from "../components/taskBits";
import { employeeName } from "../components/taskLabels";
import { Button, ErrorState, Field, Skeleton } from "../components/ui";
import { inputClass } from "../components/uiUtils";
import { useCoordFlash } from "../layout/flash";
import { useOpenTask } from "../layout/useOpenTask";

const CancelModal = ({
  task,
  onClose,
  onDone,
}: {
  task: CoordTaskDetail;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const invalidate = useInvalidateCoord();
  const flash = useCoordFlash((s) => s.show);

  const mutation = useMutation({
    mutationFn: () => cancelTask(task.id, reason.trim()),
    onSuccess: async () => {
      await invalidate();
      flash("success", `${task.taskNumber} quedó cancelada.`);
      onDone();
    },
    onError: (e) =>
      setError(describeApiError(e, "No se pudo cancelar la limpieza.")),
  });

  const confirm = () => {
    if (!reason.trim()) {
      setError("Escribe el motivo de la cancelación.");
      return;
    }
    setError(null);
    mutation.mutate();
  };

  return (
    <Modal
      title={`Cancelar ${task.taskNumber}`}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={mutation.isPending}>
            Volver
          </Button>
          <Button
            variant="danger"
            loading={mutation.isPending}
            disabled={mutation.isPending}
            onClick={confirm}
          >
            Cancelar limpieza
          </Button>
        </>
      }
    >
      <p>
        La limpieza pasará a <strong>Cancelada</strong> y dejará de aparecer en
        la agenda. Esto no se puede deshacer desde esta pantalla.
      </p>
      <Field label="Motivo" htmlFor="motivo-cancelacion" required error={error}>
        <textarea
          id="motivo-cancelacion"
          rows={3}
          maxLength={500}
          className={inputClass(Boolean(error))}
          placeholder="Ejemplo: la reserva se canceló en Hostaway."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <p className="text-xs text-slate-500">
        El motivo queda guardado en la tarjeta.
      </p>
    </Modal>
  );
};

const PanelBody = ({ task }: { task: CoordTaskDetail }) => {
  const { close, mode } = useOpenTask();
  const [editing, setEditing] = useState(mode === "editar");
  const [cancelOpen, setCancelOpen] = useState(false);
  const nowMs = useNow();
  const invalidate = useInvalidateCoord();
  const flash = useCoordFlash((s) => s.show);
  const tasksQ = useCoordTasks();
  const employeesQ = useEmployees();
  const checklistsQ = useChecklists();

  const pending = isPending(task);
  const editable = canEdit(task);
  const employees = employeesQ.data ?? [];
  const formReady = Boolean(tasksQ.data && employeesQ.data && checklistsQ.data);

  const save = async (
    payload: UpdateTaskPayload | CreateManualTaskPayload,
    context: TaskFormContext,
  ) => {
    if (Object.keys(payload).length === 0) {
      flash("info", `No hay cambios que guardar en ${task.taskNumber}.`);
      setEditing(false);
      return;
    }

    const result = await updateTask(task.id, payload as UpdateTaskPayload);
    await invalidate();

    if (pending) {
      if (context.employee && context.startIso && context.endIso) {
        flash(
          "success",
          `${task.taskNumber} asignada a ${employeeName(context.employee)} · ${formatDayShort(ymdOf(context.startIso))}, ${formatRange(context.startIso, context.endIso)}.`,
        );
      } else {
        const missing = [
          !context.employee && "empleado",
          !context.startIso && "horario",
        ]
          .filter(Boolean)
          .join(" y ");
        flash(
          "info",
          `Cambios guardados en ${task.taskNumber}. Sigue en Pendientes: le falta ${missing}.`,
        );
      }
      close();
    } else {
      flash(
        "success",
        `Cambios guardados en ${task.taskNumber}.${result.notified ? " Se avisó al empleado." : ""}`,
      );
      setEditing(false);
    }
  };

  const status = STATUS[statusKey(task)];
  const title = task.description ?? "Limpieza";
  const today = todayYmd(nowMs);

  const footer = !editing ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {editable ? (
        <Button
          variant="ghost"
          icon={Ban}
          className="text-red-700 hover:bg-red-50"
          onClick={() => setCancelOpen(true)}
        >
          Cancelar limpieza
        </Button>
      ) : (
        <span className="text-xs text-slate-500">
          Solo lectura: {status.label.toLowerCase()}.
        </span>
      )}
      <div className="flex gap-2">
        <Button onClick={close}>Cerrar</Button>
        {editable ? (
          <Button
            variant="primary"
            icon={pending ? UserCheck : Pencil}
            onClick={() => setEditing(true)}
          >
            {pending ? "Completar" : "Editar"}
          </Button>
        ) : null}
      </div>
    </div>
  ) : null;

  return (
    <>
      <Drawer
        title={
          editing && editable
            ? `${pending ? "Completar" : "Editar"}: ${title}`
            : title
        }
        eyebrow={
          <>
            <span className="font-mono text-slate-700">{task.taskNumber}</span>
            <SourceBadge source={task.source} />
            <span>
              {task.source === "Hostaway" ? "Sincronizada" : "Creada"}{" "}
              {relativeDay(task.generatedDate, today)}
            </span>
          </>
        }
        badges={<StatusBadges task={task} pill nowMs={nowMs} />}
        onClose={close}
        footer={footer}
      >
        {editing && editable ? (
          formReady ? (
            <TaskForm
              key={task.id}
              variant={pending ? "completar" : "editar"}
              task={task}
              employees={employees}
              tasks={tasksQ.data ?? []}
              checklists={checklistsQ.data ?? []}
              submitLabel={pending ? "Asignar" : "Guardar cambios"}
              onSubmit={save}
              onCancel={() =>
                mode === "editar" && pending ? close() : setEditing(false)
              }
            />
          ) : (
            <Skeleton rows={6} />
          )
        ) : (
          <TaskView task={task} employees={employees} nowMs={nowMs} />
        )}
      </Drawer>

      {cancelOpen ? (
        <CancelModal
          task={task}
          onClose={() => setCancelOpen(false)}
          onDone={() => {
            setCancelOpen(false);
            close();
          }}
        />
      ) : null}
    </>
  );
};

/** El panel lateral con la ficha de la limpieza que pide la URL (`?limpieza=…`). */
export const TaskPanel = () => {
  const { openId, close } = useOpenTask();
  const detailQ = useTaskDetail(openId);

  if (openId === null) return null;

  if (detailQ.data) {
    // La clave reinicia el estado de edición al abrir otra limpieza.
    return (
      <PanelBody key={`${openId}-${detailQ.data.id}`} task={detailQ.data} />
    );
  }

  return (
    <Drawer title="Limpieza" onClose={close}>
      {detailQ.isError ? (
        <ErrorState
          title="No se pudo abrir la limpieza."
          message={describeApiError(detailQ.error, "Intenta de nuevo.")}
          onRetry={() => void detailQ.refetch()}
        />
      ) : (
        <Skeleton rows={6} />
      )}
    </Drawer>
  );
};
