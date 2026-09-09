import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock, Info } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import {
  getApiErrorMessage,
  getAuthorization,
  regeneratePin,
  sendPin,
} from "@/modules/supervisor-cav/services/authorizationsService";
import type { Authorization } from "@/modules/supervisor-cav/types/Authorization";
import { formatMediumDate, formatMediumDateTime } from "@/shared/utils/dateUtils";

export const AuthorizationDetailPage = () => {
  const navigate = useNavigate();
  const { id = "" } = useParams();

  const [authorization, setAuthorization] = useState<Authorization | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Cerrojo de acción: evita un doble tap mientras la petición sigue en vuelo.
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await getAuthorization(Number(id));
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
      const response = await regeneratePin(Number(id));
      setAuthorization(response.data);
    } catch (err) {
      setActionError(getApiErrorMessage(err, "No se pudo generar un nuevo PIN"));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSend = async () => {
    try {
      setActionLoading(true);
      setActionError(null);
      const response = await sendPin(Number(id));
      setAuthorization(response.data);
    } catch (err) {
      setActionError(getApiErrorMessage(err, "No se pudo enviar el PIN"));
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen bg-gray-100 px-4 py-4">
        <div className="mx-auto w-full max-w-sm space-y-5">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate("/supervisor-cav/autorizaciones")}
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
                  Válido hasta
                </p>
                <p className="text-xl font-bold text-slate-900">
                  {formatMediumDate(authorization.checkOut)}
                </p>
              </div>

              <div className="flex items-start gap-2 rounded-lg bg-slate-100 p-3 text-xs text-slate-500">
                <Info className="h-4 w-4 shrink-0" />
                <span>
                  El PIN se genera automáticamente al confirmarse la reserva y
                  no se muestra desde la app.
                </span>
              </div>

              {actionError ? (
                <p className="text-xs font-medium text-red-600">
                  {actionError}
                </p>
              ) : null}

              {authorization.pinStatus === "pending" ? (
                <>
                  <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>Nuevo PIN generado, todavía no se ha enviado.</span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={actionLoading}
                    className="w-full rounded-lg bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    Enviar PIN
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleRegenerate()}
                  disabled={actionLoading}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  Generar nuevo PIN
                </button>
              )}

              {authorization.pinStatus === "ready" && authorization.lastSentAt ? (
                <div className="flex items-center justify-center gap-1.5 text-xs font-medium text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>
                    PIN enviado el {formatMediumDateTime(authorization.lastSentAt)}
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </AppLayout>
  );
};
