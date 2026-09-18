import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { SessionRoleService } from '../../integrations/openmaint/session-role.service';

/**
 * `SupervisorCAV` es el rol de la pantalla; `SuperUser` entra a todo. Ojo: el
 * grupo `SupervisorCAV` se creó en openMAINT después que esta pantalla, así que
 * si una cuenta no lo trae en `availableRoles`, es que aún no se le asignó.
 */
export const CAV_ROLES = ['SupervisorCAV', 'SuperUser'];

/**
 * La sesión llega en `Authorization` sin esquema —es lo que manda el frontend
 * de CAV— o en `x-session-token`, que es lo que usa el resto de este módulo.
 */
export const readSessionId = (
  authorization?: string,
  sessionToken?: string,
): string =>
  (sessionToken ?? authorization ?? '').replace(/^Bearer\s+/i, '').trim();

export const requireCavIdentity = async (
  sessionRoles: SessionRoleService,
  authorization: string | undefined,
  sessionToken: string | undefined,
): Promise<{ sessionId: string; username: string }> => {
  const sessionId = readSessionId(authorization, sessionToken);

  if (!sessionId) {
    throw new UnauthorizedException('Falta la sesión de openMAINT');
  }

  const { role, username } = await sessionRoles.resolveIdentity(sessionId);

  if (!role || !CAV_ROLES.includes(role)) {
    throw new ForbiddenException(
      'Se requiere rol de Supervisor CAV para gestionar accesos',
    );
  }

  return { sessionId, username };
};
