import type { ChangeEventHandler } from "react";
import { Camera } from "lucide-react";

type TakePhotoButtonProps = {
  /** El mismo `onChange` que el selector de la pantalla: valida y sube igual. */
  onChange: ChangeEventHandler<HTMLInputElement>;
  disabled?: boolean;
  className?: string;
};

/**
 * «Tomar foto»: abre la cámara directamente.
 *
 * Los selectores de fotos aceptan varias imágenes (`multiple`) y a veces tipos
 * concretos en vez de `image/*`. Con eso, Chrome en Android abre solo la
 * galería, sin opción de cámara. `capture` la abre siempre, también en iPhone.
 * En el ordenador se ignora y sale el selector de archivos.
 */
export const TakePhotoButton = ({
  onChange,
  disabled = false,
  className = "",
}: TakePhotoButtonProps) => (
  <label
    className={`flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition ${
      disabled
        ? "cursor-not-allowed opacity-60"
        : "cursor-pointer hover:bg-slate-50"
    } ${className}`}
  >
    <Camera className="h-5 w-5" />
    Tomar foto
    <input
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={onChange}
      disabled={disabled}
    />
  </label>
);
