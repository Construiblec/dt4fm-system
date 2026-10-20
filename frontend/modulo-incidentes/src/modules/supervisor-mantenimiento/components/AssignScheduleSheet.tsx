import { Check, Info, Lock } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  assignMaintenance,
  getApiErrorMessage,
  listAssignees,
  listCorrectiveAssets,
  updateAssignee,
} from "@/modules/supervisor-mantenimiento/services/maintenanceSupervisionService";
import type {
  AssetOption,
  Assignee,
  SupervisedMaintenance,
} from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";
import { getEmployeeId } from "@/shared/auth/session";
import { BottomSheet } from "@/shared/components/BottomSheet";
import { DateField } from "@/shared/components/DateField";
import { SearchableSelect } from "@/shared/components/SearchableSelect";
import {
  PRIORITY_ADJECTIVES,
  PRIORITY_DOT_CLASSES,
  PRIORITY_ORDER,
  toPriorityCode,
  type PriorityCode,
} from "@/shared/constants/priority";
import { toDateTimeLocal } from "@/shared/utils/dateTimeInput";
import { equipmentLabel } from "@/shared/utils/equipmentLabel";

type Props = {
  maintenance: SupervisedMaintenance;
  /** `assign` despacha el correctivo; `reassign` solo cambia la persona */
  mode: "assign" | "reassign";
  onClose: () => void;
  onSuccess: (updated: SupervisedMaintenance) => void;
};

const inputClass =
  "min-h-12 w-full rounded-xl border border-slate-400 bg-white px-3.5 text-[15px] text-slate-900 outline-none focus:border-brand focus:ring-4 focus:ring-brand/20 disabled:bg-slate-50 disabled:text-slate-500";

const Field = ({
  label,
  htmlFor,
  optional = false,
  help,
  children,
}: {
  label: string;
  htmlFor?: string;
  optional?: boolean;
  help?: string;
  children: ReactNode;
}) => (
  <div>
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block text-sm font-bold text-slate-900"
    >
      {label}{" "}
      <span className="font-normal text-slate-600">
        ({optional ? "opcional" : "obligatorio"})
      </span>
    </label>
    {children}
    {help ? <p className="mt-1.5 text-xs text-slate-600">{help}</p> : null}
  </div>
);

/**
 * Hoja «Asignar y programar» del correctivo: prioridad, inicio previsto, equipo
 * de trabajo, responsable y equipo intervenido viajan en un solo avance.
 */
