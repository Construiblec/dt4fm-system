import { Check, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formInputClass } from "@/modules/supervisor-mantenimiento/constants/formStyles";
import {
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
  onClose: () => void;
  onSuccess: (updated: SupervisedMaintenance) => void;
};

const labelClass = "mb-1.5 block text-sm font-bold text-slate-900";

/** Hoja para cambiar de responsable un correctivo ya despachado. */
export const CorrectiveReassignSheet = ({
  maintenance,
  onClose,
  onSuccess,
}: Props) => {
  const code = maintenance.statusCode ?? "";
  // `Team` solo es escribible en CM07; en ejecución solo se cambia la persona
  const teamEditable = code === "Management";
  const canAddNote = ["Assigned", "Execution"].includes(code);

  const [employees, setEmployees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<number | null>(
    maintenance.team?.id ?? null,
  );
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

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

  const teams = useMemo(() => {
    const byId = new Map<number, string>();
    employees.forEach((employee) => {
      if (employee.team) byId.set(employee.team.id, employee.team.name);
    });
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [employees]);

  const selfId = getEmployeeId();
  const currentAssignee = employees.find(
    (employee) => employee.id === maintenance.assignee?.id,
  );
  // Un proveedor pertenece a un solo equipo: su trabajo no se traspasa
  const blockedBySupplier = Boolean(currentAssignee?.isSupplier);

  const candidates = useMemo(
    () =>
      employees.filter(
        (employee) =>
          (teamId === null || employee.team?.id === teamId) &&
          employee.id !== selfId &&
          employee.id !== maintenance.assignee?.id &&
          !employee.isSupplier,
      ),
    [employees, teamId, selfId, maintenance.assignee?.id],
  );

  const canSubmit =
    !saving && !loading && !blockedBySupplier && assigneeId !== null;

  const handleSubmit = async () => {
    if (!canSubmit || assigneeId === null) return;

    try {
      setSaving(true);
      setError(null);
      const response = await updateAssignee(
        "corrective",
        maintenance.id,
        assigneeId,
        teamEditable && teamId !== null ? teamId : undefined,
        canAddNote && notes.trim() ? notes.trim() : undefined,
      );
      onSuccess(response.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo guardar el cambio"));
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open
      title="Reasignar responsable"
      onClose={saving ? () => undefined : onClose}
    >
      <div className="space-y-5 px-5">
        <p className="-mt-1 text-sm text-slate-600">
          {[maintenance.number, maintenance.subject]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {teamEditable ? (
          <div>
            <label htmlFor="reassignTeam" className={labelClass}>
              Equipo de trabajo{" "}
              <span className="font-normal text-slate-600">(obligatorio)</span>
            </label>
            <select
              id="reassignTeam"
              value={teamId ?? ""}
              onChange={(event) => {
                setTeamId(
                  event.target.value ? Number(event.target.value) : null,
                );
                setAssigneeId(null);
              }}
              className={formInputClass}
            >
              <option value="">Selecciona un equipo…</option>
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <p className={labelClass}>
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
              Con el trabajo en ejecución no se puede cambiar de equipo.
            </p>
          </div>
        )}

        {blockedBySupplier ? (
          <p className="flex items-start gap-2 rounded-xl bg-slate-100 p-3.5 text-sm text-slate-700">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span>
              <strong>{maintenance.assignee?.name}</strong> es un proveedor
              externo y pertenece a un solo equipo, así que este correctivo no
              se puede reasignar.
            </span>
          </p>
        ) : (
          <div>
            <label htmlFor="reassignAssignee" className={labelClass}>
              Nuevo responsable{" "}
              <span className="font-normal text-slate-600">(obligatorio)</span>
            </label>
            <select
              id="reassignAssignee"
              value={assigneeId ?? ""}
              disabled={loading || (teamEditable && teamId === null)}
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
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-600">
              Solo aparecen las personas del equipo elegido.
            </p>
          </div>
        )}

        {canAddNote && !blockedBySupplier ? (
          <div>
            <label htmlFor="reassignNotes" className={labelClass}>
              Motivo del cambio{" "}
              <span className="font-normal text-slate-600">(opcional)</span>
            </label>
            <textarea
              id="reassignNotes"
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Por qué cambia de persona e indicaciones para quien lo recibe…"
              className="w-full resize-none rounded-xl border border-slate-400 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-brand focus:ring-4 focus:ring-brand/20"
            />
          </div>
        ) : null}

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
            {saving ? "Guardando..." : "Reasignar"}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
};
