import { useState } from "react";
import { useForm } from "react-hook-form";
import { ChevronRight, KeyRound, LogOut, Repeat2 } from "lucide-react";
import { AppLayout } from "@/app/layout/AppLayout";
import { useLogout } from "@/modules/auth/hooks/useLogout";
import { RoleSwitchSheet } from "@/shared/components/RoleSwitchSheet";
import {
  getRoleLabel,
  getRoleView,
  getSelectableRoles,
} from "@/shared/constants/rolePalette";
import { formatEmployeeName } from "@/shared/utils/nameUtils";
import { changePassword } from "@/services/api";
import { useSessionStore } from "@/store/sessionStore";
import axios from "axios";

type PasswordFormValues = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

const MIN_PASSWORD_LENGTH = 8;

const FIELD_CLASSES =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-base text-slate-900 outline-none transition focus:border-brand focus:ring-4 focus:ring-brand/20";

const initials = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

export const AccountPage = () => {
  const logout = useLogout();
  const session = useSessionStore();
  const [isRoleSheetOpen, setIsRoleSheetOpen] = useState(false);
  const [isPasswordOpen, setIsPasswordOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { register, handleSubmit, formState, reset, getValues } =
    useForm<PasswordFormValues>({
      defaultValues: {
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      },
    });

  const view = getRoleView(session.role);
  // Desde el `username` (`nombre.apellido`): `name` es el `userDescription` de
  // openMAINT, que en las cuentas del equipo lleva el cargo, no el nombre.
  const displayName = formatEmployeeName(session.username);

  const onSubmit = async (values: PasswordFormValues) => {
    setErrorMessage(null);
    setFeedback(null);

    try {
      await changePassword(
        session.sessionId,
        values.currentPassword,
        values.newPassword,
      );

      setFeedback("Contraseña actualizada correctamente");
      setIsPasswordOpen(false);
      reset();
    } catch (error) {
      // El 400 es el único caso que el usuario puede corregir por sí mismo.
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;

      setErrorMessage(
        status === 400
          ? "La contraseña actual es incorrecta"
          : "No se pudo actualizar la contraseña",
      );
    }
  };

  return (
    <AppLayout className="bg-gray-100">
      <main className="min-h-screen">
        <header className="px-4 pb-3 pt-5">
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Mi cuenta
          </h1>
        </header>

        <section className="space-y-3 px-4 pb-8">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div
              className={`flex h-12 w-12 items-center justify-center rounded-full text-base font-bold text-white ${view.solid}`}
            >
              {initials(session.username)}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-slate-900">
                {displayName}
              </p>
              <p className="truncate text-xs font-medium text-slate-500">
                {session.username} · {getRoleLabel(session.role, session.roleLabels)}
              </p>
            </div>
          </div>

          {feedback ? (
            <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {feedback}
            </p>
          ) : null}

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {getSelectableRoles(session.availableRoles).length > 1 ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsRoleSheetOpen(true)}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left"
                >
                  <Repeat2 className="h-5 w-5 text-slate-600" />
                  <span className="flex-1 text-sm font-semibold text-slate-900">
                    Cambiar de rol
                  </span>
                  <ChevronRight className="h-5 w-5 text-slate-300" />
                </button>

                <div className="mx-4 h-px bg-slate-100" />
              </>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setIsPasswordOpen(!isPasswordOpen);
                setErrorMessage(null);
              }}
              className="flex w-full items-center gap-3 px-4 py-4 text-left"
            >
              <KeyRound className="h-5 w-5 text-slate-600" />
              <span className="flex-1 text-sm font-semibold text-slate-900">
                Cambiar contraseña
              </span>
              <ChevronRight
                className={`h-5 w-5 text-slate-300 transition ${isPasswordOpen ? "rotate-90" : ""}`}
              />
            </button>

            {isPasswordOpen ? (
              <form
                onSubmit={handleSubmit(onSubmit)}
                className="space-y-3 border-t border-slate-100 bg-slate-50 p-4"
              >
                <input
                  type="password"
                  placeholder="Contraseña actual"
                  autoComplete="current-password"
                  className={FIELD_CLASSES}
                  {...register("currentPassword", { required: true })}
                />

                <input
                  type="password"
                  placeholder="Contraseña nueva"
                  autoComplete="new-password"
                  className={FIELD_CLASSES}
                  {...register("newPassword", {
                    required: true,
                    minLength: {
                      value: MIN_PASSWORD_LENGTH,
                      message: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres`,
                    },
                  })}
                />

                <input
                  type="password"
                  placeholder="Repite la contraseña nueva"
                  autoComplete="new-password"
                  className={FIELD_CLASSES}
                  {...register("confirmPassword", {
                    validate: (value) =>
                      value === getValues("newPassword") ||
                      "Las contraseñas no coinciden",
                  })}
                />

                {formState.errors.newPassword?.message ? (
                  <p className="text-sm text-red-600">
                    {formState.errors.newPassword.message}
                  </p>
                ) : null}

                {formState.errors.confirmPassword?.message ? (
                  <p className="text-sm text-red-600">
                    {formState.errors.confirmPassword.message}
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
                  className="w-full rounded-xl bg-brand py-3.5 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:opacity-70"
                >
                  {formState.isSubmitting ? "Guardando..." : "Guardar"}
                </button>
              </form>
            ) : null}

            <div className="mx-4 h-px bg-slate-100" />

            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center gap-3 px-4 py-4 text-left"
            >
              <LogOut className="h-5 w-5 text-red-600" />
              <span className="flex-1 text-sm font-semibold text-red-600">
                Cerrar sesión
              </span>
            </button>
          </div>
        </section>
      </main>

      <RoleSwitchSheet
        open={isRoleSheetOpen}
        onClose={() => setIsRoleSheetOpen(false)}
      />
    </AppLayout>
  );
};
