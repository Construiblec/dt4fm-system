import axios from "axios";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { login } from "@/services/api";

type LoginFormValues = {
  usuario: string;
  password: string;
};

export const LoginForm = () => {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
      localStorage.setItem("employeeId", response.employeeId);
      localStorage.setItem("username", response.username);
      localStorage.setItem("role", response.role);

      setIsSuccess(true);
      navigate("/dashboard");
    } catch (error) {
      setIsSuccess(false);

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        if (status === 401 || status === 500) {
          setErrorMessage("Usuario o contrase\u00f1a incorrectos");
          return;
        }
      }

      setErrorMessage("Usuario o contrase\u00f1a incorrectos");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-4">
        <div className="space-y-2">
          <label
            htmlFor="usuario"
            className="text-sm font-medium text-slate-700"
          >
            Usuario
          </label>
          <input
            id="usuario"
            type="text"
            placeholder="nombre.apellido"
            autoComplete="username"
            className="w-full rounded-xl border border-slate-200 px-4 py-4 text-base text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-200"
            {...register("usuario")}
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="password"
            className="text-sm font-medium text-slate-700"
          >
            {"Contrase\u00f1a"}
          </label>

          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder={"Contrase\u00f1a"}
              autoComplete="current-password"
              className="w-full rounded-xl border border-slate-200 px-4 py-4 pr-12 text-base text-slate-900 outline-none transition focus:border-slate-400 focus:ring-4 focus:ring-slate-200"
              {...register("password")}
            />

            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 transition hover:text-slate-700"
            >
              {showPassword ? "ocultar " : " mostrar"}
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 text-sm">
        <a
          href="#"
          className="font-medium text-slate-600 transition hover:text-slate-900"
        >
          Contactar con Soporte
        </a>
      </div>

      {errorMessage ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {errorMessage}
        </p>
      ) : null}

      {isSuccess ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          Inicio de sesi{"\u00f3"}n exitoso. Redirigiendo...
        </p>
      ) : null}

      <button
        type="submit"
        disabled={formState.isSubmitting}
        className="w-full rounded-xl bg-brand px-4 py-4 text-base font-semibold text-white shadow-sm transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {formState.isSubmitting ? "Ingresando..." : "Entrar"}
      </button>
    </form>
  );
};
