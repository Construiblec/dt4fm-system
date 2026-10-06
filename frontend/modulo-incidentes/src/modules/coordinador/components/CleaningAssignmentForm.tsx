import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { BuildingUnitPicker } from "@/modules/coordinador/components/BuildingUnitPicker";
import { useChecklists } from "@/modules/coordinador/hooks/useChecklists";
import { useEmployees } from "@/modules/coordinador/hooks/useEmployees";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "@/shared/components/SearchableSelect";

export type CleaningAssignmentSubmitValues = {
  unitId: number;
  plannedStartTime: string;
  plannedEndTime: string;
  employeeId: number;
  cleaningChecklistId?: number;
  observations?: string;
  description?: string;
};

type FormValues = {
  buildingId: string;
  unitId: string;
  plannedStart: string;
  plannedEnd: string;
  employeeId: string;
  checklistId: string;
  description: string;
  observations: string;
};

const FIELD_CLASSES =
  "w-full rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20";

type Props = {
  /** "manual" agrega el campo Descripción, obligatorio (no hay listingName del que derivarla). */
  variant: "assign" | "manual";
  submitLabel: string;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: CleaningAssignmentSubmitValues) => void;
};

export const CleaningAssignmentForm = ({
  variant,
  submitLabel,
  submitting,
  onCancel,
  onSubmit,
}: Props) => {
  const { employees, loading: loadingEmployees } = useEmployees();
  const { templates: checklists, loading: loadingChecklists } = useChecklists();
  const [formError, setFormError] = useState<string | null>(null);

  const { control, register, handleSubmit } = useForm<FormValues>({
    defaultValues: {
      buildingId: "",
      unitId: "",
      plannedStart: "",
      plannedEnd: "",
      employeeId: "",
      checklistId: "",
      description: "",
      observations: "",
    },
  });

  const employeeOptions: SearchableSelectOption[] = employees.map((employee) => ({
    value: String(employee.id),
    label: employee.name,
    hint: employee.team?.name,
  }));

  const checklistOptions: SearchableSelectOption[] = checklists.map((template) => ({
    value: String(template.id),
    label: template.templateName ?? template.code ?? `Checklist ${template.id}`,
    hint: `${template.activities.length} pasos`,
  }));

  const submit = (values: FormValues) => {
    setFormError(null);

    if (!values.unitId) {
      setFormError("Seleccioná la unidad.");
      return;
    }
    if (!values.plannedStart || !values.plannedEnd) {
      setFormError("Completá la fecha y hora planificada.");
      return;
    }
    if (new Date(values.plannedEnd) <= new Date(values.plannedStart)) {
      setFormError("El fin planificado debe ser posterior al inicio.");
      return;
    }
    if (!values.employeeId) {
      setFormError("Seleccioná el empleado.");
      return;
    }
    if (variant === "manual" && !values.description.trim()) {
      setFormError("Describí la limpieza.");
      return;
    }

    onSubmit({
      unitId: Number(values.unitId),
      plannedStartTime: new Date(values.plannedStart).toISOString(),
      plannedEndTime: new Date(values.plannedEnd).toISOString(),
      employeeId: Number(values.employeeId),
      cleaningChecklistId: values.checklistId ? Number(values.checklistId) : undefined,
      observations: values.observations.trim() || undefined,
      description: variant === "manual" ? values.description.trim() : undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      {variant === "manual" ? (
        <section className="space-y-2">
          <label htmlFor="description" className="text-sm font-semibold text-slate-700">
            Descripción <span className="text-red-500">*</span>
          </label>
          <input
            id="description"
            type="text"
            placeholder="Limpieza profunda - Torre A, Depto 302"
            className={FIELD_CLASSES}
            {...register("description")}
          />
        </section>
      ) : null}

      <section>
        <Controller
          control={control}
          name="buildingId"
          render={({ field }) => (
            <Controller
              control={control}
              name="unitId"
              render={({ field: unitField }) => (
                <BuildingUnitPicker
                  buildingId={field.value}
                  onBuildingChange={field.onChange}
                  unitId={unitField.value}
                  onUnitChange={unitField.onChange}
                  required
                />
              )}
            />
          )}
        />
      </section>

      <section className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="plannedStart" className="text-sm font-semibold text-slate-700">
            Inicio planificado <span className="text-red-500">*</span>
          </label>
          <input
            id="plannedStart"
            type="datetime-local"
            className={FIELD_CLASSES}
            {...register("plannedStart")}
          />
        </div>
        <div className="space-y-2">
          <label htmlFor="plannedEnd" className="text-sm font-semibold text-slate-700">
            Fin planificado <span className="text-red-500">*</span>
          </label>
          <input
            id="plannedEnd"
            type="datetime-local"
            className={FIELD_CLASSES}
            {...register("plannedEnd")}
          />
        </div>
      </section>

      <section className="space-y-2">
        <label htmlFor="employeeId" className="text-sm font-semibold text-slate-700">
          Empleado <span className="text-red-500">*</span>
        </label>
        <Controller
          control={control}
          name="employeeId"
          render={({ field }) => (
            <SearchableSelect
              id="employeeId"
              value={field.value}
              onChange={field.onChange}
              options={employeeOptions}
              loading={loadingEmployees}
              loadingMessage="Cargando empleados..."
              placeholder="Buscar empleado..."
              searchPlaceholder="Buscar empleado..."
              emptyMessage="Sin empleados"
              required
            />
          )}
        />
      </section>

      <section className="space-y-2">
        <label htmlFor="checklistId" className="text-sm font-semibold text-slate-700">
          Checklist
        </label>
        <Controller
          control={control}
          name="checklistId"
          render={({ field }) => (
            <SearchableSelect
              id="checklistId"
              value={field.value}
              onChange={field.onChange}
              options={checklistOptions}
              loading={loadingChecklists}
              loadingMessage="Cargando checklists..."
              placeholder="Sin checklist"
              searchPlaceholder="Buscar checklist..."
              emptyMessage="Sin plantillas"
            />
          )}
        />
      </section>

      <section className="space-y-2">
        <label htmlFor="observations" className="text-sm font-semibold text-slate-700">
          Observaciones
        </label>
        <textarea
          id="observations"
          rows={3}
          className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
          {...register("observations")}
        />
      </section>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-red-500">
          {formError}
        </p>
      ) : null}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm font-semibold text-slate-700"
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-2xl bg-brand px-4 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/30 disabled:opacity-60"
        >
          {submitting ? "Guardando..." : submitLabel}
        </button>
      </div>
    </form>
  );
};
