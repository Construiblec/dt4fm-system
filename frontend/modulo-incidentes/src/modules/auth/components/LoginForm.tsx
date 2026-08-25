import axios from "axios";
import { getHomeRoute, storeEmployeeId } from "@/shared/auth/session";
import { consumeReturnTo } from "@/shared/auth/returnTo";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { Briefcase, MapPin, Building2 } from "lucide-react";
import { VisitorInfoModal } from "@/modules/auth/components/VisitorInfoModal";
import { login } from "@/services/api";

type LoginFormValues = {
  usuario: string;
  password: string;
};

const userTypeOptions = [
  {
    value: "team",
    label: "Equipo",
    icon: Briefcase,
  },
  {
    value: "owner",
    label: "Residente",
    icon: Building2,
  },
  {
    value: "visitor",
    label: "Visitante",
    icon: MapPin,
  },
] as const;

export const LoginForm = () => {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [userType, setUserType] = useState<"team">("team");
  const [isVisitorModalOpen, setIsVisitorModalOpen] = useState(false);
  const { register, handleSubmit, formState } = useForm<LoginFormValues>({
    defaultValues: {
      usuario: "",
      password: "",
    },
  });

  const onSubmit = async ({ usuario, password }: LoginFormValues) => {
    try {
      setErrorMessage(null);
      setIsSuccess(false);

      const response = await login(usuario, password);

      localStorage.setItem("sessionId", response.sessionId);
      storeEmployeeId(response.employeeId);
      localStorage.setItem("username", response.username);
      localStorage.setItem("role", response.role);
      // El alta de la suscripción push lo usa para resolver el rol real.
      if (response.userId !== undefined && response.userId !== null) {
        localStorage.setItem("userId", String(response.userId));
      }
      if (response.cleaningEmployeeId !== undefined) {
        localStorage.setItem(
          "cleaningEmployeeId",
          String(response.cleaningEmployeeId),
        );
      }

      setIsSuccess(true);
      // Tras un 401 vuelve a donde iba; si no, al dashboard de su rol. Los
      // roles no contemplados caen en el de operario, como antes.
      navigate(
        consumeReturnTo(response.username) ?? getHomeRoute(response.role),
      );
    } catch (error) {
      setIsSuccess(false);

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        if (status === 401 || status === 500) {
          setErrorMessage("Usuario o contraseña incorrectos");
          return;
        }
      }

      setErrorMessage("Usuario o contraseña incorrectos");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid grid-cols-3 gap-2">
        {userTypeOptions.map((option) => {
          const Icon = option.icon;
          const isActive = userType === option.value;

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                if (option.value === "visitor") {
                  setIsVisitorModalOpen(true);
                  return;
                }

                if (option.value === "owner") {
                  navigate("/owner/auth");
                  return;
                }

                setUserType("team");
              }}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-4 text-sm font-semibold transition ${isActive
                ? "border-brand bg-brand/10 text-brand shadow-sm"
                : "border-slate-200 bg-white text-slate-500"
                }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full ${isActive ? "bg-brand/20" : "bg-slate-100"
                  }`}
              >
                <Icon
                  className={`h-5 w-5 ${isActive ? "text-brand" : "text-slate-500"
                    }`}
                />
              </div>
              <span className="text-xs">{option.label}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="usuario"
            className="text-sm font-medium text-slate-700"
          >
            Usuario
          </label>

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 stroke-current"
                fill="none"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path
                  d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 1 1 14 0"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>

            <input
              id="usuario"
              type="text"
              placeholder="nombre.apellido"
              autoComplete="username"
              className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-11 pr-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
              {...register("usuario")}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="password"
            className="text-sm font-medium text-slate-700"
          >
            {"Contraseña"}
          </label>

          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 stroke-current"
                fill="none"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <path
                  d="M7 11V8a5 5 0 1 1 10 0v3m-11 0h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>

            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder={"Contrase\u00f1a"}
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-11 pr-12 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
              {...register("password")}
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
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 stroke-current"
                  fill="none"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path
                    d="m3 3 18 18M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M9.9 4.2A10.9 10.9 0 0 1 12 4c5 0 9.3 3.1 11 8-1 2.9-3.1 5.2-5.8 6.5M6.6 6.6C4.4 8 2.8 9.8 2 12c1.7 4.9 6 8 10 8 1 0 2-.2 3-.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              ) : (
                <svg
                  viewBox="0 0 24 24"
                  className="h-5 w-5 stroke-current"
                  fill="none"
                  strokeWidth="1.8"
                  aria-hidden="true"
                >
                  <path
                    d="M2 12s3.6-8 10-8 10 8 10 8-3.6 8-10 8S2 12 2 12Z"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {isSuccess ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Inicio de sesión exitoso. Redirigiendo...
        </p>
      ) : null}

      <button
        type="submit"
        disabled={formState.isSubmitting}
        className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {formState.isSubmitting ? "Ingresando..." : "Entrar"}
      </button>

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
