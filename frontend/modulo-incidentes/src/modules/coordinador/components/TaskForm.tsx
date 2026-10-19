import { useMemo, useState, type FormEvent } from "react";
import type {
  Checklist,
  CoordTask,
  CoordTaskDetail,
  CreateManualTaskPayload,
  EmployeeOption,
  UpdateTaskPayload,
} from "../types/Coordinador";
import { describeApiError } from "../services/coordinadorService";
import {
  describeChecklistMinutes,
  summarizeChecklist,
} from "../domain/checklist";
import {
  formatDate,
  formatRange,
  hmOf,
  isoAt,
  sameInstant,
  todayYmd,
  ymdOf,
} from "../domain/dates";
import { conflictsFor, taskDate } from "../domain/tasks";
import { useNow } from "../hooks/useNow";
import {
  BuildingUnitPicker,
  ChecklistSelect,
  ChecklistSummaryLine,
  EmployeeSelect,
} from "./pickers";
import { DateField } from "./DateField";
import { TimeField } from "./TimeField";
import { employeeName } from "./taskLabels";
import { Button, Field, InlineAlert } from "./ui";
import { inputClass } from "./uiUtils";

/**
 * El formulario de la limpieza, en tres usos:
 * - nueva: limpieza manual (descripción y horario obligatorios; lo demás, opcional).
 * - completar: una pendiente. Se puede guardar a medias (por ejemplo, solo
 *   corregir el checkout) y sigue en Pendientes hasta tener empleado y horario.
 *   Elegir empleado sí exige el horario: el backend le avisa al empleado apenas
 *   se le asigna, y no debe recibir una limpieza sin hora.
 * - editar: una asignada que no empezó. No puede perder el empleado.
 */
export type TaskFormVariant = "nueva" | "completar" | "editar";

export type TaskFormContext = {
  employee: EmployeeOption | null;
  startIso: string | null;
  endIso: string | null;
};

type TaskFormProps = {
  variant: TaskFormVariant;
  task: CoordTaskDetail | null;
  employees: EmployeeOption[];
  tasks: CoordTask[];
  checklists: Checklist[];
  submitLabel: string;
  inPage?: boolean;
  onSubmit: (
    payload: UpdateTaskPayload | CreateManualTaskPayload,
    context: TaskFormContext,
  ) => Promise<unknown>;
  onCancel: () => void;
};

