import { AppLayout } from "@/app/layout/AppLayout";
import { LoginForm } from "@/modules/auth/components/LoginForm";
import logo from "@/shared/assets/images/construiblec-logo.png";

export const LoginPage = () => {
  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen px-4 py-8">
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
          <section className="w-full max-w-sm rounded-xl bg-white p-6 shadow-md sm:p-8">
            <div className="mb-8 flex flex-col items-center text-center">
              <div className="mb-4 flex items-center justify-center">
                <img
                  src={logo}
                  alt="Construiblec"
                  className="h-16 w-16 rounded-xl object-contain"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-500">
                  Construiblec
                </p>
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                  Bienvenido
                </h1>
                <p className="text-sm leading-6 text-slate-500">
                  Por favor ingresa tus credenciales para ingresar
                </p>
              </div>
            </div>

            <LoginForm />

            <footer className="mt-8 text-center text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
              &copy; 2026 CONSTRUIBLEC {"\u00b7"} TODOS LOS DERECHOS RESERVADOS
            </footer>
          </section>
        </div>
      </main>
    </AppLayout>
  );
};
