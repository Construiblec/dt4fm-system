import axios from "axios";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import {
  ChevronLeft,
  User,
  Lock,
  FileText,
  MessageSquare,
  ChevronRight,
  CheckCircle2,
  Eye,
  EyeOff,
  LogOut,
} from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { useLogout } from "@/modules/auth/hooks/useLogout";
import {
  getOwnerProfile,
  changeOwnerPassword,
  contactAdmin,
  type OwnerProfile,
} from "@/services/api";

type Section = "menu" | "password" | "policies" | "contact";

type PasswordValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

type ContactValues = {
  subject: string;
  message: string;
};

const POLICIES_TEXT = `POLÍTICAS DE USO Y PRIVACIDAD

1. Uso de la plataforma
Esta plataforma es de uso exclusivo para propietarios registrados en el sistema CONSTRUIBLEC. El acceso con credenciales de terceros está prohibido.

2. Protección de datos
La información personal almacenada en esta plataforma es tratada con confidencialidad y no será compartida con terceros sin su consentimiento explícito, salvo requerimiento legal.

3. Responsabilidades del propietario
El propietario es responsable de mantener la confidencialidad de sus credenciales de acceso. Cualquier actividad realizada con su cuenta es de su responsabilidad.

4. Pagos y expensas
Los pagos de expensas deben realizarse dentro de los plazos establecidos por la administración. Los comprobantes subidos a la plataforma deben ser documentos válidos.

5. Reservas de áreas comunales
El uso de áreas comunales está sujeto a disponibilidad y al cumplimiento de los pagos de expensas. El incumplimiento puede resultar en la cancelación de reservas.

6. Contacto con administración
Para consultas, reclamos o solicitudes, puede contactar a la administración a través de esta plataforma. Los tiempos de respuesta son de 1 a 3 días hábiles.

7. Modificaciones
CONSTRUIBLEC se reserva el derecho de modificar estas políticas con previo aviso a los propietarios registrados.`;

