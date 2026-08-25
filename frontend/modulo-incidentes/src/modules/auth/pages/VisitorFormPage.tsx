import axios from "axios";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { toSession } from "@/modules/auth/hooks/useRoleSwitch";
import logo from "@/shared/assets/images/construiblec-logo.png";
import { login } from "@/services/api";
import { useSessionStore } from "@/store/sessionStore";

type VisitorFormValues = {
  fullName: string;
  phone: string;
  acceptTerms: boolean;
};

export const VisitorFormPage = () => {
  const navigate = useNavigate();
  const setSession = useSessionStore((state) => state.setSession);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<VisitorFormValues>({
    defaultValues: {
      fullName: "",
      phone: "",
      acceptTerms: false,
    },
  });

  const onSubmit = async ({ fullName, phone }: VisitorFormValues) => {
    try {
      setErrorMessage(null);

      localStorage.setItem("visitorName", fullName);
      localStorage.setItem("visitorPhone", phone);

      const response = await login("usuario.invitado", "Invitado2026.");

      // El invitado usa una cuenta compartida, pero la sesión se guarda igual
      // que cualquier otra para que el resto de la app la lea de un solo sitio.
      setSession(toSession(response));

      navigate("/report-incident");
    } catch (error) {
      localStorage.removeItem("visitorName");
      localStorage.removeItem("visitorPhone");

      if (axios.isAxiosError(error)) {
        const status = error.response?.status;

        if (status === 401 || status === 500) {
          setErrorMessage("No se pudo iniciar el acceso de visitante.");
          return;
        }
      }

      setErrorMessage("No se pudo iniciar el acceso de visitante.");
    }
  };

  return (
    <AppLayout className="bg-gradient-to-b from-slate-100 via-slate-50 to-white">
      <main className="min-h-screen px-4 py-8">
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
          <section className="w-full max-w-sm rounded-[28px] border border-white/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] sm:p-8">
            <button
              type="button"
              onClick={() => navigate("/login")}
              aria-label="Regresar"
              className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-700 transition hover:bg-slate-200"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>

            <div className="mb-8 flex flex-col items-center text-center">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-50 shadow-inner">
                <img
                  src={logo}
                  alt="Construiblec"
                  className="h-10 w-10 object-contain"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                  CONSTRUIBLEC
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  Completa la informaci{"\u00f3"}n para reportar tu novedad.
                </h1>
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              <div className="space-y-4">
                <div className="space-y-2">
                  <label
                    htmlFor="fullName"
                    className="text-sm font-medium text-slate-700"
                  >
                    Nombre completo
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-4 pr-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                    {...register("fullName", {
                      required: "El nombre es obligatorio.",
                    })}
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor="phone"
                    className="text-sm font-medium text-slate-700"
                  >
                    Tel{"\u00e9"}fono
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-4 pr-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                    {...register("phone", {
                      required: "El tel\u00e9fono es obligatorio.",
                    })}
                  />
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-brand focus:ring-brand/20"
                  {...register("acceptTerms", {
                    required: "Debe aceptar los t\u00e9rminos.",
                  })}
                />
                <span>Acepto el uso de mis datos para dar seguimiento.</span>
              </label>

              {formState.errors.fullName ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {formState.errors.fullName.message}
                </p>
              ) : null}

              {!formState.errors.fullName && formState.errors.phone ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {formState.errors.phone.message}
                </p>
              ) : null}

              {!formState.errors.fullName &&
              !formState.errors.phone &&
              formState.errors.acceptTerms ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {formState.errors.acceptTerms.message}
                </p>
              ) : null}

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
                {formState.isSubmitting ? "Ingresando..." : "Continuar"}
              </button>
            </form>
          </section>
        </div>
      </main>
    </AppLayout>
  );
};
