import axios from "axios";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Upload,
  ChevronDown,
  ChevronUp,
  Clock,
  Wallet,
} from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import {
  getOwnerPayments,
  payPayments,
  uploadPaymentVoucher,
  type OwnerPago,
} from "@/services/api";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type PayMode = "none" | "single" | "all";
type Step = "list" | "method" | "voucher" | "success";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const today = () => new Date().toISOString().split("T")[0];

import { formatMonthYear } from "@/shared/utils/dateUtils";

const formatPeriod = (period: string) => {
  try {
    const [year, month] = period.split("-");
    const iso = new Date(Number(year), Number(month) - 1).toISOString();
    return formatMonthYear(iso);
  } catch {
    return period;
  }
};

const estadoBadge = (codigo: string) => {
  if (codigo === "Pendiente")
    return "rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600";
  if (codigo === "Pagado")
    return "rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700";
  return "rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600";
};

export const OwnerPaymentsPage = () => {
  const tenantId = Number(localStorage.getItem("tenantId"));
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Data
  const [pagos, setPagos] = useState<OwnerPago[]>([]);
  const [loading, setLoading] = useState(true);
  const [alDia, setAlDia] = useState(true);
  const [totalPendiente, setTotalPendiente] = useState(0);

  // UI
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [step, setStep] = useState<Step>("list");
  const [payMode, setPayMode] = useState<PayMode>("none");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [payMethod, setPayMethod] = useState<"transfer" | "card" | null>(null);
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState("");

  const fetchPayments = useCallback(() => {
    if (!tenantId) return;
    setLoading(true);
    getOwnerPayments(tenantId)
      .then((res) => {
        setPagos(res.pagos);
        setAlDia(res.alDia);
        setTotalPendiente(res.totalPendiente);
      })
      .catch(() => setPagos([]))
      .finally(() => setLoading(false));
  }, [tenantId]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const pendientes = pagos.filter((p) => p.estadoCodigo === "Pendiente");
  const pagados = pagos.filter((p) => p.estadoCodigo === "Pagado");

  const selectedTotal = pagos
    .filter((p) => selectedIds.includes(p.id))
    .reduce((acc, p) => acc + p.monto, 0);

  // ── Iniciar pago ──
  const startPay = (mode: PayMode, ids: number[]) => {
    setPayMode(mode);
    setSelectedIds(ids);
    setPayMethod(null);
    setVoucherFile(null);
    setError(null);
    setStep("method");
  };

  // ── Confirmar pago ──
  const handleConfirmPay = async () => {
    if (!payMethod) return;
    setSubmitting(true);
    setError(null);

    try {
      await payPayments(tenantId, {
        paymentIds: selectedIds,
        method: payMethod,
        paymentDate: today(),
      });

      // Si subió comprobante, subirlo al primer pago
      if (payMethod === "transfer" && voucherFile && selectedIds[0]) {
        try {
          await uploadPaymentVoucher(selectedIds[0], voucherFile);
        } catch {
          // No bloqueamos el éxito del pago si falla el comprobante
        }
      }

      const monto = selectedTotal;
      setSuccessMessage(
        `Pago de $${monto.toFixed(2)} registrado correctamente.`,
      );
      setStep("success");
      fetchPayments();
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 400) {
        setError("Error al procesar el pago. Verifica los datos.");
      } else {
        setError("No se pudo registrar el pago. Intenta de nuevo.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  // ─── Render: list ─────────────────────────────────────────────────────────
  if (step === "list") {
    return (
      <AppLayout>
        <main className="min-h-screen bg-slate-50 px-4 py-6">
          {/* Volver al inicio vive ahora en la barra inferior. */}
          <h1 className="mb-1 text-xl font-bold text-slate-900">Mis pagos</h1>
          <p className="mb-5 text-sm text-slate-500">
            Gestiona tus expensas y revisa el historial de pagos.
          </p>

          {/* Banner estado general */}
          {!loading ? (
            <div
              className={`mb-5 flex items-center gap-3 rounded-2xl px-4 py-4 ${
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
                <p className={`text-sm font-semibold ${alDia ? "text-emerald-700" : "text-red-700"}`}>
                  {alDia ? "Todos los pagos al día" : "Tienes pagos pendientes"}
                </p>
                {!alDia ? (
                  <p className="text-xs text-red-600">
                    Total pendiente: ${totalPendiente.toFixed(2)}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Botón pagar todo */}
          {!loading && pendientes.length > 1 ? (
            <button
              type="button"
              onClick={() => startPay("all", pendientes.map((p) => p.id))}
              className="mb-5 flex w-full items-center justify-between rounded-2xl bg-brand px-4 py-4 shadow-md transition hover:bg-brand-hover"
            >
              <div className="flex items-center gap-3">
                <Wallet className="h-5 w-5 text-white" />
                <div className="text-left">
                  <p className="text-sm font-semibold text-white">
                    Pagar todo lo pendiente
                  </p>
                  <p className="text-xs text-white/80">
                    {pendientes.length} pagos · ${totalPendiente.toFixed(2)}
                  </p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-white" />
            </button>
          ) : null}

          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-200" />
              ))}
            </div>
          ) : (
            <>
              {/* ── Pendientes ── */}
              {pendientes.length > 0 ? (
                <section className="mb-6">
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Pendientes ({pendientes.length})
                  </p>
                  <div className="space-y-3">
                    {pendientes.map((pago) => (
                      <div
                        key={pago.id}
                        className="rounded-2xl border border-slate-200 bg-white shadow-sm"
                      >
                        {/* Header del pago */}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedId(
                              expandedId === pago.id ? null : pago.id,
                            )
                          }
                          className="flex w-full items-center justify-between px-4 py-4"
                        >
                          <div className="text-left">
                            <p className="text-sm font-semibold text-slate-900">
                              {pago.unidad}
                            </p>
                            <p className="text-xs text-slate-400">
                              {formatPeriod(pago.periodo)} · {pago.tipo}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <p className="text-sm font-bold text-red-600">
                                ${pago.monto.toFixed(2)}
                              </p>
                              <span className={estadoBadge(pago.estadoCodigo)}>
                                {pago.estado}
                              </span>
                            </div>
                            {expandedId === pago.id ? (
                              <ChevronUp className="h-4 w-4 text-slate-400" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-400" />
                            )}
                          </div>
                        </button>

                        {/* Expandido — botón pagar unidad */}
                        {expandedId === pago.id ? (
                          <div className="border-t border-slate-100 px-4 py-3">
                            <button
                              type="button"
                              onClick={() => startPay("single", [pago.id])}
                              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-3 text-sm font-semibold text-white transition hover:bg-brand-hover"
                            >
                              <CreditCard className="h-4 w-4" />
                              Pagar esta unidad — ${pago.monto.toFixed(2)}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {/* ── Historial pagados ── */}
              {pagados.length > 0 ? (
                <section>
                  <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Historial ({pagados.length})
                  </p>
                  <div className="space-y-2">
                    {pagados.map((pago) => (
                      <div
                        key={pago.id}
                        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                      >
                        <div>
                          <p className="text-sm font-medium text-slate-800">
                            {pago.unidad}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-slate-400">
                            <Clock className="h-3 w-3" />
                            <span>
                              {formatPeriod(pago.periodo)}
                              {pago.fechaPago
                                ? ` · pagado el ${pago.fechaPago}`
                                : ""}
                            </span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-slate-700">
                            ${pago.monto.toFixed(2)}
                          </p>
                          <span className={estadoBadge(pago.estadoCodigo)}>
                            {pago.estado}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              {pagos.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white py-10 text-center">
                  <p className="text-sm text-slate-400">
                    No se encontraron registros de pago.
                  </p>
                </div>
              ) : null}
            </>
          )}
        </main>
      </AppLayout>
    );
  }

  // ─── Render: method ───────────────────────────────────────────────────────
  if (step === "method") {
    const montoAPagar = selectedTotal;

    return (
      <AppLayout>
        <main className="min-h-screen bg-slate-50 px-4 py-6">
          <button
            type="button"
            onClick={() => setStep("list")}
            className="mb-6 flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver a pagos
          </button>

          <h1 className="mb-2 text-xl font-bold text-slate-900">
            Método de pago
          </h1>

          {/* Resumen */}
          <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <p className="text-xs text-slate-400">
              {payMode === "all"
                ? `${selectedIds.length} pagos seleccionados`
                : "1 pago seleccionado"}
            </p>
            <p className="text-2xl font-bold text-slate-900">
              ${montoAPagar.toFixed(2)}
            </p>
          </div>

          {/* Opciones */}
          <div className="space-y-3">
            {/* Transferencia */}
            <button
              type="button"
              onClick={() => setPayMethod(payMethod === "transfer" ? null : "transfer")}
              className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-4 transition ${
                payMethod === "transfer"
                  ? "border-brand bg-brand/5"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  payMethod === "transfer" ? "bg-brand/20" : "bg-slate-100"
                }`}
              >
                <Upload
                  className={`h-5 w-5 ${payMethod === "transfer" ? "text-brand" : "text-slate-500"}`}
                />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-slate-900">
                  Transferencia bancaria
                </p>
                <p className="text-xs text-slate-400">
                  Sube tu comprobante de transferencia
                </p>
              </div>
            </button>

            {/* Subir comprobante si se seleccionó transferencia */}
            {payMethod === "transfer" ? (
              <div className="ml-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,application/pdf"
                  className="hidden"
                  onChange={(e) => setVoucherFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-3 text-sm font-medium text-slate-600 transition hover:border-brand hover:text-brand"
                >
                  <Upload className="h-4 w-4" />
                  {voucherFile
                    ? voucherFile.name
                    : "Adjuntar comprobante (PDF o imagen)"}
                </button>
                {!voucherFile ? (
                  <p className="mt-1 text-center text-xs text-slate-400">
                    Opcional — puedes subir el comprobante después
                  </p>
                ) : null}
              </div>
            ) : null}

            {/* Pago con tarjeta — próximamente */}
            <button
              type="button"
              onClick={() => setPayMethod(payMethod === "card" ? null : "card")}
              className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-4 transition ${
                payMethod === "card"
                  ? "border-brand bg-brand/5"
                  : "border-slate-200 bg-white"
              }`}
            >
              <div
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                  payMethod === "card" ? "bg-brand/20" : "bg-slate-100"
                }`}
              >
                <CreditCard
                  className={`h-5 w-5 ${payMethod === "card" ? "text-brand" : "text-slate-500"}`}
                />
              </div>
              <div className="text-left flex-1">
                <p className="text-sm font-semibold text-slate-900">
                  Pagar con tarjeta
                </p>
                <p className="text-xs text-slate-400">Próximamente disponible</p>
              </div>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
                Pronto
              </span>
            </button>

            {payMethod === "card" ? (
              <div className="ml-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                <p className="text-sm text-amber-700">
                  La pasarela de pagos con tarjeta estará disponible
                  próximamente. Por ahora usa transferencia bancaria.
                </p>
              </div>
            ) : null}
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            disabled={!payMethod || payMethod === "card" || submitting}
            onClick={handleConfirmPay}
            className="mt-6 w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "Procesando..." : `Confirmar pago — $${montoAPagar.toFixed(2)}`}
          </button>
        </main>
      </AppLayout>
    );
  }

  // ─── Render: success ──────────────────────────────────────────────────────
  return (
    <AppLayout>
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        <div className="flex flex-col items-center gap-6 pt-10 text-center">
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-slate-900">
              {"Pago registrado \u2713"}
            </h2>
            <p className="text-sm text-slate-500">{successMessage}</p>
          </div>
          {voucherFile ? (
            <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              Comprobante adjuntado: {voucherFile.name}
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setStep("list");
              setPayMethod(null);
              setVoucherFile(null);
              setSelectedIds([]);
            }}
            className="w-full rounded-xl bg-brand py-4 text-base font-semibold text-white shadow-md transition hover:bg-brand-hover"
          >
            Ver mis pagos
          </button>
        </div>
      </main>
    </AppLayout>
  );
};