export const AssignScheduleSheet = ({
  maintenance,
  mode,
  onClose,
  onSuccess,
}: Props) => {
  const isReassign = mode === "reassign";
  const code = maintenance.statusCode ?? "";
  // `Team` solo es escribible en CM02 y CM07; en ejecución se cambia la persona
  const teamEditable = ["Assignment", "Management"].includes(code);
  const canAddNote = !isReassign || ["Assigned", "Execution"].includes(code);

  const [employees, setEmployees] = useState<Assignee[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetsLoading, setAssetsLoading] = useState(!isReassign);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [priority, setPriority] = useState<PriorityCode | null>(
    toPriorityCode(maintenance.priority?.code),
  );
  const [fecha, setFecha] = useState(() =>
    toDateTimeLocal(maintenance.plannedStart).slice(0, 10),
  );
  const [hora, setHora] = useState(() =>
    toDateTimeLocal(maintenance.plannedStart).slice(11, 16),
  );
  const [teamId, setTeamId] = useState<number | null>(
    maintenance.team?.id ?? null,
  );
  // Un correctivo reabierto vuelve con su responsable: se propone el mismo
  const [assigneeId, setAssigneeId] = useState<number | null>(
    isReassign ? null : (maintenance.assignee?.id ?? null),
  );
  const [assetId, setAssetId] = useState<string>(
    maintenance.asset ? String(maintenance.asset.id) : "",
  );
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

    if (!isReassign) {
      listCorrectiveAssets(maintenance.id)
        .then(setAssets)
        .catch(() => setAssets([]))
        .finally(() => setAssetsLoading(false));
    }
  }, [isReassign, maintenance.id]);

  // El rol no lee la clase `Team`: los equipos salen de las fichas de empleado
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
  const blockedBySupplier = isReassign && Boolean(currentAssignee?.isSupplier);
  const selfId = getEmployeeId();

  const candidates = useMemo(
    () =>
      employees.filter(
        (employee) =>
          (teamId === null || employee.team?.id === teamId) &&
          employee.id !== selfId &&
          !(isReassign && employee.isSupplier),
      ),
    [employees, teamId, isReassign, selfId],
  );

  const assetOptions = useMemo(
    () => [
      { value: "", label: "Sin equipo" },
      ...assets.map((asset) => ({
        value: String(asset.id),
        label: equipmentLabel(asset.code, asset.description),
        hint: asset.place ?? undefined,
      })),
    ],
    [assets],
  );

  const faltaEquipo = teamEditable && teamId === null;
  const falta = blockedBySupplier
    ? null
    : !isReassign && priority === null
      ? "Elige la prioridad."
      : !isReassign && (!fecha || !hora)
        ? "Indica la fecha y la hora de inicio previsto."
        : faltaEquipo
          ? "Elige el equipo de trabajo."
          : assigneeId === null
            ? "Elige a la persona responsable."
            : null;

  const canSubmit = !saving && !loading && !blockedBySupplier && falta === null;

  const handleSubmit = async () => {
    if (!canSubmit || assigneeId === null) return;
    const note = canAddNote && notes.trim() ? notes.trim() : undefined;

    try {
      setSaving(true);
      setError(null);

      const response = isReassign
        ? await updateAssignee(
            "corrective",
            maintenance.id,
            assigneeId,
            teamEditable && teamId !== null ? teamId : undefined,
            note,
          )
        : await assignMaintenance("corrective", maintenance.id, {
            assigneeId,
            priority: priority ?? undefined,
            plannedStart: new Date(`${fecha}T${hora}`).toISOString(),
            ...(teamEditable && teamId !== null ? { teamId } : {}),
            ...(assetId ? { assetId: Number(assetId) } : {}),
            ...(note ? { notes: note } : {}),
          });

      onSuccess(response.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo guardar la asignación"));
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      open
      title={isReassign ? "Reasignar responsable" : "Asignar y programar"}
      onClose={saving ? () => undefined : onClose}
    >
      <div className="space-y-5 px-5">
        <p className="-mt-1 text-sm text-slate-600">
          {[maintenance.number, maintenance.subject]
            .filter(Boolean)
            .join(" · ")}
        </p>

        {loading ? (
          <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
            Cargando empleados...
          </p>
        ) : (
          <>
            {!isReassign ? (
              <>
                <fieldset>
                  <legend className="mb-1.5 text-sm font-bold text-slate-900">
                    Prioridad{" "}
                    <span className="font-normal text-slate-600">
                      (obligatorio)
                    </span>
                  </legend>
                  <div className="grid grid-cols-2 gap-2">
                    {[...PRIORITY_ORDER].reverse().map((option) => (
                      <label
                        key={option}
                        className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-3.5 text-[15px] text-slate-700 transition has-[:checked]:border-2 has-[:checked]:border-brand has-[:checked]:bg-blue-50 has-[:checked]:font-bold has-[:checked]:text-blue-800 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand/20"
                      >
                        <input
                          type="radio"
                          name="priority"
                          value={option}
                          checked={priority === option}
                          onChange={() => setPriority(option)}
                          className="sr-only"
                        />
                        <span
                          aria-hidden
                          className={`h-2.5 w-2.5 shrink-0 rounded-full ${PRIORITY_DOT_CLASSES[option]}`}
                        />
                        <span className="flex-1">
                          {PRIORITY_ADJECTIVES[option]}
                        </span>
                        {priority === option ? (
                          <Check className="h-4 w-4" aria-hidden />
                        ) : null}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <Field
                  label="Inicio previsto"
                  htmlFor="assignPlannedDate"
                  help="Después de asignar ya no se puede cambiar."
                >
                  <div className="grid grid-cols-2 gap-2">
                    <DateField
                      id="assignPlannedDate"
                      value={fecha}
                      onChange={setFecha}
                    />
                    <input
                      type="time"
                      aria-label="Hora de inicio previsto"
                      value={hora}
                      onChange={(event) => setHora(event.target.value)}
                      className={inputClass}
                    />
                  </div>
                </Field>
              </>
            ) : null}

            {teamEditable ? (
              <Field label="Equipo de trabajo" htmlFor="assignTeam">
                <select
                  id="assignTeam"
                  value={teamId ?? ""}
                  onChange={(event) => {
                    setTeamId(
                      event.target.value ? Number(event.target.value) : null,
                    );
                    setAssigneeId(null);
                  }}
                  className={inputClass}
                >
                  <option value="">Selecciona un equipo…</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : (
              <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                <span className="text-sm text-slate-700">
                  Equipo de trabajo:{" "}
                  <strong>{maintenance.team?.name ?? "Sin equipo"}</strong>
                </span>
                <Lock
                  className="h-4 w-4 shrink-0 text-slate-500"
                  aria-label="No editable"
                />
              </div>
            )}

            {blockedBySupplier ? (
              <div className="flex items-start gap-2 rounded-xl bg-slate-100 p-3.5 text-sm text-slate-700">
                <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  <strong>{maintenance.assignee?.name}</strong> es un proveedor
                  externo y pertenece a un solo equipo, así que este correctivo
                  no se puede reasignar.
                </p>
              </div>
            ) : (
              <Field
                label={isReassign ? "Nuevo responsable" : "Responsable"}
                htmlFor="assignAssignee"
                help={
                  candidates.length === 0 && !faltaEquipo
                    ? "No hay personas disponibles en este equipo."
                    : "Solo aparecen las personas del equipo elegido."
                }
              >
                <select
                  id="assignAssignee"
                  value={assigneeId ?? ""}
                  onChange={(event) =>
                    setAssigneeId(
                      event.target.value ? Number(event.target.value) : null,
                    )
                  }
                  disabled={faltaEquipo}
                  className={inputClass}
                >
                  <option value="">
                    {faltaEquipo
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
              </Field>
            )}

            {!isReassign ? (
              <Field
                label="Equipo intervenido"
                htmlFor="assignAsset"
                optional
                help="Si lo eliges, verás sus documentos e historial."
              >
                <SearchableSelect
                  id="assignAsset"
                  value={assetId}
                  onChange={setAssetId}
                  options={assetOptions}
                  placeholder="Busca por nombre o código"
                  searchPlaceholder="Nombre o código del equipo"
                  emptyMessage="No hay equipos que coincidan"
                  loading={assetsLoading}
                  loadingMessage="Cargando equipos..."
                />
              </Field>
            ) : null}

            {canAddNote && !blockedBySupplier ? (
              <Field
                label={
                  isReassign ? "Motivo del cambio" : "Nota para el responsable"
                }
                htmlFor="assignNotes"
                optional
              >
                <textarea
                  id="assignNotes"
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={
                    isReassign
                      ? "Por qué cambia de persona…"
                      : "Ej.: coordinar el ingreso con recepción antes de las 17:00."
                  }
                  className="w-full resize-none rounded-xl border border-slate-400 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-brand focus:ring-4 focus:ring-brand/20"
                />
              </Field>
            ) : null}

            {!isReassign && maintenance.assignee ? (
              <div className="flex items-start gap-2 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-700">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <p>
                  Venía asignado a <strong>{maintenance.assignee.name}</strong>;
                  puedes dejárselo o elegir a otra persona.
                </p>
              </div>
            ) : null}
          </>
        )}

        {error ? (
          <p
            role="alert"
            className="rounded-xl bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        ) : null}

        {!loading && falta ? (
          <p
            role="status"
            className="rounded-xl bg-amber-50 p-3 text-sm font-medium text-amber-900"
          >
            {falta}
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
