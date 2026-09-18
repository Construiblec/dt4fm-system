import { useEffect, useState } from "react";
import {
  ArrowDownToLine,
  Car,
  CircleAlert,
  CircleCheck,
  Clock,
  Loader2,
  Lock,
  TriangleAlert,
} from "lucide-react";
import { useVehicularGate } from "../hooks/useVehicularGate";
import {
  getGuestApiErrorMessage,
  type GuestPinState,
} from "../services/guestPortalService";
import { GuestCard, GuestSection } from "./GuestSection";

const RESET_AFTER_MS = 5_000;

type VehicularGateCardProps = {
  token: string;
  canOpen: boolean;
  pinState: GuestPinState;
  /** Del portal: hasta cuándo sigue arriba la barrera que abrió este huésped. */
  openUntil: string | null;
};

type Tone = "success" | "warning" | "danger";

const Notice = ({
  tone,
  icon: Icon,
  children,
}: {
  tone: Tone;
  icon: typeof CircleCheck;
  children: string;
}) => {
  const styles = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    danger: "border-red-200 bg-red-50 text-red-700",
  }[tone];

  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${styles}`}
    >
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <p className="text-sm">{children}</p>
    </div>
  );
};

const DisabledButton = ({ label, badge }: { label: string; badge: string }) => (
  <button
    type="button"
    disabled
    aria-disabled="true"
    className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-100 py-4 text-base font-semibold text-slate-400"
  >
    <Lock className="h-4 w-4" />
    {label}
    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
      {badge}
    </span>
  </button>
);

const secondsUntil = (iso: string | null, now: number) =>
  iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000)) : 0;

const NOTICES: Record<string, { tone: Tone; icon: typeof CircleCheck; text: string }> = {
  opened: { tone: "success", icon: CircleCheck, text: "Puerta abierta. Adelante." },
  closed: { tone: "success", icon: CircleCheck, text: "Puerta cerrada." },
  uncertain: {
    tone: "warning",
    icon: TriangleAlert,
    text: "No pudimos confirmar la orden. Revisa la barrera; si no se abrió, marca tu PIN en el teclado.",
  },
  failed: {
    tone: "danger",
    icon: CircleAlert,
    text: "La barrera no respondió en este momento. Marca tu PIN en el teclado.",
  },
};

export const VehicularGateCard = ({
  token,
  canOpen,
  pinState,
  openUntil: portalOpenUntil,
}: VehicularGateCardProps) => {
  const gate = useVehicularGate(token);
  const { reset, isSuccess, isError } = gate;
  const [now, setNow] = useState(() => Date.now());

  // El resultado recién llegado manda hasta que el portal se relee.
  const openUntil =
    gate.data?.outcome === "opened"
      ? gate.data.openUntil
      : gate.data?.outcome === "closed"
        ? null
        : portalOpenUntil;
  const remaining = secondsUntil(openUntil, now);

  // Cuenta regresiva hasta que la barrera baja sola.
  useEffect(() => {
    if (!openUntil) return;

    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [openUntil]);

  useEffect(() => {
    if (!isSuccess && !isError) return;

    const timer = window.setTimeout(reset, RESET_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [isSuccess, isError, reset]);

  const isOpen = canOpen && remaining > 0;
  const notice = gate.data ? NOTICES[gate.data.outcome] : null;

  return (
    <GuestSection icon={Car} title="Puerta vehicular">
      <GuestCard className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">
          {canOpen
            ? "Ábrela desde aquí sin bajarte del auto, o marca tu PIN en el teclado de la barrera."
            : "Tu PIN también abre la entrada vehicular: márcalo en el teclado de la barrera."}
        </p>

        {isOpen ? (
          <>
            <button
              type="button"
              onClick={() => gate.mutate("close")}
              disabled={gate.isPending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-4 text-base font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-70"
            >
              {gate.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Cerrando…
                </>
              ) : (
                <>
                  <ArrowDownToLine className="h-5 w-5" />
                  Cerrar puerta vehicular
                </>
              )}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              Se cierra sola en {remaining} s. Ciérrala antes si ya pasaste.
            </p>
          </>
        ) : canOpen ? (
          <button
            type="button"
            onClick={() => gate.mutate("open")}
            disabled={gate.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-4 text-base font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:opacity-70"
          >
            {gate.isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Abriendo…
              </>
            ) : (
              <>
                <Car className="h-5 w-5" />
                Abrir puerta vehicular
              </>
            )}
          </button>
        ) : pinState === "antes-del-checkin" ? (
          <DisabledButton label="Abrir puerta vehicular" badge="Desde tu check-in" />
        ) : pinState === "disponible" ? (
          <DisabledButton label="Abrir puerta vehicular" badge="Próximamente" />
        ) : null}

        {notice ? (
          <Notice tone={notice.tone} icon={notice.icon}>
            {notice.text}
          </Notice>
        ) : gate.isError ? (
          <Notice tone="danger" icon={CircleAlert}>
            {getGuestApiErrorMessage(
              gate.error,
              "No pudimos contactar con la barrera. Marca tu PIN en el teclado.",
            )}
          </Notice>
        ) : pinState === "antes-del-checkin" ? (
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            Podrás abrirla desde aquí cuando empiece tu acceso.
          </p>
        ) : null}
      </GuestCard>
    </GuestSection>
  );
};
