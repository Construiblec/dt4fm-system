import { Car, Lock } from "lucide-react";
import { GuestCard, GuestSection } from "./GuestSection";

/**
 * Informativo por ahora: la VPS de accesos todavía no tiene un comando para abrir
 * puertas a distancia. El botón queda a la vista para que el huésped sepa que
 * llegará, pero deshabilitado.
 */
export const VehicularGateCard = () => (
  <GuestSection icon={Car} title="Puerta vehicular">
    <GuestCard className="flex flex-col gap-3">
      <p className="text-sm text-slate-600">
        Tu PIN también abre la entrada vehicular: márcalo en el teclado de la
        barrera.
      </p>
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-100 py-4 text-base font-semibold text-slate-400"
      >
        <Lock className="h-4 w-4" />
        Abrir puerta vehicular
        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
          Próximamente
        </span>
      </button>
      <p className="text-center text-xs text-slate-400">
        Pronto podrás abrirla desde aquí, sin bajarte del auto.
      </p>
    </GuestCard>
  </GuestSection>
);
