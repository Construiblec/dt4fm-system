import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock, Info } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { AccessLevelSheet } from "@/modules/supervisor-cav/components/AccessLevelSheet";
import {
  getAuthorization,
  regeneratePin,
  updateAccessLevel,
} from "@/modules/supervisor-cav/services/authorizationsService";
import { getApiErrorMessage } from "@/modules/supervisor-cav/services/cavApi";
import {
  ACCESS_LEVEL_LABELS,
  type AccessLevelChoice,
  type Authorization,
} from "@/modules/supervisor-cav/types/Authorization";
import { formatDayMonthYearTime } from "@/shared/utils/dateUtils";

export const AuthorizationDetailPage = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();
  // Vuelve al listado con el filtro que tenía; sin él (enlace directo), al rango por defecto.
  const backTo =
    (useLocation().state as { backTo?: string } | null)?.backTo ??
    "/supervisor-cav/autorizaciones";

  const [authorization, setAuthorization] = useState<Authorization | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Cerrojo de acción: evita un doble tap mientras la petición sigue en vuelo.
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [showLevelModal, setShowLevelModal] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getAuthorization(id);
      setAuthorization(response.data);
    } catch (err) {
      setError(getApiErrorMessage(err, "No se pudo cargar la autorización"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleRegenerate = async () => {
    try {
      setActionLoading(true);
      setActionError(null);
      setActionMessage(null);
      const response = await regeneratePin(id);
      setAuthorization(response.data);
      setActionMessage("Nuevo PIN generado exitosamente");
    } catch (err) {
      setActionError(
        getApiErrorMessage(err, "No se pudo generar un nuevo PIN"),
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangeAccessLevel = async (level: AccessLevelChoice) => {
    const response = await updateAccessLevel(id, level);
    setAuthorization(response.data);
    setShowLevelModal(false);
    setActionError(null);
    setActionMessage(
      level === "none"
        ? "Acceso revocado"
        : authorization?.accessRevoked
          ? "Acceso restaurado"
          : null,
    );
  };

  const revoked = authorization?.accessRevoked ?? null;

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen bg-gray-100 px-4 py-4">
        <div className="mx-auto w-full max-w-sm space-y-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(backTo)}
              aria-label="Volver"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700"
            >
              <ArrowLeft className="h-4.5 w-4.5" />
            </button>
            <h1 className="text-xl font-bold text-slate-900">Acceso</h1>
          </div>

          {loading ? (
            <div className="rounded-xl bg-white p-4 text-sm text-slate-500 shadow-sm">
              Cargando...
            </div>
          ) : null}

          {error ? (
            <div className="rounded-xl bg-white p-4 text-sm text-red-600 shadow-sm">
              {error}
            </div>
          ) : null}

          {!loading && !error && authorization ? (
            <>
              <div className="space-y-1 rounded-xl bg-white p-4 shadow-sm">
                <p className="text-xs font-bold uppercase tracking-wide text-brand">
                  Acceso
                </p>
                <h2 className="text-base font-semibold text-slate-900">
                  {authorization.guestName}
                </h2>
                <p className="text-sm text-slate-500">
                  {authorization.unitLabel}
                </p>
              </div>

              <div className="flex flex-col items-center gap-1 rounded-xl bg-white p-5 text-center shadow-sm">
                <Clock className="h-5.5 w-5.5 text-cyan-700" />
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  PIN válido hasta
                </p>
                <p className="text-xl font-bold text-slate-900">
                  {formatDayMonthYearTime(authorization.pinValidTo)}
                </p>
                <p className="text-xs text-slate-500">
                  Desde {formatDayMonthYearTime(authorization.pinValidFrom)}
                </p>
              </div>

              <div className="rounded-xl bg-white p-4 shadow-sm">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
                  Nivel de acceso
                </p>
                {revoked ? (
                  <>
                    <p className="mt-0.5 text-sm font-semibold text-red-700">
                      Acceso revocado
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Revocado
                      {revoked.by ? ` por ${revoked.by}` : ""} ·{" "}
                      {formatDayMonthYearTime(revoked.at)}
                    </p>
                  </>
                ) : (
                  <p className="mt-0.5 text-sm font-semibold text-slate-900">
                    {authorization.accessLevel
                      ? ACCESS_LEVEL_LABELS[authorization.accessLevel]
                      : ""}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setShowLevelModal(true)}
                  className={
                    revoked
                      ? "mt-3 w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-brand-hover"
                      : "mt-3 w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                  }
                >
                  {revoked ? "Restaurar acceso" : "Cambiar nivel de accesos"}
                </button>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-500">
                <Info className="h-4 w-4 shrink-0" />
                <span>
                  {revoked
                    ? "El huésped no puede abrir ninguna puerta. Al restaurar el acceso vuelve con el mismo PIN y no se le envía otro mensaje."
                    : "El PIN se genera al confirmarse la reserva y le llega al huésped por mensaje de Hostaway."}
                </span>
              </div>

              {actionError ? (
                <p className="text-xs font-medium text-red-600">
                  {actionError}
                </p>
              ) : null}

              {revoked ? null : (
                <button
                  type="button"
                  onClick={() => void handleRegenerate()}
                  disabled={actionLoading}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Renovar PIN
                </button>
              )}

              {actionMessage ? (
                <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>{actionMessage}</span>
                </div>
              ) : null}

              {showLevelModal ? (
                <AccessLevelSheet
                  current={authorization.accessLevel}
                  onConfirm={handleChangeAccessLevel}
                  onClose={() => setShowLevelModal(false)}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </AppLayout>
  );
};
