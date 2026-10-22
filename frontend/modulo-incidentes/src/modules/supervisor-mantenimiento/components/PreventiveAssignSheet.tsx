import { Check, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formInputClass } from "@/modules/supervisor-mantenimiento/constants/formStyles";
import {
  assignMaintenance,
  getApiErrorMessage,
  listAssignees,
  updateAssignee,
} from "@/modules/supervisor-mantenimiento/services/maintenanceSupervisionService";
import type {
  Assignee,
  SupervisedMaintenance,
} from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";
import { getEmployeeId } from "@/shared/auth/session";
import { BottomSheet } from "@/shared/components/BottomSheet";

type Props = {
  maintenance: SupervisedMaintenance;
  mode: "assign" | "reassign";
  onClose: () => void;
  onSuccess: (updated: SupervisedMaintenance) => void;
};

/** Hoja para asignar o reasignar un preventivo; el equipo lo fija el plan. */
export const PreventiveAssignSheet = ({
  maintenance,
  mode,
  onClose,
  onSuccess,
}: Props) => {
  const isReassign = mode === "reassign";
  const teamId = maintenance.team?.id ?? null;

  const [employees, setEmployees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [assigneeId, setAssigneeId] = useState<number | null>(null);

  useEffect(() => {
    listAssignees()
      .then((response) => setEmployees(response.data))
      .catch((err) =>
        setError(
          getApiErrorMessage(err, "No se pudieron cargar los empleados"),
        ),
      )
      .finally(() => setLoading(false));
  }, []);

  const selfId = getEmployeeId();
  const currentAssignee = employees.find(
    (employee) => employee.id === maintenance.assignee?.id,
  );
  // Un proveedor pertenece a un solo equipo: su trabajo no se traspasa
  const blockedBySupplier = isReassign && Boolean(currentAssignee?.isSupplier);

  const candidates = useMemo(
    () =>
      employees.filter(
        (employee) =>
          (teamId === null || employee.team?.id === teamId) &&
          employee.id !== selfId &&
          !(isReassign && employee.id === maintenance.assignee?.id) &&
          !(isReassign && employee.isSupplier),
      ),
    [employees, teamId, isReassign, selfId, maintenance.assignee?.id],
  );

  const canSubmit =
    !saving && !loading && !blockedBySupplier && assigneeId !== null;

  const handleSubmit = async () => {
    if (!canSubmit || assigneeId === null) return;

    try {
      setSaving(true);
      setError(null);
      const response = isReassign
        ? await updateAssignee("preventive", maintenance.id, assigneeId)
        : await assignMaintenance("preventive", maintenance.id, { assigneeId });
      onSuccess(response.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo guardar la asignación"));
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open
      title={isReassign ? "Reasignar responsable" : "Asignar responsable"}
      onClose={saving ? () => undefined : onClose}
    >
      <div className="space-y-5 px-5">
        <p className="-mt-1 text-sm text-slate-600">
          {[maintenance.number, maintenance.subject]
            .filter(Boolean)
            .join(" · ")}
        </p>

        <div>
          <p className="mb-1.5 text-sm font-bold text-slate-900">
            Equipo de trabajo{" "}
            <span className="font-normal text-slate-600">(no editable)</span>
          </p>
          <div className="flex min-h-12 items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5">
            <span className="text-[15px] font-semibold text-slate-900">
              {maintenance.team?.name ?? "Sin equipo"}
            </span>
            <Lock
              className="h-4 w-4 shrink-0 text-slate-500"
              aria-label="No editable"
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-600">
            En preventivos el equipo lo define el plan de mantenimiento.
          </p>
        </div>

        {blockedBySupplier ? (
          <p className="flex items-start gap-2 rounded-xl bg-slate-100 p-3.5 text-sm text-slate-700">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <strong>{maintenance.assignee?.name}</strong> es un proveedor
              externo y pertenece a un solo equipo, así que este mantenimiento
              no se puede reasignar.
            </span>
          </p>
        ) : (
          <div>
            <label
              htmlFor="preventiveAssignee"
              className="mb-1.5 block text-sm font-bold text-slate-900"
            >
              {isReassign ? "Nuevo responsable" : "Responsable"}{" "}
              <span className="font-normal text-slate-600">(obligatorio)</span>
            </label>
            <select
              id="preventiveAssignee"
              value={assigneeId ?? ""}
              disabled={loading}
              onChange={(event) =>
                setAssigneeId(
                  event.target.value ? Number(event.target.value) : null,
                )
              }
              className={formInputClass}
            >
              <option value="">
                {loading ? "Cargando empleados..." : "Selecciona una persona…"}
              </option>
              {candidates.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                  {employee.isSupplier ? " · proveedor" : ""}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-600">
              {!loading && candidates.length === 0
                ? "No hay personas disponibles en este equipo."
                : "Solo aparecen las personas del equipo del plan."}
            </p>
          </div>
        )}

        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}

        <div className="grid grid-cols-2 gap-3 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="min-h-12 rounded-2xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
          >
            {blockedBySupplier ? "Entendido" : "Cancelar"}
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-brand px-4 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600"
          >
            <Check className="h-4 w-4" aria-hidden />
            {saving ? "Guardando..." : isReassign ? "Reasignar" : "Asignar"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
