import { Mic, MicOff, Volume2 } from "lucide-react";
import type {
  VoiceFailure,
  VoicePhase,
} from "@/modules/incidentes/hooks/useVoiceChecklist";

type Props = {
  active: boolean;
  phase: VoicePhase;
  /** Lo que está diciendo ahora, para poder seguirlo con el ruido de fondo. */
  saying: string;
  lastHeard: string;
  /** La ventana de activación está abierta: el siguiente comando cuenta. */
  awake: boolean;
  /** Qué espera oír ahora, para no enseñar la fórmula equivocada. */
  waitingFor: "si-no" | "fin" | null;
  failure: VoiceFailure | null;
  onStart: () => void;
  onStop: () => void;
};

/**
 * El estado del asistente de voz, arriba del checklist.
 *
 * Que se vea lo que dice y lo que entendió no es adorno: en una unidad con el
 * agua abierta el operario a veces no oye el teléfono, y sin esto no tendría
 * forma de saber si lo escuchó bien o si se quedó esperando algo.
 *
 * Cuando la voz no está disponible, el checklist sigue funcionando exactamente
 * igual con el dedo. La voz nunca es el único camino.
 */
export const VoiceChecklistControl = ({
  active,
  phase,
  saying,
  lastHeard,
  awake,
  waitingFor,
  failure,
  onStart,
  onStop,
}: Props) => {
  if (failure === "sin-soporte") {
    return (
      <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        Este navegador no permite el asistente de voz. Puedes marcar el checklist
        con el dedo, como siempre.
      </p>
    );
  }

  if (failure === "sin-microfono") {
    return (
      <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <p className="text-sm text-amber-800">
          No se pudo usar el micrófono. Puedes marcar el checklist con el dedo, o
          dar permiso y volver a intentar.
        </p>
        <button
          type="button"
          onClick={onStart}
          className="mt-3 rounded-xl border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-900"
        >
          Intentar de nuevo
        </button>
      </div>
    );
  }

  return (
    <div
      className={`mb-4 rounded-2xl border p-4 transition ${
        active ? "border-cyan-200 bg-cyan-50" : "border-slate-200 bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {active ? (
            phase === "hablando" ? (
              <Volume2 className="mt-0.5 h-5 w-5 shrink-0 text-cyan-600" />
            ) : (
              <Mic className="mt-0.5 h-5 w-5 shrink-0 animate-pulse text-cyan-600" />
            )
          ) : (
            <MicOff className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
          )}

          <div className="min-w-0">
            <p
              className={`text-sm font-semibold ${
                active ? "text-cyan-900" : "text-slate-600"
              }`}
            >
              {!active
                ? "Asistente de voz apagado"
                : phase === "hablando"
                  ? "Escucha las instrucciones"
                  : phase === "listo"
                    ? "Checklist completo"
                    : awake
                      ? "Te escucho, dime"
                      : "Asistente en espera"}
            </p>

            {/* Lo que dice va en el idioma del operario, no en jerga de estado. */}
            {active && saying ? (
              <p className="mt-1 break-words text-sm italic leading-6 text-cyan-800">
                "{saying}"
              </p>
            ) : null}

            {active && !saying && lastHeard ? (
              <p className="mt-1 break-words text-xs text-cyan-700">
                Te entendí: "{lastHeard}"
              </p>
            ) : null}

            {/* La fórmula queda a la vista mientras haga falta: un operario con
                guantes y ruido no va a recordar una frase que oyó hace diez
                minutos, y sin ella diría "acabado" a secas sin que pase nada. */}
            {active && phase !== "hablando" && !awake && waitingFor === "fin" ? (
              <p className="mt-1 text-sm font-semibold text-cyan-900">
                Di: "asistente, acabado"
              </p>
            ) : null}

            {active && awake ? (
              <p className="mt-1 text-sm font-semibold text-cyan-900">
                Di "acabado" para dar por lista la actividad.
              </p>
            ) : null}

            {!active ? (
              <p className="mt-1 text-xs text-slate-500">
                Puedes seguir marcando el checklist con el dedo.
              </p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={active ? onStop : onStart}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs font-semibold transition ${
            active
              ? "border border-cyan-300 text-cyan-800 hover:bg-cyan-100"
              : "bg-cyan-600 text-white hover:bg-cyan-700"
          }`}
        >
          {active ? "Apagar" : "Encender"}
        </button>
      </div>
    </div>
  );
};
