import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ChevronLeft,
  MapPin,
  Clock,
  DollarSign,
  Upload,
  CreditCard,
  CheckCircle2,
  Calendar,
  AlertCircle,
} from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import {
  getCommonAreaById,
  createReservation,
  type CommonArea,
} from "@/services/api";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convierte fecha y hora locales al formato que espera OpenMAINT: yyyy-MM-ddTHH:mm:ss */
const toOpenMaintTimestamp = (date: string, time: string): string =>
  `${date}T${time}:00`;

import { formatDayMonthTime } from "@/shared/utils/dateUtils";

/** Formatea timestamp de OpenMAINT a texto legible */
const formatTimestamp = (ts: string | null): string => {
  if (!ts) return "—";
  return formatDayMonthTime(ts);
};

/** Calcula las horas entre dos timestamps */
const calcHours = (inicio: string, fin: string): number => {
  try {
    const diff = new Date(fin).getTime() - new Date(inicio).getTime();
    return Math.max(0, diff / (1000 * 60 * 60));
  } catch {
    return 0;
  }
};

// ─── Componente ───────────────────────────────────────────────────────────────

type Step = "detail" | "schedule" | "payment" | "success";

export const OwnerReservationDetailPage = () => {
  const { areaId } = useParams<{ areaId: string }>();
  const navigate = useNavigate();
  const tenantId = Number(localStorage.getItem("tenantId"));
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [area, setArea] = useState<CommonArea | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("detail");

  // Formulario de fecha/hora
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("10:00");
  const [notes, setNotes] = useState("");
  const [scheduleError, setScheduleError] = useState<string | null>(null);

  // Pago
  const [paymentMethod, setPaymentMethod] = useState<"voucher" | "card" | null>(null);
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Resultado
  const [reservationResult, setReservationResult] = useState<{
    fechaInicio: string;
    fechaFin: string;
    precio: number;
  } | null>(null);

  useEffect(() => {
    if (!areaId) return;
    getCommonAreaById(Number(areaId))
      .then(setArea)
      .catch(() => setArea(null))
      .finally(() => setLoading(false));
  }, [areaId]);

  // ── Mínimo: hoy ──
  const today = new Date().toISOString().split("T")[0];

  // ── Validar horario ──
  const validateSchedule = (): boolean => {
    setScheduleError(null);
    if (!date) {
      setScheduleError("Selecciona una fecha.");
      return false;
    }
    if (startTime >= endTime) {
      setScheduleError("La hora de fin debe ser mayor a la hora de inicio.");
      return false;
    }
    return true;
  };

  const horasReserva = date
    ? calcHours(
        toOpenMaintTimestamp(date, startTime),
        toOpenMaintTimestamp(date, endTime),
      )
    : 0;

  const precioTotal = area?.precio ? area.precio * horasReserva : 0;

  // ── Confirmar reserva ──
  const handleConfirm = async () => {
    if (!area || !tenantId) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const result = await createReservation(tenantId, {
        commonAreaId: String(area.id),
        fechaInicio: toOpenMaintTimestamp(date, startTime),
        fechaFin: toOpenMaintTimestamp(date, endTime),
        notes: notes || undefined,
      });

      setReservationResult({
        fechaInicio: result.fechaInicio,
        fechaFin: result.fechaFin,
        precio: result.precio,
      });
      setStep("success");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 409) {
          setSubmitError("El área ya está reservada. Elige otra fecha.");
          return;
        }
      }
      setSubmitError("No se pudo crear la reserva. Intenta de nuevo.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <main className="min-h-screen bg-slate-50 px-4 py-6">
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-200" />
            ))}
          </div>
        </main>
      </AppLayout>
    );
  }

  if (!area) {
    return (
      <AppLayout>
        <main className="min-h-screen bg-slate-50 px-4 py-6">
          <button
            type="button"
            onClick={() => navigate("/owner/reservations")}
            className="mb-6 flex items-center gap-1 text-sm font-medium text-slate-500"
          >
            <ChevronLeft className="h-4 w-4" />
            Volver
          </button>
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
            <p className="text-sm font-medium text-red-600">
              No se encontró el área comunal.
            </p>
          </div>
        </main>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <main className="min-h-screen bg-slate-50 px-4 py-6">

        {/* Header */}
        <button
          type="button"
          onClick={() =>
            step === "detail"
              ? navigate("/owner/reservations")
              : setStep(step === "payment" ? "schedule" : "detail")
          }
          className="mb-6 flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800"
        >
          <ChevronLeft className="h-4 w-4" />
          {step === "detail" ? "Áreas comunales" : step === "schedule" ? "Detalle" : "Horario"}
        </button>

        {/* ── Step: detail ── */}
        {step === "detail" ? (
          <>
            {/* Card principal del área */}
            <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-start justify-between gap-2">
                <h1 className="text-xl font-bold text-slate-900">{area.name}</h1>
                <span
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                    area.estado === "Libre"
                      ? "bg-emerald-100 text-emerald-700"
                      : area.estado === "Reservado"
                      ? "bg-red-100 text-red-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {area.estado}
                </span>
              </div>

              {/* Info del área */}
              <div className="space-y-2 text-sm text-slate-500">
                {area.edificio ? (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                    <span>{area.edificio}{area.piso ? ` · ${area.piso}` : ""}</span>
                  </div>
                ) : null}
                {area.areaNeta ? (
                  <div className="flex items-center gap-2">
                    <span className="h-4 w-4 shrink-0 text-center text-xs font-bold text-slate-400">
                      m²
                    </span>
                    <span>{area.areaNeta} m² de superficie</span>
                  </div>
                ) : null}
                {area.fechaReservaInicio ? (
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 shrink-0 text-slate-400" />
                    <span>
                      Reservado: {formatTimestamp(area.fechaReservaInicio)} —{" "}
                      {formatTimestamp(area.fechaReservaFin)}
                    </span>
                  </div>
                ) : null}
              </div>

              {/* Precio */}
              {area.precio ? (
                <div className="mt-4 flex items-center gap-3 rounded-xl bg-brand/5 px-4 py-3">
                  <DollarSign className="h-5 w-5 text-brand" />
                  <div>
                    <p className="text-sm font-semibold text-brand">
                      ${area.precio.toFixed(2)} / hora
                    </p>
                    <p className="text-xs text-slate-500">
                      Incluye reserva y garantía
                    </p>
                  </div>
                </div>
              ) : null}

              {area.notes ? (
                <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    Notas
                  </p>
                  <p className="mt-1 text-sm text-slate-600">{area.notes}</p>
                </div>
              ) : null}
            </div>

            {/* Condiciones */}
            <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-700">
                Condiciones de uso
              </p>
              <ul className="mt-1 space-y-1 text-xs text-amber-600">
                <li>• La reserva se cobra por hora completa.</li>
                <li>• La garantía se devuelve contactando al administrador.</li>
                <li>• No se permiten reservas con pagos de expensas pendientes.</li>
                <li>• El área debe dejarse en las mismas condiciones.</li>
              </ul>
            </div>

            {area.estado === "Reservado" ? (
              <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-4">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-500" />
                <p className="text-sm font-medium text-red-700">
                  Esta área no está disponible actualmente.
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setStep("schedule")}
                className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover"
              >
                Seleccionar fecha y hora
              </button>
            )}
          </>
        ) : null}

        {/* ── Step: schedule ── */}
        {step === "schedule" ? (
          <>
            <h1 className="mb-6 text-xl font-bold text-slate-900">
              Elige fecha y hora
            </h1>

            <div className="space-y-4">
              {/* Fecha */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  Fecha de reserva
                </label>
                <input
                  type="date"
                  min={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-4 px-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                />
              </div>

              {/* Hora inicio */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Clock className="h-4 w-4 text-slate-400" />
                  Hora de inicio
                </label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-4 px-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                />
              </div>

              {/* Hora fin */}
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Clock className="h-4 w-4 text-slate-400" />
                  Hora de fin
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-4 px-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                />
              </div>

              {/* Notas */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">
                  Notas (opcional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Describe el motivo de la reserva..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full resize-none rounded-xl border border-slate-200 bg-white py-4 px-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                />
              </div>
            </div>

            {/* Resumen de costo */}
            {date && horasReserva > 0 && area.precio ? (
              <div className="mt-5 rounded-2xl border border-brand/20 bg-brand/5 px-4 py-4">
                <p className="text-sm font-semibold text-slate-700">
                  Resumen de costo
                </p>
                <div className="mt-2 space-y-1 text-sm text-slate-600">
                  <div className="flex justify-between">
                    <span>Duración</span>
                    <span>{horasReserva.toFixed(1)} horas</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Precio por hora</span>
                    <span>${area.precio.toFixed(2)}</span>
                  </div>
                  <div className="mt-2 flex justify-between border-t border-slate-200 pt-2 font-semibold text-slate-900">
                    <span>Total</span>
                    <span>${precioTotal.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            ) : null}

            {scheduleError ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {scheduleError}
              </p>
            ) : null}

            <button
              type="button"
              onClick={() => {
                if (validateSchedule()) setStep("payment");
              }}
              className="mt-6 w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover"
            >
              Continuar al pago
            </button>
          </>
        ) : null}

        {/* ── Step: payment ── */}
        {step === "payment" ? (
          <>
            <h1 className="mb-2 text-xl font-bold text-slate-900">
              Método de pago
            </h1>
            <p className="mb-6 text-sm text-slate-500">
              {area.name} · {date} · {startTime} — {endTime}
            </p>

            {/* Monto */}
            {area.precio ? (
              <div className="mb-6 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Total a pagar</span>
                  <span className="text-xl font-bold text-slate-900">
                    ${precioTotal.toFixed(2)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Incluye garantía · Devolución contactando al administrador
                </p>
              </div>
            ) : null}

            {/* Opciones de pago */}
            <div className="mb-5 space-y-3">
              {/* Comprobante */}
              <button
                type="button"
                onClick={() =>
                  setPaymentMethod(
                    paymentMethod === "voucher" ? null : "voucher",
                  )
                }
                className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-4 transition ${
                  paymentMethod === "voucher"
                    ? "border-brand bg-brand/5"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    paymentMethod === "voucher" ? "bg-brand/20" : "bg-slate-100"
                  }`}
                >
                  <Upload
                    className={`h-5 w-5 ${
                      paymentMethod === "voucher" ? "text-brand" : "text-slate-500"
                    }`}
                  />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-900">
                    Subir comprobante
                  </p>
                  <p className="text-xs text-slate-400">
                    Sube tu comprobante de transferencia
                  </p>
                </div>
              </button>

              {/* Subir archivo si se seleccionó comprobante */}
              {paymentMethod === "voucher" ? (
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
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 py-4 text-sm font-medium text-slate-600 transition hover:border-brand hover:text-brand"
                  >
                    <Upload className="h-4 w-4" />
                    {voucherFile
                      ? voucherFile.name
                      : "Seleccionar archivo (PDF o imagen)"}
                  </button>
                </div>
              ) : null}

              {/* Pago con tarjeta — placeholder */}
              <button
                type="button"
                onClick={() =>
                  setPaymentMethod(paymentMethod === "card" ? null : "card")
                }
                className={`flex w-full items-center gap-4 rounded-2xl border px-4 py-4 transition ${
                  paymentMethod === "card"
                    ? "border-brand bg-brand/5"
                    : "border-slate-200 bg-white"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                    paymentMethod === "card" ? "bg-brand/20" : "bg-slate-100"
                  }`}
                >
                  <CreditCard
                    className={`h-5 w-5 ${
                      paymentMethod === "card" ? "text-brand" : "text-slate-500"
                    }`}
                  />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-slate-900">
                    Pagar con tarjeta
                  </p>
                  <p className="text-xs text-slate-400">
                    Próximamente disponible
                  </p>
                </div>
              </button>

              {paymentMethod === "card" ? (
                <div className="ml-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-sm text-amber-700">
                    La pasarela de pagos estará disponible próximamente. Por
                    ahora puedes subir un comprobante de transferencia.
                  </p>
                </div>
              ) : null}
            </div>

            {submitError ? (
              <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {submitError}
              </p>
            ) : null}

            <button
              type="button"
              disabled={
                !paymentMethod ||
                (paymentMethod === "card") ||
                submitting
              }
              onClick={handleConfirm}
              className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Procesando..." : "Confirmar reserva"}
            </button>

            <p className="mt-3 text-center text-xs text-slate-400">
              Para devolución de garantía contacta al administrador.
            </p>
          </>
        ) : null}

        {/* ── Step: success ── */}
        {step === "success" ? (
          <div className="flex flex-col items-center gap-6 pt-8 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-emerald-50">
              <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            </div>

            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-slate-900">
                {"Reserva confirmada \u2713"}
              </h2>
              <p className="text-sm text-slate-500">{area.name}</p>
            </div>

            {reservationResult ? (
              <div className="w-full rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Inicio</span>
                    <span className="font-medium text-slate-900">
                      {formatTimestamp(reservationResult.fechaInicio)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Fin</span>
                    <span className="font-medium text-slate-900">
                      {formatTimestamp(reservationResult.fechaFin)}
                    </span>
                  </div>
                  {reservationResult.precio > 0 ? (
                    <div className="flex justify-between border-t border-slate-100 pt-2">
                      <span className="font-semibold text-slate-700">Total</span>
                      <span className="font-bold text-brand">
                        ${(reservationResult.precio * horasReserva).toFixed(2)}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
              Para la devolución de la garantía contacta a la administración.
            </div>

            <button
              type="button"
              onClick={() => navigate("/owner/reservations")}
              className="w-full rounded-xl bg-brand py-4 text-base font-semibold text-white shadow-md transition hover:bg-brand-hover"
            >
              Ver áreas comunales
            </button>
          </div>
        ) : null}
      </main>
    </AppLayout>
  );
};
