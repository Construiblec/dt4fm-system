import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import logo from "@/shared/assets/images/logo.svg";
import { resetPassword } from "@/modules/auth/services/passwordRecoveryService";

type ResetPasswordValues = {
  newPassword: string;
  confirmPassword: string;
};

const MIN_PASSWORD_LENGTH = 8;

const FIELD_CLASSES =
  "w-full rounded-xl border border-slate-200 bg-white py-4 px-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20";

export const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [done, setDone] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { register, handleSubmit, getValues, formState } =
    useForm<ResetPasswordValues>({
      defaultValues: { newPassword: "", confirmPassword: "" },
    });

  const onSubmit = async ({ newPassword }: ResetPasswordValues) => {
    try {
      setErrorMessage(null);
      await resetPassword(token, newPassword);
      setDone(true);
    } catch (error) {
      // El backend explica si el enlace venció o ya se usó; se muestra tal cual.
      const message =
        axios.isAxiosError(error) &&
        typeof error.response?.data?.message === "string"
          ? error.response.data.message
          : "No se pudo actualizar la contraseña. Solicita un enlace nuevo.";

      setErrorMessage(message);
    }
  };

  const renderCard = (children: React.ReactNode) => (
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
                  Nueva contrase{"ñ"}a
                </h1>
              </div>
            </div>

            {children}
          </section>
        </div>
      </main>
    </AppLayout>
  );

  // Llegar aquí sin token solo pasa si se manipuló la URL o se copió mal.
  if (!token) {
    return renderCard(
      <div className="space-y-6">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          El enlace est{"á"} incompleto. Solicita uno nuevo desde
          {" ¿"}Olvidaste tu contrase{"ñ"}a?
        </p>
        <button
          type="button"
          onClick={() => navigate("/forgot-password")}
          className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover"
        >
          Solicitar enlace
        </button>
      </div>,
    );
  }

  if (done) {
    return renderCard(
      <div className="space-y-6">
        <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          <p className="text-sm leading-6 text-emerald-800">
            Tu contrase{"ñ"}a se actualiz{"ó"} correctamente. Ya puedes
            iniciar sesi{"ó"}n con ella.
          </p>
        </div>

        <button
          type="button"
          onClick={() => navigate("/login")}
          className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/20"
        >
          Iniciar sesi{"ó"}n
        </button>
      </div>,
    );
  }

  return renderCard(
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <label
          htmlFor="newPassword"
          className="text-sm font-medium text-slate-700"
        >
          Contrase{"ñ"}a nueva
        </label>
        <input
          id="newPassword"
          type="password"
          autoComplete="new-password"
          className={FIELD_CLASSES}
          {...register("newPassword", {
            required: "Escribe la contraseña nueva.",
            minLength: {
              value: MIN_PASSWORD_LENGTH,
              message: `Debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres.`,
            },
          })}
        />
      </div>

      <div className="space-y-2">
        <label
          htmlFor="confirmPassword"
          className="text-sm font-medium text-slate-700"
        >
          Repite la contrase{"ñ"}a
        </label>
        <input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          className={FIELD_CLASSES}
          {...register("confirmPassword", {
            required: "Repite la contraseña.",
            validate: (value) =>
              value === getValues("newPassword") ||
              "Las contraseñas no coinciden.",
          })}
        />
      </div>

      {formState.errors.newPassword || formState.errors.confirmPassword ? (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
        >
          {formState.errors.newPassword?.message ??
            formState.errors.confirmPassword?.message}
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
        {formState.isSubmitting ? "Guardando..." : "Guardar contraseña"}
      </button>
    </form>,
  );
};
