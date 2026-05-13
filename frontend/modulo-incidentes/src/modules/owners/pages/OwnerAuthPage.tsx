import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import logo from "@/shared/assets/images/construiblec-logo.png";
import { OwnerLoginForm } from "@/modules/owners/components/OwnerLoginForm";
import { OwnerRegisterFlow } from "@/modules/owners/components/OwnerRegisterFlow";

type OwnerMode = "select" | "login" | "register";

export const OwnerAuthPage = () => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<OwnerMode>("select");
  const [showRegisteredBanner, setShowRegisteredBanner] = useState(false);

  const handleRegisterSuccess = () => {
    // Al completar el registro, ir al login con banner de éxito
    setShowRegisteredBanner(true);
    setMode("login");
  };

  return (
    <AppLayout className="bg-gradient-to-b from-slate-100 via-slate-50 to-white">
      <main className="min-h-screen px-4 py-8">
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
          <section className="w-full max-w-sm rounded-[28px] border border-white/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] sm:p-8">
            {/* Botón volver al menú principal — siempre visible */}
            <button
              type="button"
              onClick={() => navigate("/login")}
              className="mb-4 flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
              Menú principal
            </button>

            {/* Header */}
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl bg-slate-50 shadow-inner">
                <img
                  src={logo}
                  alt="Construiblec"
                  className="h-10 w-10 object-contain"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-500">
                  CONSTRUIBLEC
                </p>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {mode === "select" ? "\u00c1rea de propietarios" : null}
                  {mode === "login" ? "Inicia sesi\u00f3n" : null}
                  {mode === "register" ? "Crea tu cuenta" : null}
                </h1>
                <p className="text-sm leading-5 text-slate-500">
                  {mode === "select"
                    ? "\u00bfYa tienes cuenta o necesitas registrarte?"
                    : null}
                  {mode === "login"
                    ? "Ingresa tus credenciales de propietario"
                    : null}
                  {mode === "register"
                    ? "Verifica tu identidad para continuar"
                    : null}
                </p>
              </div>
            </div>

            {/* Banner registro exitoso */}
            {showRegisteredBanner && mode === "login" ? (
              <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
                <p className="text-sm font-semibold text-emerald-700">
                  {"Cuenta creada exitosamente \u2713"}
                </p>
                <p className="text-xs text-emerald-600">
                  Ya puedes iniciar sesi\u00f3n con tus credenciales.
                </p>
              </div>
            ) : null}

            {/* Selector */}
            {mode === "select" ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/20"
                >
                  Iniciar sesion
                </button>
                <button
                  type="button"
                  onClick={() => setMode("register")}
                  className="w-full rounded-xl border border-brand py-4 text-center text-base font-semibold text-brand transition hover:bg-brand/5 focus:outline-none focus:ring-4 focus:ring-brand/20"
                >
                  Registrarme
                </button>
              </div>
            ) : null}

            {/* Login */}
            {mode === "login" ? (
              <OwnerLoginForm
                onBack={() => {
                  setShowRegisteredBanner(false);
                  setMode("select");
                }}
              />
            ) : null}

            {/* Registro */}
            {mode === "register" ? (
              <OwnerRegisterFlow onBack={handleRegisterSuccess} />
            ) : null}

            <footer className="mt-8 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
              &copy; 2026 CONSTRUIBLEC {"\u00b7"} TODOS LOS DERECHOS RESERVADOS
            </footer>
          </section>
        </div>
      </main>
    </AppLayout>
  );
};
