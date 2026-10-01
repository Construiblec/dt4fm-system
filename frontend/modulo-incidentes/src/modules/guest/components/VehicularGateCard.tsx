import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  type GateAction,
  type GateCommandResult,
  type GuestPinState,
} from "../services/guestPortalService";
import { GuestCard, GuestSection } from "./GuestSection";

const RESET_AFTER_MS = 5_000;
/** Mientras otro la usa, se relee el portal para devolver el botón cuando se libere. */
const BUSY_POLL_MS = 10_000;

type VehicularGateCardProps = {
  token: string;
  /** El edificio tiene apertura remota para esta estancia. */
  available: boolean;
  canOpen: boolean;
  pinState: GuestPinState;
  /** Del portal: fin de la ventana para cerrar la barrera que abrió este huésped. */
  openUntil: string | null;
  /** Del portal: fin del enfriamiento tras el último pulso, de quien sea. */
  cooldownUntil: string | null;
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

// La barrera no tiene sensor: ningún texto afirma que se abrió o se cerró.
const noticeFor = (result: GateCommandResult, action: GateAction | undefined) => {
  switch (result.outcome) {
    case "triggered":
      return {
        tone: "success" as const,
        icon: CircleCheck,
        text:
          action === "close"
            ? "Orden de cierre enviada a la barrera."
            : "Orden enviada a la barrera. Adelante.",
      };
    case "uncertain":
      return {
        tone: "warning" as const,
        icon: TriangleAlert,
        text: "No pudimos confirmar la orden. Revisa la barrera; si no se abrió, marca tu PIN en el teclado.",
      };
    case "failed":
      return {
        tone: "danger" as const,
        icon: CircleAlert,
        text: "La barrera no respondió en este momento. Marca tu PIN en el teclado.",
      };
  }
};

export const VehicularGateCard = ({
  token,
  available,
  canOpen,
  pinState,
  openUntil: portalOpenUntil,
  cooldownUntil: portalCooldownUntil,
}: VehicularGateCardProps) => {
  const gate = useVehicularGate(token);
  const queryClient = useQueryClient();
  const { reset, isSuccess, isError } = gate;
  const [now, setNow] = useState(() => Date.now());

  // El resultado recién llegado manda hasta que el portal se relee.
  const openUntil =
    gate.data?.outcome === "triggered"
      ? gate.variables === "open"
        ? gate.data.openUntil
        : null
      : portalOpenUntil;
  const remaining = secondsUntil(openUntil, now);
  const canClose = remaining > 0;
  const busy = available && !canOpen && !canClose;
  // Enfriamiento de la barrera: el más tardío entre el del pulso propio y el del portal.
  const cooldown = Math.max(
    secondsUntil(gate.cooldownUntil, now),
    secondsUntil(portalCooldownUntil, now),
  );
  const ticking = canClose || cooldown > 0;

  // Cuenta regresiva de la ventana de cierre y del enfriamiento.
  useEffect(() => {
    if (!ticking) return;

    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const timer = window.setInterval(tick, 1_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [ticking]);

  useEffect(() => {
    if (!busy) return;

    const timer = window.setInterval(
      () =>
        void queryClient.invalidateQueries({ queryKey: ["guest", "me", token] }),
      BUSY_POLL_MS,
    );
    return () => window.clearInterval(timer);
  }, [busy, queryClient, token]);

  useEffect(() => {
    if (!isSuccess && !isError) return;

    const timer = window.setTimeout(reset, RESET_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [isSuccess, isError, reset]);

  const notice = gate.data ? noticeFor(gate.data, gate.variables) : null;
  const waiting = gate.isPending ? (
    <>
      <Loader2 className="h-5 w-5 animate-spin" />
      Enviando…
    </>
  ) : cooldown > 0 ? (
    <>
      <Clock className="h-5 w-5" />
      Espera {cooldown} s
    </>
  ) : null;

  return (
    <GuestSection icon={Car} title="Puerta vehicular">
      <GuestCard className="flex flex-col gap-3">
        <p className="text-sm text-slate-600">
          {available
            ? "Ábrela desde aquí sin bajarte del auto, o marca tu PIN en el teclado de la barrera."
            : "Tu PIN también abre la entrada vehicular: márcalo en el teclado de la barrera."}
        </p>

        {canClose ? (
          <>
            <button
              type="button"
              onClick={() => gate.mutate("close")}
              disabled={waiting !== null}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-4 text-base font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {waiting ?? (
                <>
                  <ArrowDownToLine className="h-5 w-5" />
                  Cerrar puerta vehicular
                </>
              )}
            </button>
            <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-500">
              <Clock className="h-3.5 w-3.5" />
              Puedes cerrarla desde aquí durante {remaining} s. Si no, baja sola.
            </p>
          </>
        ) : canOpen ? (
          <button
            type="button"
            onClick={() => gate.mutate("open")}
            disabled={waiting !== null}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand py-4 text-base font-semibold text-white shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70"
          >
            {waiting ?? (
              <>
                <Car className="h-5 w-5" />
                Abrir puerta vehicular
              </>
            )}
          </button>
        ) : busy ? (
          <DisabledButton label="Abrir puerta vehicular" badge="En uso" />
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
        ) : busy ? (
          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <Clock className="h-3.5 w-3.5" />
            Alguien acaba de usar la barrera. Espera un momento o marca tu PIN.
          </p>
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