export const OwnerProfilePage = () => {
  const logout = useLogout();
  const userId = Number(localStorage.getItem("userId"));
  const tenantId = Number(localStorage.getItem("tenantId"));

  const [section, setSection] = useState<Section>("menu");
  const [profile, setProfile] = useState<OwnerProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [contactSuccess, setContactSuccess] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  const passwordForm = useForm<PasswordValues>({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const contactForm = useForm<ContactValues>({
    defaultValues: { subject: "", message: "" },
  });

  useEffect(() => {
    if (!userId) return;
    getOwnerProfile(userId)
      .then(setProfile)
      .catch(() => setProfile(null))
      .finally(() => setLoadingProfile(false));
  }, [userId]);

  const onPasswordSubmit = async ({
    currentPassword,
    newPassword,
    confirmPassword,
  }: PasswordValues) => {
    if (newPassword !== confirmPassword) {
      passwordForm.setError("confirmPassword", {
        message: "Las contraseñas no coinciden",
      });
      return;
    }

    try {
      setPasswordError(null);
      await changeOwnerPassword(userId, currentPassword, newPassword);
      setPasswordSuccess(true);
      passwordForm.reset();
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 400) {
          setPasswordError("La contraseña actual es incorrecta");
          return;
        }
      }
      setPasswordError("No se pudo cambiar la contraseñas. Intenta de nuevo.");
    }
  };

  const onContactSubmit = async ({ subject, message }: ContactValues) => {
    try {
      setContactError(null);
      await contactAdmin(tenantId, subject, message);
      setContactSuccess(true);
      contactForm.reset();
    } catch {
      setContactError("No se pudo enviar el mensaje. Intenta de nuevo.");
    }
  };

  const menuItems = [
    {
      key: "password" as Section,
      label: "Cambiar contraseña",
      description: "Actualiza tus credenciales de acceso",
      icon: Lock,
    },
    {
      key: "policies" as Section,
      label: "Políticas y privacidad",
      description: "Términos de uso y protección de datos",
      icon: FileText,
    },
    {
      key: "contact" as Section,
      label: "Contactar administración",
      description: "Env\u00eda un mensaje al equipo administrativo",
      icon: MessageSquare,
    },
  ];

  return (
    <AppLayout>
      <main className="min-h-screen bg-slate-50 px-4 py-6">
        {/* Volver al inicio vive ahora en la barra inferior. Dentro de una
            sección sí hace falta: la barra lleva al perfil, pero no de vuelta
            a su menú. */}
        {section !== "menu" ? (
          <div className="mb-6 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSection("menu")}
              className="flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-slate-800"
            >
              <ChevronLeft className="h-4 w-4" />
              Mi perfil
            </button>
          </div>
        ) : null}

        {/* ── Menú principal del perfil ── */}
        {section === "menu" ? (
          <>
            {/* Card del usuario */}
            <div className="mb-6 flex items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-5 shadow-sm">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand/10">
                <User className="h-7 w-7 text-brand" />
              </div>
              {loadingProfile ? (
                <div className="space-y-2">
                  <div className="h-4 w-36 animate-pulse rounded-lg bg-slate-200" />
                  <div className="h-3 w-24 animate-pulse rounded-lg bg-slate-200" />
                </div>
              ) : (
                <div>
                  <p className="font-semibold text-slate-900">
                    {profile?.name ?? "Propietario"}
                  </p>
                  <p className="text-sm text-slate-400">@{profile?.username}</p>
                  {profile?.email ? (
                    <p className="text-xs text-slate-400">{profile.email}</p>
                  ) : null}
                </div>
              )}
            </div>

            {/* Opciones */}
            <div className="space-y-3">
              {menuItems.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => {
                      setPasswordSuccess(false);
                      setPasswordError(null);
                      setContactSuccess(false);
                      setContactError(null);
                      setSection(item.key);
                    }}
                    className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:shadow-md active:scale-[0.99]"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100">
                      <Icon className="h-5 w-5 text-slate-600" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-semibold text-slate-900">
                        {item.label}
                      </p>
                      <p className="text-xs text-slate-400">
                        {item.description}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" />
                  </button>
                );
              })}

              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm transition hover:shadow-md active:scale-[0.99]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                  <LogOut className="h-5 w-5 text-red-600" />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-semibold text-red-600">
                    Cerrar sesión
                  </p>
                  <p className="text-xs text-slate-400">
                    Saldrás de tu cuenta en este dispositivo
                  </p>
                </div>
              </button>
            </div>
          </>
        ) : null}

        {/* ── Cambiar contraseña ── */}
        {section === "password" ? (
          <div>
            <h1 className="mb-6 text-xl font-bold text-slate-900">
              Cambiar contraseña
            </h1>

            {passwordSuccess ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <div>
                  <p className="font-semibold text-emerald-700">
                    Contraseña actualizada
                  </p>
                  <p className="text-sm text-emerald-600">
                    Tu contraseña fue cambiada correctamente.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPasswordSuccess(false);
                    setSection("menu");
                  }}
                  className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Volver al perfil
                </button>
              </div>
            ) : (
              <form
                onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}
                className="space-y-4"
              >
                {/* Contraseña actual */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Contraseña actual
                  </label>
                  <div className="relative">
                    <input
                      type={showCurrent ? "text" : "password"}
                      placeholder="Tu contraseña actual"
                      className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-4 pr-12 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                      {...passwordForm.register("currentPassword", {
                        required: true,
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrent(!showCurrent)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                    >
                      {showCurrent ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Nueva contraseña */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Nueva contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showNew ? "text" : "password"}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-4 pr-12 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                      {...passwordForm.register("newPassword", {
                        required: true,
                        minLength: {
                          value: 6,
                          message: "Mínimo 6 caracteres",
                        },
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew(!showNew)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                    >
                      {showNew ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {passwordForm.formState.errors.newPassword ? (
                    <p className="text-xs text-red-600">
                      {passwordForm.formState.errors.newPassword.message}
                    </p>
                  ) : null}
                </div>

                {/* Confirmar contraseña */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Confirmar nueva contraseña
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      placeholder="Repite la nueva contraseña"
                      className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-4 pr-12 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                      {...passwordForm.register("confirmPassword", {
                        required: true,
                      })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(!showConfirm)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition hover:text-slate-600"
                    >
                      {showConfirm ? (
                        <EyeOff className="h-5 w-5" />
                      ) : (
                        <Eye className="h-5 w-5" />
                      )}
                    </button>
                  </div>
                  {passwordForm.formState.errors.confirmPassword ? (
                    <p className="text-xs text-red-600">
                      {passwordForm.formState.errors.confirmPassword.message}
                    </p>
                  ) : null}
                </div>

                {passwordError ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {passwordError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={passwordForm.formState.isSubmitting}
                  className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {passwordForm.formState.isSubmitting
                    ? "Actualizando..."
                    : "Actualizar contraseñas"}
                </button>
              </form>
            )}
          </div>
        ) : null}

        {/* ── Políticas y privacidad ── */}
        {section === "policies" ? (
          <div>
            <h1 className="mb-6 text-xl font-bold text-slate-900">
              Políticas y privacidad
            </h1>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
              <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-slate-600">
                {POLICIES_TEXT}
              </pre>
            </div>
          </div>
        ) : null}

        {/* ── Contactar administración ── */}
        {section === "contact" ? (
          <div>
            <h1 className="mb-2 text-xl font-bold text-slate-900">
              Contactar administración
            </h1>
            <p className="mb-6 text-sm text-slate-500">
              Tu mensaje sera revisado por el equipo administrativo
            </p>

            {contactSuccess ? (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center">
                <CheckCircle2 className="h-12 w-12 text-emerald-500" />
                <div>
                  <p className="font-semibold text-emerald-700">
                    Mensaje enviado
                  </p>
                  <p className="text-sm text-emerald-600">
                    El administrador recibir\u00e1 tu mensaje y se pondr\u00e1
                    en contacto contigo.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setContactSuccess(false);
                    setSection("menu");
                  }}
                  className="rounded-xl bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-emerald-700"
                >
                  Volver al perfil
                </button>
              </div>
            ) : (
              <form
                onSubmit={contactForm.handleSubmit(onContactSubmit)}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Asunto
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Consulta sobre expensas"
                    className="w-full rounded-xl border border-slate-200 bg-white py-4 pl-4 pr-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                    {...contactForm.register("subject", { required: true })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">
                    Mensaje
                  </label>
                  <textarea
                    rows={5}
                    placeholder="Describe tu consulta o solicitud..."
                    className="w-full resize-none rounded-xl border border-slate-200 bg-white py-4 pl-4 pr-4 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20"
                    {...contactForm.register("message", { required: true })}
                  />
                </div>

                {contactError ? (
                  <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                    {contactError}
                  </p>
                ) : null}

                <button
                  type="submit"
                  disabled={contactForm.formState.isSubmitting}
                  className="w-full rounded-xl bg-brand py-4 text-center text-base font-semibold text-white shadow-md transition hover:bg-brand-hover focus:outline-none focus:ring-4 focus:ring-brand/20 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {contactForm.formState.isSubmitting
                    ? "Enviando..."
                    : "Enviar mensaje"}
                </button>
              </form>
            )}
          </div>
        ) : null}
      </main>
    </AppLayout>
  );
};
