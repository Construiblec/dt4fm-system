import { Info, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

type Props = {
  maintenance: SupervisedMaintenance;
  /** `reassign` mantiene el equipo fijo y solo cambia la persona */
  mode: "assign" | "reassign";
  onClose: () => void;
  onSuccess: (updated: SupervisedMaintenance) => void;
};

const selectClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-brand focus:ring-4 focus:ring-brand/20 disabled:bg-slate-50 disabled:text-slate-400";

const label = (text: string) => (
  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
    {text}
  </label>
);

export const AssignAssigneeModal = ({
  maintenance,
  mode,
  onClose,
  onSuccess,
}: Props) => {
  const isCorrective = maintenance.kind === "corrective";
  const isReassign = mode === "reassign";

  const [employees, setEmployees] = useState<Assignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Se arranca con el equipo que ya tenga. Al reasignar es fijo; al asignar
  // ahorra un paso en el caso que trajo este arreglo: un correctivo devuelto
  // desde la revisión, que vuelve con equipo y cesionario puestos.
  const [teamId, setTeamId] = useState<number | null>(
    maintenance.team?.id ?? null,
  );
  const [assigneeId, setAssigneeId] = useState<number | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await listAssignees();
        setEmployees(response.data);
      } catch (err) {
        setError(
          getApiErrorMessage(err, "No se pudieron cargar los empleados"),
        );
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, []);

  /**
   * El rol no tiene permiso de lectura sobre la clase `Team`, así que los
   * equipos se derivan de las fichas de empleado, que sí traen la referencia
   * resuelta.
   */
  const teams = useMemo(() => {
    const byId = new Map<number, string>();
    employees.forEach((employee) => {
      if (employee.team) byId.set(employee.team.id, employee.team.name);
    });
    return [...byId.entries()].map(([id, name]) => ({ id, name }));
  }, [employees]);

  const currentAssignee = employees.find(
    (employee) => employee.id === maintenance.assignee?.id,
  );

  /** Un proveedor pertenece a un solo equipo: su trabajo no se reasigna. */
  const blockedBySupplier = isReassign && Boolean(currentAssignee?.isSupplier);

  /**
   * Nadie se asigna trabajo a sí mismo: quien supervisa reparte, no ejecuta.
   * `null` cuando la sesión no tiene ficha de empleado, y entonces no se filtra
   * a nadie.
   */
  const selfId = getEmployeeId();

  /**
   * El cesionario actual **sí** aparece. Un correctivo devuelto desde la
   * revisión conserva a quien lo tenía, y lo normal es que lo repita la misma
   * persona; excluirla dejaba sin salida el caso más frecuente.
   *
   * Los proveedores quedan fuera al reasignar porque pertenecen a un solo
   * equipo y su trabajo no se traspasa.
   */
  const candidates = useMemo(() => {
    const sameTeam = employees.filter(
      (employee) => teamId === null || employee.team?.id === teamId,
    );

    return sameTeam.filter(
      (employee) =>
        employee.id !== selfId && !(isReassign && employee.isSupplier),
    );
  }, [employees, teamId, isReassign, selfId]);

  /**
   * Red de seguridad: el detalle ya deshabilita «Asignar» sin inicio previsto,
   * pero la fecha puede haberse quedado atrás (otra pestaña, un rechazo que la
   * borró). El backend responde 400 igualmente; esto solo evita el viaje.
   */
  const faltaPlanificar =
    isCorrective && !isReassign && !maintenance.plannedStart;

  const canSubmit =
    !saving &&
    !blockedBySupplier &&
    !faltaPlanificar &&
    assigneeId !== null &&
    (isReassign || teamId !== null);

  const handleSubmit = async () => {
    if (assigneeId === null) return;

    try {
      setSaving(true);
      setError(null);

      const response = isReassign
        ? await updateAssignee(maintenance.kind, maintenance.id, assigneeId)
        : await assignMaintenance(maintenance.kind, maintenance.id, {
            assigneeId,
            // En preventivo el backend lo ignora: `Team` no es escribible en
            // ningún paso de su flujo.
            ...(isCorrective && teamId !== null ? { teamId } : {}),
            // El inicio previsto no viaja aquí: se fija en «Planificar inicio
            // de ejecución», que es el único sitio donde se pone. Tenerlo
            // también en este modal daba dos formularios para el mismo dato.
          });

      onSuccess(response.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo guardar la asignación"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-slate-900">
            {isReassign ? "Reasignar cesionario" : "Asignar cesionario"}
          </h2>
          <p className="text-sm text-slate-500">
            {maintenance.number ?? ""}
            {maintenance.site ? ` · ${maintenance.site}` : ""}
          </p>
        </div>

        <div className="mt-5 space-y-4">
          {loading ? (
            <p className="text-sm text-slate-500">Cargando empleados...</p>
          ) : (
            <>
              {/* Equipo: fijo al reasignar, y ausente en preventivo al asignar */}
              {isReassign ? (
                <div>
                  {label("Equipo de trabajo")}
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-sm text-slate-500">
                      {maintenance.team?.name ?? "Sin equipo"}
                    </span>
                    <Lock className="h-4 w-4 shrink-0 text-slate-400" />
                  </div>
                  <p className="mt-1.5 text-xs text-slate-400">
                    El equipo no se puede cambiar; solo la persona dentro de él.
                  </p>
                </div>
              ) : isCorrective ? (
                <div>
                  {label("Equipo de trabajo")}
                  <select
                    value={teamId ?? ""}
                    onChange={(event) => {
                      setTeamId(
                        event.target.value ? Number(event.target.value) : null,
                      );
                      setAssigneeId(null);
                    }}
                    className={selectClass}
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
                <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">
                  <Info className="h-4 w-4 shrink-0" />
                  <p>
                    En preventivos el equipo lo define el plan de mantenimiento
                    y no se puede cambiar: aquí solo se elige la persona.
                  </p>
                </div>
              )}

              {blockedBySupplier ? (
                <div className="flex items-start gap-2 rounded-xl bg-slate-100 p-3 text-xs text-slate-600">
                  <Lock className="h-4 w-4 shrink-0" />
                  <p>
                    <strong>{maintenance.assignee?.name}</strong> es un
                    proveedor externo y pertenece a un solo equipo, así que este
                    mantenimiento no es reasignable.
                  </p>
                </div>
              ) : (
                <div>
                  {label(isReassign ? "Nuevo cesionario" : "Cesionario")}
                  <select
                    value={assigneeId ?? ""}
                    onChange={(event) =>
                      setAssigneeId(
                        event.target.value ? Number(event.target.value) : null,
                      )
                    }
                    disabled={isCorrective && !isReassign && teamId === null}
                    className={selectClass}
                  >
                    <option value="">
                      {isCorrective && !isReassign && teamId === null
                        ? "Elige primero el equipo"
                        : "Selecciona una persona…"}
                    </option>
                    {candidates.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name}
                        {employee.isSupplier ? " · proveedor" : ""}
                      </option>
                    ))}
                  </select>
                  {candidates.length === 0 ? (
                    <p className="mt-1.5 text-xs text-amber-700">
                      No hay empleados disponibles en este equipo.
                    </p>
                  ) : null}
                </div>
              )}

              {faltaPlanificar ? (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                  <Info className="h-4 w-4 shrink-0" />
                  <p>
                    Falta el <strong>inicio previsto</strong>. Cierra esto y
                    fíjalo en «Planificar inicio de ejecución»: después de
                    asignar, openMAINT ya no deja ponerlo.
                  </p>
                </div>
              ) : null}

              {isCorrective && !isReassign ? (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
                  <Info className="h-4 w-4 shrink-0" />
                  <p>
                    Al asignar, openMAINT lleva el correctivo a{" "}
                    <strong>Ejecución</strong>. La app lo mostrará como{" "}
                    <strong>Asignado</strong> y sin hora de inicio hasta que el
                    técnico lo arranque.
                  </p>
                </div>
              ) : null}

              {/* Devuelto desde la revisión: vuelve con cesionario puesto */}
              {isCorrective && !isReassign && maintenance.assignee ? (
                <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                  <Info className="h-4 w-4 shrink-0" />
                  <p>
                    Venía asignado a{" "}
                    <strong>{maintenance.assignee.name}</strong>; puedes
                    dejárselo o elegir a otra persona. Al devolverlo, openMAINT
                    borró las horas de inicio y fin del intento anterior.
                  </p>
                </div>
              ) : null}
            </>
          )}

          {error ? (
            <p className="rounded-xl bg-red-50 p-3 text-xs text-red-600">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            {blockedBySupplier ? "Entendido" : "Cancelar"}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSubmit}
            className={`rounded-xl px-4 py-3 text-sm font-semibold text-white ${
              canSubmit
                ? "bg-brand hover:bg-brand-hover"
                : "cursor-not-allowed bg-slate-300"
            }`}
          >
            {saving ? "Guardando..." : isReassign ? "Reasignar" : "Asignar"}
          </button>
        </div>
      </div>
    </div>
  );
};
