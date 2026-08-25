import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Building2,
  CreditCard,
  AlertCircle,
  CheckCircle2,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { clearSession } from "@/shared/auth/session";
import {
  getOwnerUnits,
  getOwnerPayments,
  type OwnerUnit,
  type OwnerPago,
} from "@/services/api";

export const OwnerDashboardPage = () => {
  const navigate = useNavigate();
  const ownerName =
    localStorage.getItem("ownerName") ??
    localStorage.getItem("username") ??
    "Propietario";
  const tenantId = Number(localStorage.getItem("tenantId"));

  const [units, setUnits] = useState<OwnerUnit[]>([]);
  const [pagos, setPagos] = useState<OwnerPago[]>([]);
  const [alDia, setAlDia] = useState<boolean>(true);
  const [totalPendiente, setTotalPendiente] = useState<number>(0);
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [loadingPayments, setLoadingPayments] = useState(true);

  useEffect(() => {
    if (!tenantId) return;

    getOwnerUnits(tenantId)
      .then(setUnits)
      .catch(() => setUnits([]))
      .finally(() => setLoadingUnits(false));

    getOwnerPayments(tenantId)
      .then((res) => {
        setPagos(res.pagos);
        setAlDia(res.alDia);
        setTotalPendiente(res.totalPendiente);
      })
      .catch(() => setPagos([]))
      .finally(() => setLoadingPayments(false));
  }, [tenantId]);

  const handleLogout = () => {
    clearSession();
    navigate("/login");
  };

  const pendientes = pagos.filter((p) => p.estadoCodigo === "Pendiente");
  const firstName = ownerName.split(" ")[0];

  return (
    <AppLayout>
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-400">
              CONSTRUIBLEC
            </p>
            <h1 className="text-xl font-bold text-slate-900">
              Hola, {firstName}
            </h1>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4" />
            Salir
          </button>
        </div>

        {/* Banner estado de pagos */}
        {!loadingPayments ? (
          <div
            className={`mb-6 flex items-center gap-3 rounded-2xl px-4 py-4 ${
              alDia
                ? "border border-emerald-200 bg-emerald-50"
                : "border border-red-200 bg-red-50"
            }`}
          >
            {alDia ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
            ) : (
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
            )}
            <div className="flex-1">
              <p
                className={`text-sm font-semibold ${
                  alDia ? "text-emerald-700" : "text-red-700"
                }`}
              >
                {alDia ? "Pagos al d\u00eda" : "Tienes pagos pendientes"}
              </p>
              <p
                className={`text-xs ${
                  alDia ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {alDia
                  ? "No tienes expensas pendientes por pagar."
                  : `Total pendiente: $${totalPendiente.toFixed(2)}`}
              </p>
            </div>
            {!alDia ? (
              <button
                type="button"
                onClick={() => navigate("/owner/payments")}
                className="shrink-0 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
              >
                Ver pagos
              </button>
            ) : null}
          </div>
        ) : (
          <div className="mb-6 h-16 animate-pulse rounded-2xl bg-slate-200" />
        )}

        {/* Los accesos rápidos se movieron a la barra inferior: ahí están
            disponibles desde cualquier pantalla, no solo al volver al inicio. */}

        {/* Sección: Mis unidades */}
        <section className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
              Mis unidades
            </h2>
          </div>

          {loadingUnits ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-24 animate-pulse rounded-2xl bg-slate-200"
                />
              ))}
            </div>
          ) : units.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center">
              <p className="text-sm text-slate-400">
                No se encontraron unidades.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {units.map((unit) => (
                <div
                  key={unit.nombre}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <p className="font-semibold text-slate-900">
                      {unit.nombre}
                    </p>
                    <span className="rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand">
                      ${unit.valorExpensa.toFixed(2)}/mes
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                      <p className="text-[10px] text-slate-400">Unidad</p>
                      <p className="text-sm font-semibold text-slate-700">
                        {unit.alicuotaUnidad}%
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                      <p className="text-[10px] text-slate-400">Parqueadero</p>
                      <p className="text-sm font-semibold text-slate-700">
                        {unit.alicuotaParqueadero}%
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2 text-center">
                      <p className="text-[10px] text-slate-400">Bodega</p>
                      <p className="text-sm font-semibold text-slate-700">
                        {unit.alicuotaBodega}%
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between rounded-xl bg-brand/5 px-3 py-2">
                    <p className="text-xs font-medium text-slate-500">
                      Alícuota total
                    </p>
                    <p className="text-sm font-bold text-brand">
                      {unit.alicuotaTotal}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Sección: Pagos pendientes — preview con link a página completa */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-slate-400" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
                Pagos pendientes
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate("/owner/payments")}
              className="flex items-center gap-0.5 text-xs font-medium text-brand transition hover:underline"
            >
              Ver todos
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {loadingPayments ? (
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="h-16 animate-pulse rounded-2xl bg-slate-200"
                />
              ))}
            </div>
          ) : pendientes.length === 0 ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-6 text-center">
              <p className="text-sm font-medium text-emerald-700">
                {"No tienes pagos pendientes \u2713"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Mostrar máximo 2 en el dashboard */}
              {pendientes.slice(0, 2).map((pago) => (
                <div
                  key={pago.id}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {pago.unidad}
                    </p>
                    <p className="text-xs text-slate-400">
                      {pago.periodo} &middot; {pago.tipo}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-red-600">
                      ${pago.monto.toFixed(2)}
                    </p>
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                      {pago.estado}
                    </span>
                  </div>
                </div>
              ))}

              {/* Si hay más de 2, mostrar indicador */}
              {pendientes.length > 2 ? (
                <button
                  type="button"
                  onClick={() => navigate("/owner/payments")}
                  className="w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-500 transition hover:border-brand hover:text-brand"
                >
                  {`+${pendientes.length - 2} pago${pendientes.length - 2 > 1 ? "s" : ""} m\u00e1s`}
                </button>
              ) : null}
            </div>
          )}
        </section>
      </main>
    </AppLayout>
  );
};
