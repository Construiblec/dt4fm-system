import { AppLayout } from "@/app/layout/AppLayout";
import { LoginForm } from "@/modules/auth/components/LoginForm";
import logo from "@/shared/assets/images/construiblec-logo.png";

export const LoginPage = () => {
  return (
    <AppLayout className="bg-gradient-to-b from-slate-100 via-slate-50 to-white">
      <main className="min-h-screen px-4 py-8">
        <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
          <section className="w-full max-w-sm rounded-[22px] border border-white/80 bg-white px-6 pb-5 pt-6 shadow-[0_20px_60px_rgba(15,23,42,0.10)]">
            <div className="mb-4 flex flex-col items-center text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-50 shadow-inner">
                <img
                  src={logo}
                  alt="Construiblec"
                  className="h-7 w-7 object-contain"
                />
              </div>

              <p className="mt-3.5 text-[10px] font-bold uppercase tracking-[0.34em] text-slate-400">
                CONSTRUIBLEC
              </p>
              <h1 className="mt-1 text-[25px] font-extrabold leading-tight tracking-tight text-slate-900">
                Bienvenido
              </h1>
              <p className="mt-1 text-[13px] text-slate-500">
                Ingresa con tu usuario o correo
              </p>
            </div>

            <LoginForm />

            <footer className="mt-4 text-center text-[10px] font-medium uppercase tracking-[0.16em] text-slate-400">
              &copy; 2026 CONSTRUIBLEC {"\u00b7"} TODOS LOS DERECHOS RESERVADOS
            </footer>
          </section>
        </div>
      </main>
    </AppLayout>
  );
};