export const TaskForm = ({
  variant,
  task,
  employees,
  tasks,
  checklists,
  submitLabel,
  inPage,
  onSubmit,
  onCancel,
}: TaskFormProps) => {
  const isNew = variant === "nueva";
  const nowMs = useNow();
  const today = todayYmd(nowMs);
  const source = task?.source ?? "Manual";
  const initialDate = task
    ? (ymdOf(task.plannedStartTime) ?? task.checkoutDate ?? today)
    : today;

  const [description, setDescription] = useState(task?.description ?? "");
  const [checkoutDate, setCheckoutDate] = useState(task?.checkoutDate ?? "");
  const [unitId, setUnitId] = useState<number | null>(task?.unit?.id ?? null);
  const [date, setDate] = useState(initialDate);
  const [start, setStart] = useState(hmOf(task?.plannedStartTime) ?? "");
  const [end, setEnd] = useState(hmOf(task?.plannedEndTime) ?? "");
  const [checklistId, setChecklistId] = useState<number | null>(
    task?.checklistDetail?.id ?? null,
  );
  const [employeeId, setEmployeeId] = useState<number | null>(
    task?.employee?.id ?? null,
  );
  const [observations, setObservations] = useState(
    task?.taskObservations ?? "",
  );
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const selfIds = useMemo(() => (task ? [task.id] : []), [task]);
  const startIso = date && start ? isoAt(date, start) : null;
  const endIso = date && end ? isoAt(date, end) : null;
  const chosenChecklist = checklists.find((c) => c.id === checklistId) ?? null;
  const checklistSummary = chosenChecklist
    ? summarizeChecklist(chosenChecklist.activities)
    : null;
  const employee = employees.find((e) => e.id === employeeId) ?? null;
  const conflicts = conflictsFor(employeeId, startIso, endIso, tasks, selfIds);
  const employeeChanged = Boolean(
    employeeId && (!task?.employee || task.employee.id !== employeeId),
  );

  const duplicates =
    isNew && unitId && date
      ? tasks.filter(
          (t) =>
            t.phase !== "Cancelled" &&
            t.unit?.id === unitId &&
            taskDate(t) === date,
        )
      : [];

  const warnings: string[] = [];
  if (startIso && employeeId && Date.parse(startIso) < nowMs) {
    warnings.push(
      "El inicio ya pasó: la limpieza aparecerá como atrasada apenas la guardes.",
    );
  }
  if (checkoutDate && date && date < checkoutDate) {
    warnings.push(
      `La fecha planificada es anterior al checkout (${formatDate(checkoutDate)}).`,
    );
  }

  const partialAllowed = variant === "completar";

  const validate = () => {
    const next: Record<string, string | null> = {};
    if (!description.trim()) {
      next.description = isNew
        ? "Describe la limpieza."
        : "La descripción no puede quedar vacía.";
    }
    if (!isNew && source === "Hostaway" && !checkoutDate) {
      next.checkoutDate = "Completa la fecha de checkout.";
    }
    // A medias solo sin empleado: asignar le avisa al empleado, y sin horario
    // recibiría una limpieza sin hora mientras sigue en Pendientes.
    const scheduleRequired =
      !partialAllowed || Boolean(employeeId) || Boolean(start) || Boolean(end);
    if (scheduleRequired) {
      if (!date) next.date = "Completa la fecha.";
      if (!start) next.start = "Completa la hora de inicio.";
      if (!end) next.end = "Completa la hora de fin.";
    }
    if (start && end && end <= start)
      next.end = "El fin debe ser posterior al inicio.";
    if (variant === "editar" && !employeeId)
      next.employee = "Elige el empleado.";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = (): UpdateTaskPayload | CreateManualTaskPayload => {
    if (isNew) {
      const payload: CreateManualTaskPayload = {
        description: description.trim(),
        plannedStartTime: startIso as string,
        plannedEndTime: endIso as string,
      };
      if (unitId) payload.unitId = unitId;
      if (employeeId) payload.employeeId = employeeId;
      if (checklistId) payload.cleaningChecklistId = checklistId;
      if (observations.trim()) payload.observations = observations.trim();
      return payload;
    }

    // Edición: solo viaja lo que cambió.
    const current = task as CoordTaskDetail;
    const payload: UpdateTaskPayload = {};
    if (description.trim() !== (current.description ?? ""))
      payload.description = description.trim();
    if (
      source === "Hostaway" &&
      checkoutDate &&
      checkoutDate !== current.checkoutDate
    ) {
      payload.checkoutDate = checkoutDate;
    }
    if ((unitId ?? null) !== (current.unit?.id ?? null))
      payload.unitId = unitId;
    // Por instante y no por texto: openMAINT las devuelve en UTC (`…Z`).
    if (startIso && !sameInstant(startIso, current.plannedStartTime))
      payload.plannedStartTime = startIso;
    if (endIso && !sameInstant(endIso, current.plannedEndTime))
      payload.plannedEndTime = endIso;
    if (employeeChanged && employeeId) payload.employeeId = employeeId;
    if ((checklistId ?? null) !== (current.checklistDetail?.id ?? null)) {
      payload.cleaningChecklistId = checklistId;
    }
    if ((observations.trim() || null) !== (current.taskObservations || null)) {
      payload.observations = observations.trim() || null;
    }
    return payload;
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSubmitError(null);
    if (!validate()) return;

    setSubmitting(true);
    Promise.resolve(onSubmit(buildPayload(), { employee, startIso, endIso }))
      .catch((error: unknown) =>
        setSubmitError(
          describeApiError(error, "No se pudo guardar. Intenta de nuevo."),
        ),
      )
      .finally(() => setSubmitting(false));
  };

  const unitHint =
    task && !task.unit && task.hostawayListingId
      ? `El listing ${task.hostawayListingId} no tiene una única unidad en openMAINT. Puedes dejarla vacía.`
      : "Opcional.";

  return (
    <form className="space-y-4" onSubmit={submit} noValidate>
      <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
        <Field
          label="Descripción"
          htmlFor="f-descripcion"
          required
          error={errors.description}
          hint={
            isNew
              ? "Lo que verá el equipo como título. Ejemplo: Limpieza profunda - Pradera, Suite I41."
              : null
          }
        >
          <input
            id="f-descripcion"
            className={inputClass(errors.description)}
            value={description}
            maxLength={200}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        {!isNew && source === "Hostaway" && task ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Fecha de checkout"
              htmlFor="f-checkout"
              required
              error={errors.checkoutDate}
              hint="Corrígela si la reserva cambió en Hostaway."
            >
              <DateField
                id="f-checkout"
                width="w-full"
                invalid={Boolean(errors.checkoutDate)}
                value={checkoutDate}
                onChange={setCheckoutDate}
              />
            </Field>
            <div className="space-y-1.5 text-sm">
              <p className="font-semibold text-slate-700">
                Reserva de Hostaway
              </p>
              <p className="font-mono text-slate-900">
                {task.hostawayReservation}
              </p>
              <p className="text-xs text-slate-500">
                {task.description?.replace(/^Limpieza - /, "")} · listing{" "}
                {task.hostawayListingId ?? "—"}
              </p>
            </div>
          </div>
        ) : null}
      </section>

      <section className="space-y-2 rounded-2xl bg-white p-4 shadow-sm">
        <Field label="Unidad" htmlFor="f-unidad-edificio" hint={unitHint}>
          <BuildingUnitPicker
            idPrefix="f-unidad"
            unitId={unitId}
            initialBuildingId={task?.unit?.buildingId ?? null}
            onChange={setUnitId}
          />
        </Field>
        {duplicates.length > 0 ? (
          <InlineAlert tone="warning">
            Esta unidad ya tiene{" "}
            {duplicates.map((t) => t.taskNumber).join(", ")} ese día. Revisa que
            no sea la misma limpieza.
          </InlineAlert>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl bg-white p-4 shadow-sm">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Fecha" htmlFor="f-fecha" required error={errors.date}>
            <DateField
              id="f-fecha"
              width="w-full"
              invalid={Boolean(errors.date)}
              value={date}
              onChange={setDate}
            />
          </Field>
          <Field
            label="Inicio"
            htmlFor="f-inicio"
            required
            error={errors.start}
          >
            <TimeField
              id="f-inicio"
              invalid={Boolean(errors.start)}
              value={start}
              onChange={setStart}
            />
          </Field>
          <Field label="Fin" htmlFor="f-fin" required error={errors.end}>
            <TimeField
              id="f-fin"
              invalid={Boolean(errors.end)}
              value={end}
              onChange={setEnd}
            />
          </Field>
        </div>

        <Field label="Checklist" htmlFor="f-checklist">
          <ChecklistSelect
            id="f-checklist"
            value={checklistId}
            onChange={setChecklistId}
            checklists={checklists}
          />
        </Field>
        {chosenChecklist && checklistSummary ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">
            <ChecklistSummaryLine rows={chosenChecklist.activities} />
            {checklistSummary.minutes !== null ? (
              <span className="text-xs text-slate-500">
                Tiempo estimado: {describeChecklistMinutes(checklistSummary)}
              </span>
            ) : null}
          </div>
        ) : null}

        <Field
          label="Empleado"
          htmlFor="f-empleado"
          required={!isNew}
          error={errors.employee}
          hint={
            isNew
              ? "Opcional. Si la dejas sin empleado, queda en Pendientes."
              : null
          }
        >
          <EmployeeSelect
            id="f-empleado"
            value={employeeId}
            onChange={(value) => {
              setEmployeeId(value);
              setErrors((e) => ({ ...e, employee: null }));
            }}
            employees={employees}
            tasks={tasks}
            date={date}
            startIso={startIso}
            endIso={endIso}
            excludeIds={selfIds}
            invalid={Boolean(errors.employee)}
            placeholder={isNew ? "Sin empleado por ahora" : "Elige un empleado"}
          />
        </Field>
        {conflicts.length > 0 ? (
          <InlineAlert tone="warning" title="Se superpone con otras limpiezas">
            {employeeName(employee)} ya tiene{" "}
            {conflicts.map((t, i) => (
              <span key={t.id}>
                {i ? ", " : ""}
                <strong>{t.taskNumber}</strong> de{" "}
                {formatRange(t.plannedStartTime, t.plannedEndTime)}
              </span>
            ))}
            . Puedes guardar igual.
          </InlineAlert>
        ) : null}
        {warnings.map((w) => (
          <InlineAlert key={w} tone="warning">
            {w}
          </InlineAlert>
        ))}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm">
        <Field label="Observaciones para el equipo" htmlFor="f-observaciones">
          <textarea
            id="f-observaciones"
            rows={3}
            maxLength={500}
            className={inputClass(false)}
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
          />
        </Field>
      </section>

      {submitError ? (
        <InlineAlert tone="error" title="No se pudo guardar.">
          {submitError}
        </InlineAlert>
      ) : null}

      <div
        className={
          inPage
            ? "sticky bottom-4 z-10 flex flex-wrap items-center justify-end gap-3 rounded-2xl bg-white px-5 py-3 shadow-lg ring-1 ring-slate-200"
            : "sticky bottom-0 -mx-5 -mb-5 flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-white px-5 py-3"
        }
      >
        <Button onClick={onCancel} disabled={submitting}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant="primary"
          loading={submitting}
          disabled={submitting}
        >
          {submitting
            ? "Guardando…"
            : partialAllowed
              ? employeeId
                ? "Asignar"
                : "Guardar sin asignar"
              : submitLabel}
        </Button>
      </div>
    </form>
  );
};
