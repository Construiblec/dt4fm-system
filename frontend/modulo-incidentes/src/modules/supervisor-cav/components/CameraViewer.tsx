import type { RefObject } from "react";
import { Cctv, CircleAlert, Loader2, Play, RefreshCw, X } from "lucide-react";
import type { LiveCameraState } from "@/modules/supervisor-cav/hooks/useLiveCamera";
import type { Camera } from "@/modules/supervisor-cav/types/Camera";
import type { LiveVideoFailure } from "@/modules/supervisor-cav/utils/liveVideoMessages";

type Props = {
  videoRef: RefObject<HTMLVideoElement | null>;
  state: LiveCameraState;
  camera: Camera | null;
  failure: LiveVideoFailure | null;
  remainingSeconds: number | null;
  onPlaying: () => void;
  onRetry: () => void;
  onRefresh: () => void;
  onClose: () => void;
};

const formatRemaining = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

const ActionButton = ({
  label,
  Icon,
  onClick,
}: {
  label: string;
  Icon: typeof Play;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="mt-3 flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-hover"
  >
    <Icon className="h-4 w-4" />
    {label}
  </button>
);

const Overlay = ({
  state,
  failure,
  onRetry,
  onRefresh,
}: Pick<Props, "state" | "failure" | "onRetry" | "onRefresh">) => {
  if (state === "live") return null;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 px-6 text-center text-sm text-slate-200">
      {state === "idle" ? (
        <>
          <Cctv className="mb-2 h-8 w-8 text-slate-500" />
          <p className="text-slate-400">Elige una cámara para verla en vivo</p>
        </>
      ) : state === "requesting" || state === "connecting" ? (
        <>
          <Loader2 className="mb-2 h-8 w-8 animate-spin text-slate-400" />
          <p>Conectando…</p>
        </>
      ) : state === "ended" ? (
        <>
          <p className="font-semibold">Sesión finalizada</p>
          <ActionButton label="Continuar" Icon={Play} onClick={onRetry} />
        </>
      ) : (
        <>
          <CircleAlert className="mb-2 h-8 w-8 text-red-400" />
          <p role="alert">{failure?.message ?? "Video no disponible."}</p>
          {failure?.action === "retry" ? (
            <ActionButton label="Reintentar" Icon={RefreshCw} onClick={onRetry} />
          ) : failure?.action === "refresh" ? (
            <ActionButton label="Actualizar lista" Icon={RefreshCw} onClick={onRefresh} />
          ) : null}
        </>
      )}
    </div>
  );
};

/** El `<video>` está siempre montado y visible: Chrome pausa el autoplay de uno oculto. */
export const CameraViewer = ({
  videoRef,
  state,
  camera,
  failure,
  remainingSeconds,
  onPlaying,
  onRetry,
  onRefresh,
  onClose,
}: Props) => (
  <article className="overflow-hidden rounded-xl bg-white shadow-sm">
    <div className="relative aspect-video bg-slate-900">
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        onPlaying={onPlaying}
        className="h-full w-full object-contain"
      />
      <Overlay
        state={state}
        failure={failure}
        onRetry={onRetry}
        onRefresh={onRefresh}
      />
      {state === "live" ? (
        <span className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-red-600 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
          <span className="h-1.5 w-1.5 rounded-full bg-white" />
          En vivo
          {remainingSeconds !== null ? ` · ${formatRemaining(remainingSeconds)}` : null}
        </span>
      ) : null}
    </div>

    {camera ? (
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {camera.name}
          </p>
          <p className="truncate text-xs text-slate-500">{camera.cameraId}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar cámara"
          className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
    ) : null}
  </article>
);
