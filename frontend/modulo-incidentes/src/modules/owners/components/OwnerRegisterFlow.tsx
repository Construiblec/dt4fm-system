import axios from "axios";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { ChevronLeft, CheckCircle2 } from "lucide-react";
import {
  verifyOwner,
  registerOwner,
  type VerifyOwnerResponse,
} from "@/services/api";

type Step = "verify" | "credentials" | "success";

type VerifyValues = {
  idNumber: string;
};

type CredentialsValues = {
  username: string;
  password: string;
  confirmPassword: string;
};

type Props = {
  onBack: () => void;
};

export const OwnerRegisterFlow = ({ onBack }: Props) => {
  const [step, setStep] = useState<Step>("verify");
  const [verifiedTenant, setVerifiedTenant] =
    useState<VerifyOwnerResponse | null>(null);
  const [registeredUsername, setRegisteredUsername] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const verifyForm = useForm<VerifyValues>({
    defaultValues: { idNumber: "" },
  });

  const credentialsForm = useForm<CredentialsValues>({
    defaultValues: { username: "", password: "", confirmPassword: "" },
  });

  const onVerifySubmit = async ({ idNumber }: VerifyValues) => {
    try {
      setErrorMessage(null);
      const tenant = await verifyOwner(idNumber);
      setVerifiedTenant(tenant);
      credentialsForm.setValue("username", tenant.suggestedUsername);
      setStep("credentials");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 400) {
          setErrorMessage(
            "No encontramos un propietario con esa c\u00e9dula.",
          );
          return;
        }
      }
      setErrorMessage("Ocurri\u00f3 un error al verificar tus datos. Intenta de nuevo.");
    }
  };

  const onCredentialsSubmit = async ({
    username,
    password,
    confirmPassword,
  }: CredentialsValues) => {
    if (password !== confirmPassword) {
      credentialsForm.setError("confirmPassword", {
        message: "Las contrase\u00f1as no coinciden",
      });
      return;
    }

    try {
      setErrorMessage(null);

      await registerOwner(
        verifyForm.getValues("idNumber"),
        username,
        password,
      );

      setRegisteredUsername(username);
      setStep("success");
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 409) {
          setErrorMessage("Ese nombre de usuario ya est\u00e1 en uso, elige otro.");
          return;
        }
      }
      setErrorMessage("No se pudo crear la cuenta. Intenta de nuevo m\u00e1s tarde.");
    }
  };

  // ─── Step: success ─────────────────────────────────────────────────────────
  if (step === "success") {
    return (
      <div className="flex flex-col items-center gap-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-10 w-10 text-emerald-500" />
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">
            {"Cuenta creada \u2713"}
          </h2>
          <p className="text-sm text-slate-500">
            Tu cuenta{" "}
            <span className="font-semibold text-slate-700">
              {registeredUsername}
            </span>{" "}
            fue creada exitosamente. Ya puedes iniciar sesión.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onBack()}
          className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/20"
        >
          Iniciar sesión
        </button>
      </div>
    );
  }

  // ─── Step: verify ──────────────────────────────────────────────────────────
  if (step === "verify") {
    return (
      <form onSubmit={verifyForm.handleSubmit(onVerifySubmit)} className="space-y-5">
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
            <label htmlFor="idNumber" className="text-sm font-medium text-slate-700">
              {"N\u00famero de c\u00e9dula"}
            </label>
            <input
              id="idNumber"
              type="text"
              inputMode="numeric"
              placeholder="Ej. 1712345678"
              className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-4 pr-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
              {...verifyForm.register("idNumber", { required: true })}
            />
          </div>
        </div>

        {errorMessage ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {errorMessage}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={verifyForm.formState.isSubmitting}
          className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {verifyForm.formState.isSubmitting ? "Verificando..." : "Verificar identidad"}
        </button>
      </form>
    );
  }

  // ─── Step: credentials ─────────────────────────────────────────────────────
  return (
    <form
      onSubmit={credentialsForm.handleSubmit(onCredentialsSubmit)}
      className="space-y-5"
    >
      <button
        type="button"
        onClick={() => {
          setStep("verify");
          setErrorMessage(null);
        }}
        className="flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800"
      >
        <ChevronLeft className="h-4 w-4" />
        Cambiar datos
      </button>

      {verifiedTenant ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <p className="text-sm font-semibold text-emerald-700">
            {"Identidad verificada \u2713"}
          </p>
          <p className="text-sm text-emerald-600">{verifiedTenant.name}</p>
        </div>
      ) : null}

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="reg-username" className="text-sm font-medium text-slate-700">
            Nombre de usuario
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8" aria-hidden="true">
                <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 1 1 14 0" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <input
              id="reg-username"
              type="text"
              readOnly
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-4 pl-11 pr-4 text-base text-slate-500 outline-none cursor-not-allowed"
              {...credentialsForm.register("username", { required: true })}
            />
          </div>
          <p className="text-xs text-slate-400">Usuario asignado automáticamente según tu nombre.</p>
        </div>

        <div className="space-y-2">
          <label htmlFor="reg-password" className="text-sm font-medium text-slate-700">
            {"Contrase\u00f1a"}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8" aria-hidden="true">
                <path d="M7 11V8a5 5 0 1 1 10 0v3m-11 0h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <input
              id="reg-password"
              type={showPassword ? "text" : "password"}
              placeholder={"M\u00ednimo 6 caracteres"}
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-11 pr-12 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
              {...credentialsForm.register("password", {
                required: true,
                minLength: { value: 6, message: "M\u00ednimo 6 caracteres" },
              })}
            />
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600">
              {showPassword ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8"><path d="m3 3 18 18M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c5 0 9.3 3.1 11 8-1 2.9-3.1 5.2-5.8 6.5M6.6 6.6C4.4 8 2.8 9.8 2 12c1.7 4.9 6 8 10 8 1 0 2-.2 3-.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8"><path d="M2 12s3.6-8 10-8 10 8 10 8-3.6 8-10 8S2 12 2 12Z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg>
              )}
            </button>
          </div>
          {credentialsForm.formState.errors.password ? (
            <p className="text-xs text-red-600">{credentialsForm.formState.errors.password.message}</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <label htmlFor="reg-confirm" className="text-sm font-medium text-slate-700">
            {"Confirmar contrase\u00f1a"}
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8" aria-hidden="true">
                <path d="M7 11V8a5 5 0 1 1 10 0v3m-11 0h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
            <input
              id="reg-confirm"
              type={showConfirm ? "text" : "password"}
              placeholder={"Repite tu contrase\u00f1a"}
              autoComplete="new-password"
              className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-11 pr-12 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
              {...credentialsForm.register("confirmPassword", { required: true })}
            />
            <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600">
              {showConfirm ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8"><path d="m3 3 18 18M10.6 10.6A2 2 0 0 0 12 14a2 2 0 0 0 1.4-.6" strokeLinecap="round" strokeLinejoin="round" /><path d="M9.9 4.2A10.9 10.9 0 0 1 12 4c5 0 9.3 3.1 11 8-1 2.9-3.1 5.2-5.8 6.5M6.6 6.6C4.4 8 2.8 9.8 2 12c1.7 4.9 6 8 10 8 1 0 2-.2 3-.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5 stroke-current" fill="none" strokeWidth="1.8"><path d="M2 12s3.6-8 10-8 10 8 10 8-3.6 8-10 8S2 12 2 12Z" strokeLinecap="round" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" /></svg>
              )}
            </button>
          </div>
          {credentialsForm.formState.errors.confirmPassword ? (
            <p className="text-xs text-red-600">{credentialsForm.formState.errors.confirmPassword.message}</p>
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
        disabled={credentialsForm.formState.isSubmitting}
        className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {credentialsForm.formState.isSubmitting ? "Creando cuenta..." : "Crear cuenta"}
      </button>
    </form>
  );
};
