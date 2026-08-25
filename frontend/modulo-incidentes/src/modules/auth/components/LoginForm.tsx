import { useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Home, Lock, User, UserRound } from "lucide-react";
import { VisitorInfoModal } from "@/modules/auth/components/VisitorInfoModal";
import { toSession } from "@/modules/auth/hooks/useRoleSwitch";
import { getHomeRoute } from "@/shared/auth/session";
import { getSelectableRoles } from "@/shared/constants/rolePalette";
import { login } from "@/services/api";
import { useSessionStore } from "@/store/sessionStore";

type LoginFormValues = {
  usuario: string;
  password: string;
};

// `text-base` no es decorativo: por debajo de 16px, Safari en iOS hace zoom
// automático al enfocar el campo. El aire se recorta con el padding, no con la
// tipografía.
const FIELD_CLASSES =
  "w-full rounded-xl border border-slate-200 bg-white py-3.5 pl-11 pr-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20";

/**
 * Acceso único para equipo y residentes.
 *
 * Antes había tres puertas: este formulario, `/owner/auth` y el flujo de
 * visitante, elegidas con un selector de tres botones que en realidad no
 * cambiaba el formulario sino que navegaba a otra pantalla. openMAINT autentica
 * a todos contra el mismo endpoint, así que el selector solo añadía un paso.
 */
export const LoginForm = () => {
  const navigate = useNavigate();
  const setSession = useSessionStore((state) => state.setSession);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [isVisitorModalOpen, setIsVisitorModalOpen] = useState(false);
  const { register, handleSubmit, formState } = useForm<LoginFormValues>({
    defaultValues: { usuario: "", password: "" },
  });

  const onSubmit = async ({ usuario, password }: LoginFormValues) => {
    try {
      setErrorMessage(null);

      const response = await login(usuario.trim(), password);
      setSession(toSession(response));

      // Con varias vistas disponibles se pregunta con cuál entrar; con una sola
      // el selector sobra y se va directo al dashboard que le toca.
      if (getSelectableRoles(response.availableRoles ?? []).length > 1) {
        navigate("/seleccionar-rol");
        return;
      }

      navigate(getHomeRoute(response.role));
    } catch {
      // El backend ya distingue credenciales de caída del servicio, pero al
      // usuario no le sirve de nada esa diferencia en esta pantalla.
      setErrorMessage("Usuario o contraseña incorrectos");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label
            htmlFor="usuario"
            className="block text-[13px] font-semibold text-slate-700"
          >
            Usuario
          </label>

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <User className="h-5 w-5" />
            </span>

            <input
              id="usuario"
              type="text"
              placeholder="nombre.apellido o correo"
              autoComplete="username"
              className={FIELD_CLASSES}
              {...register("usuario", { required: "Escribe tu usuario" })}
            />
          </div>

          {formState.errors.usuario ? (
            <p className="text-sm text-red-600">
              {formState.errors.usuario.message}
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="block text-[13px] font-semibold text-slate-700"
          >
            Contraseña
          </label>

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Lock className="h-5 w-5" />
            </span>

            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="Contraseña"
              autoComplete="current-password"
              className={`${FIELD_CLASSES} pr-12`}
              {...register("password", { required: "Escribe tu contraseña" })}
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
              aria-label={
                showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
              }
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>

          {formState.errors.password ? (
            <p className="text-sm text-red-600">
              {formState.errors.password.message}
            </p>
          ) : null}
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={formState.isSubmitting}
        className="w-full rounded-xl bg-brand py-3.5 text-center text-[15px] font-bold text-white shadow-md transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {formState.isSubmitting ? "Ingresando..." : "Entrar"}
      </button>

      <div className="text-center">
        <Link
          to="/forgot-password"
          className="text-[13px] font-semibold text-brand transition hover:text-brand-hover"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-slate-200" />
        <span className="text-[10px] font-bold tracking-[0.14em] text-slate-300">
          O
        </span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>

      <button
        type="button"
        onClick={() => setIsVisitorModalOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-100/70 py-3.5 text-[13.5px] font-semibold text-slate-600 transition hover:bg-slate-100"
      >
        <UserRound className="h-[18px] w-[18px] text-slate-500" />
        Continuar como invitado
      </button>

      {/* El equipo nunca se auto-registra: sus cuentas las crea openMAINT. */}
      <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 px-3.5 py-3">
        <Home className="h-[18px] w-[18px] shrink-0 text-brand" />

        <p className="flex-1 text-[12.5px] font-semibold leading-tight text-slate-600">
          ¿Eres residente y no tienes cuenta?
        </p>

        <button
          type="button"
          onClick={() => navigate("/owner/register")}
          className="whitespace-nowrap text-[12.5px] font-bold text-brand"
        >
          Regístrate
        </button>
      </div>

      <VisitorInfoModal
        open={isVisitorModalOpen}
        onClose={() => setIsVisitorModalOpen(false)}
        onAccept={() => {
          setIsVisitorModalOpen(false);
          navigate("/visitor-form");
        }}
      />
    </form>
  );
};
