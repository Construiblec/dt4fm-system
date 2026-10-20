import { Info } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  FormCard,
  FormField,
  FullScreenForm,
} from "@/modules/supervisor-mantenimiento/components/FullScreenForm";
import { formInputClass } from "@/modules/supervisor-mantenimiento/constants/formStyles";
import {
  assignMaintenance,
  getApiErrorMessage,
  getMaintenanceDetail,
  listAssignees,
  listCorrectiveAssets,
} from "@/modules/supervisor-mantenimiento/services/maintenanceSupervisionService";
import type {
  AssetOption,
  Assignee,
  SupervisedMaintenance,
} from "@/modules/supervisor-mantenimiento/types/SupervisedMaintenance";
import { getEmployeeId } from "@/shared/auth/session";
import { PrioritySelector } from "@/shared/components/PrioritySelector";
import { SearchableSelect } from "@/shared/components/SearchableSelect";
import { toPriorityCode, type PriorityCode } from "@/shared/constants/priority";
import { toDateTimeLocal } from "@/shared/utils/dateTimeInput";
import { equipmentLabel } from "@/shared/utils/equipmentLabel";
import { plannedStartProblem } from "@/shared/utils/plannedStart";
import { PlannedStartInputs } from "@/modules/supervisor-mantenimiento/components/PlannedStartInputs";

/**
 * «Asignar y programar» en pantalla completa: prioridad, inicio previsto, equipo
 * de trabajo, responsable y equipo intervenido viajan en un solo avance (CM02).
 */
export const CorrectiveAssignPage = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  const detailPath = `/supervisor-mantenimiento/corrective/${id}`;

  const [maintenance, setMaintenance] = useState<SupervisedMaintenance | null>(
    null,
  );
  const [employees, setEmployees] = useState<Assignee[]>([]);
  const [assets, setAssets] = useState<AssetOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [priority, setPriority] = useState<PriorityCode | null>(null);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [teamId, setTeamId] = useState<number | null>(null);
  const [assigneeId, setAssigneeId] = useState<number | null>(null);
  const [assetId, setAssetId] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    Promise.all([
      getMaintenanceDetail("corrective", Number(id)),
      listAssignees(),
    ])
      .then(([detail, people]) => {
        const data = detail.data;
        setMaintenance(data);
        setEmployees(people.data);
        setPriority(toPriorityCode(data.priority?.code));
        setFecha(toDateTimeLocal(data.plannedStart).slice(0, 10));
        setHora(toDateTimeLocal(data.plannedStart).slice(11, 16));
        setTeamId(data.team?.id ?? null);
        // Un correctivo reabierto vuelve con su responsable: se propone el mismo
        setAssigneeId(data.assignee?.id ?? null);
        setAssetId(data.asset ? String(data.asset.id) : "");
      })
      .catch((err) =>
        setError(getApiErrorMessage(err, "No se pudo cargar el correctivo")),
      )
      .finally(() => setLoading(false));

    listCorrectiveAssets(Number(id))
      .then(setAssets)
      .catch(() => setAssets([]))
      .finally(() => setAssetsLoading(false));
  }, [id]);

  // El rol no lee la clase `Team`: los equipos salen de las fichas de empleado
  const teams = useMemo(() => {
    const byId = new Map<number, string>();
    employees.forEach((employee) => {
      if (employee.team) byId.set(employee.team.id, employee.team.name);
    });
    return [...byId.entries()].map(([teamKey, name]) => ({
      id: teamKey,
      name,
    }));
  }, [employees]);

  const selfId = getEmployeeId();
  const candidates = useMemo(
    () =>
      employees.filter(
        (employee) =>
          (teamId === null || employee.team?.id === teamId) &&
          employee.id !== selfId,
      ),
    [employees, teamId, selfId],
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

  const missing = loading
    ? null
    : priority === null
      ? "Elige la prioridad."
      : plannedStartProblem(fecha, hora)
        ? plannedStartProblem(fecha, hora)
        : teamId === null
          ? "Elige el equipo de trabajo."
          : assigneeId === null
            ? "Elige a la persona responsable."
            : null;

  const close = () => navigate(detailPath);

  const handleSubmit = async () => {
    if (!maintenance || missing || assigneeId === null || teamId === null)
      return;

    try {
      setSaving(true);
      setError(null);
      const response = await assignMaintenance("corrective", maintenance.id, {
        assigneeId,
        teamId,
        priority: priority ?? undefined,
        plannedStart: new Date(`${fecha}T${hora}`).toISOString(),
        ...(assetId ? { assetId: Number(assetId) } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      });
      navigate(detailPath, {
        replace: true,
        state: {
          banner: `Asignado a ${response.data.assignee?.name ?? "el responsable"}.`,
        },
      });
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo guardar la asignación"));
      setSaving(false);
    }
  };

  return (
    <FullScreenForm
      title="Asignar y programar"
      subtitle={
        maintenance
          ? [maintenance.number, maintenance.subject]
              .filter(Boolean)
              .join(" · ")
          : null
      }
      onClose={close}
      submitLabel="Asignar"
      submitting={saving}
      canSubmit={!loading && missing === null && maintenance !== null}
      onSubmit={() => void handleSubmit()}
      missing={missing}
      error={error}
    >
      {loading ? (
        <p className="rounded-3xl bg-white p-5 text-sm text-slate-600 shadow-sm">
          Cargando...
        </p>
      ) : maintenance ? (
        <>
          <FormCard>
            <PrioritySelector value={priority} onChange={setPriority} />

            <FormField
              label="Inicio previsto"
              htmlFor="assignPlannedDate"
              help="Después de asignar ya no se puede cambiar."
            >
              <PlannedStartInputs
                id="assignPlannedDate"
                fecha={fecha}
                hora={hora}
                onFecha={setFecha}
                onHora={setHora}
              />
            </FormField>
          </FormCard>

          <FormCard>
            <FormField label="Equipo de trabajo" htmlFor="assignTeam">
              <select
                id="assignTeam"
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
            </FormField>

            <FormField
              label="Responsable"
              htmlFor="assignAssignee"
              help={
                teamId !== null && candidates.length === 0
                  ? "No hay personas disponibles en este equipo."
                  : "Solo aparecen las personas del equipo elegido."
              }
            >
              <select
                id="assignAssignee"
                value={assigneeId ?? ""}
                disabled={teamId === null}
                onChange={(event) =>
                  setAssigneeId(
                    event.target.value ? Number(event.target.value) : null,
                  )
                }
                className={formInputClass}
              >
                <option value="">
                  {teamId === null
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
            </FormField>

            {maintenance.assignee ? (
              <p className="flex items-start gap-2 rounded-xl bg-slate-50 p-3.5 text-sm text-slate-700">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                <span>
                  Venía asignado a <strong>{maintenance.assignee.name}</strong>;
                  puedes dejárselo o elegir a otra persona.
                </span>
              </p>
            ) : null}
          </FormCard>

          <FormCard>
            <FormField
              label="Equipo intervenido"
              htmlFor="assignAsset"
              note="opcional"
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
            </FormField>
          </FormCard>

          <FormCard>
            <FormField
              label="Nota para el responsable"
              htmlFor="assignNotes"
              note="opcional"
            >
              <textarea
                id="assignNotes"
                rows={3}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ej.: coordinar el ingreso con recepción antes de las 17:00."
                className="w-full resize-none rounded-xl border border-slate-400 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:border-brand focus:ring-4 focus:ring-brand/20"
              />
            </FormField>
          </FormCard>
        </>
      ) : null}
    </FullScreenForm>
  );
};
