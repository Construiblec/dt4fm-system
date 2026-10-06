import { AlertCircle, WifiOff } from "lucide-react";
import {
  getGuestApiErrorMessage,
  isGuestLinkInvalid,
} from "../services/guestPortalService";
import { GuestBrandMark, GuestEyebrow } from "./GuestBrand";
import { GuestPageShell } from "./GuestPageShell";

type GuestStateScreenProps =
  | { variant: "missing" }
  | { variant: "error"; error: unknown; onRetry: () => void };

export const GuestStateScreen = (props: GuestStateScreenProps) => {
  const invalid =
    props.variant === "missing" || isGuestLinkInvalid(props.error);

  const message =
    props.variant === "missing"
      ? "Abre el enlace completo que te enviamos para entrar a tu portal."
      : getGuestApiErrorMessage(
          props.error,
          "No pudimos cargar tu portal. Revisa tu conexión e inténtalo de nuevo.",
        );

  return (
    <GuestPageShell width="narrow">
      <div className="flex items-center gap-3">
        <GuestBrandMark />
        <GuestEyebrow />
      </div>

      <div className="flex flex-col items-center gap-6 pt-12 text-center">
        <div
          className={`flex h-24 w-24 items-center justify-center rounded-full ${
            invalid ? "bg-red-50" : "bg-slate-100"
          }`}
        >
          {invalid ? (
            <AlertCircle className="h-12 w-12 text-red-500" />
          ) : (
            <WifiOff className="h-12 w-12 text-slate-500" />
          )}
        </div>
        <div className="max-w-sm space-y-2">
          <h1 className="text-2xl font-bold text-slate-900">
            {invalid ? "Este enlace ya no funciona" : "Algo salió mal"}
          </h1>
          <p className="text-sm text-slate-500 [text-wrap:pretty]">{message}</p>
        </div>
        {props.variant === "error" && !invalid ? (
          <button
            type="button"
            onClick={props.onRetry}
            className="rounded-xl bg-brand px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-brand-hover"
          >
            Reintentar
          </button>
        ) : null}
      </div>
    </GuestPageShell>
  );
};
