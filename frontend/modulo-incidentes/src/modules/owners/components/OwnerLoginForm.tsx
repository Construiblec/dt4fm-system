import axios from "axios";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { loginOwner } from "@/services/api";

type OwnerLoginValues = {
  username: string;
  password: string;
};

type Props = {
  onBack: () => void;
};

export const OwnerLoginForm = ({ onBack }: Props) => {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const { register, handleSubmit, formState } = useForm<OwnerLoginValues>({
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async ({ username, password }: OwnerLoginValues) => {
    try {
      setErrorMessage(null);

      const response = await loginOwner(username, password);

      localStorage.setItem("sessionId", response.sessionId);
      localStorage.setItem("username", response.username);
      localStorage.setItem("role", response.role);
      if (response.tenantId) {
        localStorage.setItem("tenantId", String(response.tenantId));
      }
      if (response.userId) {
        localStorage.setItem("userId", String(response.userId));
      }
      if (response.name) {
        localStorage.setItem("ownerName", response.name);
      }

      navigate("/owner/dashboard");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.status === 401) {
          setErrorMessage("Usuario o contrase\u00f1a incorrectos");
          return;
        }
      }
      setErrorMessage("Usuario o contrase\u00f1a incorrectos");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800"
      >
        <ChevronLeft className="h-4 w-4" />
        Otras opciones
      </button>

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="owner-username" className="text-sm font-medium text-slate-700">
            Usuario
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8" aria-hidden="true">
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 1 1 14 0" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <input
              id="owner-username"
              type="text"
              placeholder="Tu nombre de usuario"
              autoComplete="username"
              className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-11 pr-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
              {...register("username", { required: true })}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="owner-password" className="text-sm font-medium text-slate-700">
            {"Contrase\u00f1a"}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8" aria-hidden="true">
                <path d="M7 11V8a5 5 0 1 1 10 0v3m-11 0h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <input
              id="owner-password"
              type={showPassword ? "text" : "password"}
              placeholder={"Contrase\u00f1a"}
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-11 pr-12 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
              {...register("password", { required: true })}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8" aria-hidden="true">
                  <path d="m3 3 18 18M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c5 0 9.3 3.1 11 8-1 2.9-3.1 5.2-5.8 6.5M6.6 6.6C4.4 8 2.8 9.8 2 12c1.7 4.9 6 8 10 8 1 0 2-.2 3-.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8" aria-hidden="true">
                  <path d="M2 12s3.6-8 10-8 10 8 10 8-3.6 8-10 8S2 12 2 12Z" strokeLinecap="round" strokeLinejoin="round" />
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

      <button
        type="submit"
        disabled={formState.isSubmitting}
        className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {formState.isSubmitting ? "Ingresando..." : "Entrar"}
      </button>
    </form>
  );
};
