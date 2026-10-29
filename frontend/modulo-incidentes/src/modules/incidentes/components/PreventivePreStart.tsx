import { Play } from "lucide-react";
import type { PreventiveChecklistItem } from "@/modules/incidentes/types/PreventiveChecklist";

type Props = {
  items: PreventiveChecklistItem[];
  isStarting: boolean;
  onStart: () => void;
};

/**
 * Lo que ve el técnico de un preventivo en Asignación ANTES de iniciarlo.
 *
 * Hasta ahora abrirlo lo pasaba a Ejecución en el acto, aunque todavía no
 * hubiera llegado al sitio. Acá revisa el trabajo y el inicio queda en sus
 * manos, igual que en limpieza y en correctivo.
 *
 * A propósito solo se listan los nombres de las actividades: esto es un
 * vistazo previo, no la lista de operación. Los campos aparecen al iniciar.
 */
export const PreventivePreStart = ({ items, isStarting, onStart }: Props) => (
  // Sin contenedor propio: la página ya envuelve en `space-y-5 px-4 py-5`.
  <>
    <section className="rounded-3xl bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-900">
        Antes de empezar
      </h2>

      {items.length === 0 ? (
        <p className="mt-1 text-sm text-slate-500">
          Este mantenimiento no tiene lista de operación asignada.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-slate-500">
            {items.length} {items.length === 1 ? "actividad" : "actividades"} en
            la lista de operación
          </p>

          <ul className="mt-4 space-y-2">
            {items.map((item) => (
              <li
                key={item.taskDefId}
                className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold leading-5 text-slate-800"
              >
                {item.label}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>

    {/* Sin confirmación, igual que limpieza y correctivo */}
    <button
      type="button"
      onClick={onStart}
      disabled={isStarting}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Play className="h-4 w-4" aria-hidden />
      {isStarting ? "Iniciando..." : "Iniciar mantenimiento"}
    </button>
  </>
);
