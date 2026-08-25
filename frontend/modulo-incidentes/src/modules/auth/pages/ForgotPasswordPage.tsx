import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, MailCheck } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import logo from "@/shared/assets/images/logo.svg";
import { requestPasswordReset } from "@/modules/auth/services/passwordRecoveryService";

type ForgotPasswordValues = {
  usernameOrEmail: string;
};

const FIELD_CLASSES =
  "w-full rounded-xl border border-slate-200 bg-white py-4 px-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20";

export const ForgotPasswordPage = () => {
  const navigate = useNavigate();
  const [sent, setSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<ForgotPasswordValues>({
    defaultValues: { usernameOrEmail: "" },
  });

  const onSubmit = async ({ usernameOrEmail }: ForgotPasswordValues) => {
    try {
      setErrorMessage(null);
      await requestPasswordReset(usernameOrEmail.trim());
      // El backend responde igual exista o no la cuenta; la pantalla también.
      setSent(true);
    } catch {
      setErrorMessage(
        "No se pudo procesar la solicitud. Intenta nuevamente en unos minutos.",
      );
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
                  className="h-14 w-14 object-contain"
                />
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                  CONSTRUIBLEC
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {sent ? "Revisa tu correo" : "Recuperar contraseña"}
                </h1>
              </div>
            </div>

            {sent ? (
              <div className="space-y-6">
                <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                  <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  <p className="text-sm leading-6 text-emerald-800">
                    Si la cuenta existe y tiene un correo registrado, te
                    enviamos un enlace para restablecer la contrase{"ñ"}a.
                    El enlace vence en 1 hora.
                  </p>
                </div>

                <p className="text-center text-xs text-slate-500">
                  {"¿"}No te lleg{"ó"}? Revisa la carpeta de spam o
                  contacta al administrador.
                </p>

                <button
                  type="button"
                  onClick={() => navigate("/login")}
                  className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/20"
                >
                  Volver al inicio
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
                <p className="text-sm leading-6 text-slate-600">
                  Escribe tu usuario o el correo registrado y te enviaremos un
                  enlace para crear una contrase{"ñ"}a nueva.
                </p>

                <div className="space-y-2">
                  <label
                    htmlFor="usernameOrEmail"
                    className="text-sm font-medium text-slate-700"
                  >
                    Usuario o correo
                  </label>
                  <input
                    id="usernameOrEmail"
                    type="text"
                    autoComplete="username"
                    placeholder="nombre.apellido"
                    className={FIELD_CLASSES}
                    aria-invalid={
                      Boolean(formState.errors.usernameOrEmail) || undefined
                    }
                    {...register("usernameOrEmail", {
                      required: "Escribe tu usuario o correo.",
                    })}
                  />
                </div>

                {formState.errors.usernameOrEmail ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                  >
                    {formState.errors.usernameOrEmail.message}
                  </p>
                ) : null}

                {errorMessage ? (
                  <p
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
                  >
                    {errorMessage}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={formState.isSubmitting}
                  className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {formState.isSubmitting
                    ? "Enviando..."
                    : "Enviar enlace"}
                </button>
              </form>
            )}
          </section>
        </div>
      </main>
    </AppLayout>
  );
};
