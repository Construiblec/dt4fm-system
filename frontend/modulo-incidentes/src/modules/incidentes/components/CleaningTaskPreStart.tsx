import { useMemo } from "react";
import { Play, Clock, Mic } from "lucide-react";
import {
  formatMinutes,
  getChecklistTotalMinutes,
  parseCleaningChecklist,
} from "@/modules/incidentes/utils/cleaningChecklistUtils";

type Props = {
  activities: string[];
  /** Cambia el verbo: una tarea pausada se reanuda, no se inicia. */
  isPaused?: boolean;
  isStarting: boolean;
  onStart: () => void;
  /**
   * El aviso del modo manos libres. Arranca apagado a propósito: prometerle al
   * operario un asistente de voz que todavía no existe es peor que no decir
   * nada. Se enciende en el mismo cambio que traiga el asistente.
   */
  showVoiceNotice?: boolean;
};

/**
 * Lo que ve el operario ANTES de que el cronómetro empiece a correr.
 *
 * Hasta ahora, tocar "Iniciar" en la tarjeta arrancaba la tarea, marcaba el cero
 * del tiempo y navegaba de un solo golpe: nunca había un momento para mirar a
 * qué se enfrentaba. Acá se muestra el tamaño del trabajo —bloques y minutos— y
 * el arranque queda en sus manos.
 *
 * A propósito NO se despliegan las actividades de cada bloque: esto es un
 * vistazo previo, no el checklist. El detalle aparece al empezar a trabajar.
 */
export const CleaningTaskPreStart = ({
  activities,
  isPaused = false,
  isStarting,
  onStart,
  showVoiceNotice = false,
}: Props) => {
  const sections = useMemo(() => parseCleaningChecklist(activities), [activities]);
  const total = getChecklistTotalMinutes(sections);
  const couldNotRead = activities.length > 0 && sections.length === 0;

  // Sin contenedor propio: la página ya envuelve en `space-y-5 px-4 py-5`.
  return (
    <>
      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">
          {isPaused ? "Antes de reanudar" : "Antes de empezar"}
        </h2>

        {couldNotRead ? (
          <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            No se pudo leer el checklist de esta plantilla. Avisa a tu supervisor
            antes de iniciar la tarea.
          </p>
        ) : sections.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            Esta tarea no tiene checklist asignado.
          </p>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-500">
              {sections.length} {sections.length === 1 ? "bloque" : "bloques"}
              {total.minutes !== null ? (
                <>
                  {" · "}
                  {/* El `~` no es decorativo: avisa que al total le faltan
                      sumandos porque la plantilla no trae todos los minutos. */}
                  {total.isPartial ? "~" : ""}
                  {formatMinutes(total.minutes)} estimados
                </>
              ) : null}
            </p>

            <ul className="mt-4 space-y-2">
              {sections.map((section, index) => (
                <li
                  key={index}
                  className="flex items-start justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3"
                >
                  <span className="text-sm font-semibold leading-5 text-slate-800">
                    {section.title ?? "Actividades"}
                  </span>
                  {section.totalMinutes !== null ? (
                    <span className="shrink-0 text-xs font-medium text-slate-400">
                      {section.hasPartialMinutes ? "~" : ""}
                      {formatMinutes(section.totalMinutes)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
          <p className="text-sm leading-6 text-slate-600">
            {isPaused
              ? "Al reanudar, el tiempo vuelve a contarse desde donde quedó. El checklist conserva lo que ya marcaste."
              : "Pulsa «Iniciar tarea» al empezar. Desde ese momento se cuenta la duración, y hasta entonces no se puede finalizar."}
          </p>
        </div>

        {showVoiceNotice ? (
          <div className="mt-3 flex items-start gap-3 rounded-2xl border border-cyan-100 bg-cyan-50 p-4">
            <Mic className="mt-0.5 h-4 w-4 shrink-0 text-cyan-600" />
            <p className="text-sm leading-6 text-cyan-900">
              El asistente de voz se activa solo al iniciar. El teléfono va a
              pedirte permiso para usar el micrófono.
            </p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onStart}
          disabled={isStarting}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand px-4 py-4 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Play className="h-4 w-4" />
          {isStarting
            ? isPaused
              ? "Reanudando..."
              : "Iniciando..."
            : isPaused
              ? "Reanudar tarea"
              : "Iniciar tarea"}
        </button>
      </section>
    </>
  );
};
