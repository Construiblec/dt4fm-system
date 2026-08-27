import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, ChevronsUpDown } from "lucide-react";
import { RoleSwitchSheet } from "@/shared/components/RoleSwitchSheet";
import {
  getRoleLabel,
  getRoleView,
  getSelectableRoles,
} from "@/shared/constants/rolePalette";
import logo from "@/shared/assets/images/logo.svg";
import { formatEmployeeName } from "@/shared/utils/nameUtils";
import { useNotificationsStore } from "@/store/notificationsStore";
import { useSessionStore } from "@/store/sessionStore";

/**
 * Cabecera común de los dashboards de equipo. Antes estaba copiada literalmente
 * en los tres, con el saludo formateado de dos maneras distintas.
 *
 * Añade dos cosas del rediseño: la campana de avisos y, debajo, el chip que
 * identifica el rol activo y abre el cambio de rol. El botón de salir ya no
 * está aquí: vive en la pestaña Cuenta.
 */
export const AppHeader = () => {
  const navigate = useNavigate();
  const role = useSessionStore((state) => state.role);
  const username = useSessionStore((state) => state.username);
  // Suscrito al store, no leído con getState(): si los roles llegan o cambian
  // después del primer render, el chip tiene que enterarse.
  const availableRoles = useSessionStore((state) => state.availableRoles);
  const roleLabels = useSessionStore((state) => state.roleLabels);
  const [isRoleSheetOpen, setIsRoleSheetOpen] = useState(false);
  const pending = useNotificationsStore((state) => state.unread);
  const refreshUnread = useNotificationsStore((state) => state.refreshUnread);

  // La cabecera se monta en cada dashboard, asi que el contador se refresca al
  // volver a cualquiera de ellos sin necesidad de sondear.
  useEffect(() => {
    void refreshUnread();
  }, [refreshUnread]);

  const view = getRoleView(role);
  const canSwitch = getSelectableRoles(availableRoles).length > 1;
  // El nombre sale del `username`, que sigue la convención `nombre.apellido`.
  // No usar `name` (el `userDescription` de openMAINT): en las cuentas del
  // equipo ahí va el cargo — "Asistente BIM-FM" —, no el nombre de la persona.
  const greeting = formatEmployeeName(username);

  return (
    <>
      <header className="px-4 pb-2 pt-4">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt="Construiblec"
            className="h-12 w-12 rounded-xl bg-white object-contain p-1 shadow-sm"
          />

          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
              Construiblec
            </p>
            <p className="truncate text-sm font-semibold text-slate-900">
              Bienvenido, {greeting}
            </p>
          </div>

          <button
            type="button"
            onClick={() => navigate("/notificaciones")}
            aria-label="Notificaciones"
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white"
          >
            <Bell className="h-5 w-5 text-slate-700" />

            {pending > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full border-2 border-gray-100 bg-red-600 px-1 text-[10px] font-bold text-white">
                {pending}
              </span>
            ) : null}
          </button>
        </div>

        {/* Con un solo rol el chip no tendría nada que ofrecer: no se pinta. */}
        {canSwitch ? (
          <button
            type="button"
            onClick={() => setIsRoleSheetOpen(true)}
            className={`mt-3 inline-flex items-center gap-2 rounded-full py-1.5 pl-2.5 pr-3 ${view.soft}`}
          >
            <span className={`h-2 w-2 rounded-full ${view.dot}`} />
            <span className={`text-xs font-bold ${view.text}`}>
              {getRoleLabel(role, roleLabels)}
            </span>
            <ChevronsUpDown className={`h-4 w-4 ${view.text}`} />
          </button>
        ) : null}
      </header>

      <RoleSwitchSheet
        open={isRoleSheetOpen}
        onClose={() => setIsRoleSheetOpen(false)}
      />
    </>
  );
};
