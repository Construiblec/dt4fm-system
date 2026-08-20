import { Link } from "react-router-dom";
import { AppLayout } from "@/app/layout/AppLayout";
import { LoginForm } from "@/modules/auth/components/LoginForm";
import logo from "@/shared/assets/images/construiblec-logo.png";

export const LoginPage = () => {
  return (
    <AppLayout className="bg-gradient-to-b from-slate-100 via-slate-50 to-white">
      <main className="min-h-screen px-4 py-8">
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
          <section className="w-full max-w-sm rounded-[28px] border border-white/80 bg-white p-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)] sm:p-8">
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
                  Bienvenido
                </h1>
                <p className="text-sm leading-5 text-slate-500">
                  Selecciona tu perfil para continuar
                </p>
              </div>
            </div>

            <LoginForm />

            <div className="mt-5 text-center">
              <Link
                to="/forgot-password"
                className="text-sm font-medium text-brand transition hover:text-brand-hover"
              >
                {"¿"}Olvidaste tu contrase{"ñ"}a?
              </Link>
            </div>

            <footer className="mt-8 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
              &copy; 2026 CONSTRUIBLEC {"\u00b7"} TODOS LOS DERECHOS RESERVADOS
            </footer>
          </section>
        </div>
      </main>
    </AppLayout>
  );
};
