import { useMemo, useState } from "react";
import { useBuildingLocations, useBuildings } from "../hooks/useCoordData";
import type {
  Checklist,
  CoordTask,
  EmployeeOption,
} from "../types/Coordinador";
import {
  describeChecklistMinutes,
  summarizeChecklist,
} from "../domain/checklist";
import { formatPersonName, formatRange, ymdOf } from "../domain/dates";
import { conflictsFor } from "../domain/tasks";
import { formatMinutes } from "@/modules/incidentes/utils/cleaningChecklistUtils";
import { inputClass } from "./uiUtils";

// ─── Edificio → Unidad ──────────────────────────────────────────────────────

type BuildingUnitPickerProps = {
  unitId: number | null;
  initialBuildingId: number | null;
  onChange: (unitId: number | null) => void;
  idPrefix?: string;
  invalid?: boolean;
};

/**
 * Elegir la unidad en dos pasos, como en el reporte de novedades: primero el
 * edificio y luego la unidad de ese edificio. La unidad es opcional: quien no
 * tiene unidad (el listing no está vinculado en openMAINT) se guarda igual.
 */
export const BuildingUnitPicker = ({
  unitId,
  initialBuildingId,
  onChange,
  idPrefix = "unidad",
  invalid,
}: BuildingUnitPickerProps) => {
  const buildingsQ = useBuildings();
  const [buildingId, setBuildingId] = useState<number | null>(
    initialBuildingId,
  );
  const locationsQ = useBuildingLocations(buildingId);

  const groups = useMemo(() => {
    const data = locationsQ.data;
    if (!data) return [];

    const floors = data.floors
      .map((floor) => ({
        label: floor.label,
        units: floor.areas.filter((area) => area.kind === "Unit"),
      }))
      .filter((floor) => floor.units.length > 0);

    const loose = data.unassignedAreas.filter((area) => area.kind === "Unit");
    return loose.length > 0
      ? [...floors, { label: "Sin planta", units: loose }]
      : floors;
  }, [locationsQ.data]);

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <select
        id={`${idPrefix}-edificio`}
        aria-label="Edificio"
        className={inputClass(false)}
        value={buildingId ?? ""}
        onChange={(e) => {
          setBuildingId(e.target.value ? Number(e.target.value) : null);
          onChange(null);
        }}
      >
        <option value="">Sin unidad</option>
        {(buildingsQ.data ?? []).map((b) => (
          <option key={b.id} value={b.id}>
            {b.description || b.name}
          </option>
        ))}
      </select>
      <select
        id={`${idPrefix}-unidad`}
        aria-label="Unidad"
        className={inputClass(invalid)}
        value={unitId ?? ""}
        disabled={buildingId === null || locationsQ.isLoading}
        onChange={(e) =>
          onChange(e.target.value ? Number(e.target.value) : null)
        }
      >
        <option value="">
          {buildingId === null
            ? "Primero elige el edificio"
            : locationsQ.isLoading
              ? "Cargando unidades…"
              : "Elige la unidad"}
        </option>
        {groups.map((group) => (
          <optgroup key={group.label} label={group.label}>
            {group.units.map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
};

// ─── Empleado ───────────────────────────────────────────────────────────────

/** Disponibilidad del empleado en la franja elegida: avisa, no bloquea. */
const availability = (
  employeeId: number,
  tasks: CoordTask[],
  date: string,
  startIso: string | null,
  endIso: string | null,
  excludeIds: number[],
): string => {
  const conflicts = conflictsFor(
    employeeId,
    startIso,
    endIso,
    tasks,
    excludeIds,
  );
  if (conflicts.length > 0) {
    return `ocupado ${conflicts
      .map((t) => formatRange(t.plannedStartTime, t.plannedEndTime))
      .join(", ")}`;
  }

  const sameDay = tasks.filter(
    (t) =>
      !excludeIds.includes(t.id) &&
      t.employee?.id === employeeId &&
      t.phase !== "Cancelled" &&
      t.plannedStartTime &&
      ymdOf(t.plannedStartTime) === date,
  ).length;

  return sameDay
    ? `${sameDay} ${sameDay === 1 ? "limpieza" : "limpiezas"} ese día`
    : "";
};

type EmployeeSelectProps = {
  id: string;
  value: number | null;
  onChange: (id: number | null) => void;
  employees: EmployeeOption[];
  tasks: CoordTask[];
  date: string;
  startIso: string | null;
  endIso: string | null;
  excludeIds: number[];
  invalid?: boolean;
  placeholder?: string;
};

export const EmployeeSelect = ({
  id,
  value,
  onChange,
  employees,
  tasks,
  date,
  startIso,
  endIso,
  excludeIds,
  invalid,
  placeholder,
}: EmployeeSelectProps) => {
  const groups = useMemo(() => {
    const map = new Map<string, EmployeeOption[]>();
    employees.forEach((e) => {
      const key = e.team?.name ?? "Sin equipo";
      map.set(key, [...(map.get(key) ?? []), e]);
    });
    return [...map.entries()];
  }, [employees]);

  return (
    <select
      id={id}
      className={inputClass(invalid)}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
    >
      <option value="">{placeholder ?? "Elige un empleado"}</option>
      {groups.map(([team, list]) => (
        <optgroup key={team} label={team}>
          {list.map((e) => {
            const note = availability(
              e.id,
              tasks,
              date,
              startIso,
              endIso,
              excludeIds,
            );
            return (
              <option key={e.id} value={e.id}>
                {formatPersonName(e.name) + (note ? ` — ${note}` : "")}
              </option>
            );
          })}
        </optgroup>
      ))}
    </select>
  );
};

// ─── Checklist ──────────────────────────────────────────────────────────────

export const ChecklistSelect = ({
  id,
  value,
  onChange,
  checklists,
}: {
  id: string;
  value: number | null;
  onChange: (id: number | null) => void;
  checklists: Checklist[];
}) => (
  <select
    id={id}
    className={inputClass(false)}
    value={value ?? ""}
    onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
  >
    <option value="">Sin checklist</option>
    {checklists.map((c) => {
      const summary = summarizeChecklist(c.activities);
      // Los minutos son opcionales: se nombran solo si los hay.
      const minutes =
        summary.minutes !== null ? ` · ${describeChecklistMinutes(summary)}` : "";
      return (
        <option key={c.id} value={c.id}>
          {`${c.templateName ?? c.description ?? c.id} · ${summary.activityCount} actividades${minutes}`}
        </option>
      );
    })}
  </select>
);

/**
 * Así lo ve el equipo de limpieza: secciones y una casilla por actividad. Los
 * minutos son opcionales y se muestran solo donde los hay.
 */
export const ChecklistPreview = ({ rows }: { rows: string[] }) => {
  const summary = useMemo(() => summarizeChecklist(rows), [rows]);

  if (summary.activityCount === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
        Todavía no hay actividades que mostrar.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {summary.sections.map((section, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2">
            <p className="text-sm font-semibold text-slate-900">
              {section.title || "Sin sección"}
            </p>
            {section.totalMinutes !== null ? (
              <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500">
                {`${section.hasPartialMinutes ? "~" : ""}${formatMinutes(section.totalMinutes)}`}
              </span>
            ) : null}
          </div>
          <ul className="divide-y divide-slate-100">
            {section.items.map((item) => (
              <li
                key={item.checkableIndex}
                className="flex items-start gap-3 px-4 py-2 text-sm"
              >
                <span
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border border-slate-300 bg-white"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 text-slate-700">
                  {item.text}
                </span>
                {item.minutes !== null ? (
                  <span className="shrink-0 text-xs tabular-nums text-slate-500">
                    {formatMinutes(item.minutes)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};

export const ChecklistSummaryLine = ({ rows }: { rows: string[] }) => {
  const s = summarizeChecklist(rows);
  if (s.activityCount === 0)
    return <span className="text-slate-500">Sin actividades</span>;

  return (
    <span className="tabular-nums">
      {`${s.sectionCount} ${s.sectionCount === 1 ? "sección" : "secciones"} · ${s.activityCount} actividades`}
      {s.minutes !== null ? ` · ${describeChecklistMinutes(s)}` : null}
    </span>
  );
};
