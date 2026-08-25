import { useNavigate } from "react-router-dom";
import { Check, KeyRound, LogOut } from "lucide-react";
import { useLogout } from "@/modules/auth/hooks/useLogout";
import { useRoleSwitch } from "@/modules/auth/hooks/useRoleSwitch";
import { BottomSheet } from "@/shared/components/BottomSheet";
import { getRoleLabel, getSelectableRoles } from "@/shared/constants/rolePalette";
import { useSessionStore } from "@/store/sessionStore";

type RoleSwitchSheetProps = {
  open: boolean;
  onClose: () => void;
};

/**
 * Cambio de rol en caliente. Cambiar aquí reemite la sesión de openMAINT en el
 * grupo elegido, así que los permisos cambian de verdad y el dashboard nuevo
 * recibe los datos que le corresponden.
 */
export const RoleSwitchSheet = ({ open, onClose }: RoleSwitchSheetProps) => {
  const navigate = useNavigate();
  const logout = useLogout();
  const currentRole = useSessionStore((state) => state.role);
  const availableRoles = useSessionStore((state) => state.availableRoles);
  const roleLabels = useSessionStore((state) => state.roleLabels);
  const { changeRole, pendingRole, error } = useRoleSwitch();
  const roles = getSelectableRoles(availableRoles);

  const pick = async (code: string) => {
    if (code === currentRole) {
      onClose();
      return;
    }

    if (await changeRole(code)) {
      onClose();
    }
  };

  return (
    <BottomSheet open={open} title="Cambiar de rol" onClose={onClose}>
      <div className="px-3">
        {roles.map((role) => {
          const Icon = role.icon;
          const isActive = role.code === currentRole;

          return (
            <button
              key={role.code}
              type="button"
              onClick={() => void pick(role.code)}
              disabled={pendingRole !== null}
              className={`mb-1.5 flex w-full items-center gap-3 rounded-xl p-3 text-left transition disabled:opacity-60 ${
                isActive ? role.soft : "bg-white"
              }`}
            >
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${role.soft}`}
              >
                <Icon className={`h-5 w-5 ${role.text}`} />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-slate-900">
                  {getRoleLabel(role.code, roleLabels)}
                </span>
                <span className="block text-xs font-medium text-slate-400">
                  {pendingRole === role.code ? "Cambiando..." : role.desc}
                </span>
              </span>

              {isActive ? (
                <Check className={`h-5 w-5 shrink-0 ${role.text}`} />
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="mx-5 mt-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}

      <div className="mx-5 mt-2 h-px bg-slate-100" />

      <button
        type="button"
        onClick={() => {
          onClose();
          navigate("/cuenta");
        }}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left"
      >
        <KeyRound className="h-5 w-5 text-slate-500" />
        <span className="flex-1 text-sm font-semibold text-slate-900">
          Cambiar contraseña
        </span>
      </button>

      <div className="mx-5 h-px bg-slate-100" />

      <button
        type="button"
        onClick={logout}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left"
      >
        <LogOut className="h-5 w-5 text-red-600" />
        <span className="flex-1 text-sm font-semibold text-red-600">
          Cerrar sesión
        </span>
      </button>
    </BottomSheet>
  );
};
