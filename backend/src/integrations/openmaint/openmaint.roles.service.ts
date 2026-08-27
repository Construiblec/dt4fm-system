import { Injectable } from '@nestjs/common';
import { OpenmaintClient } from './openmaint.client';
import { OpenmaintServiceSession } from './openmaint.service-session';

type RoleCard = {
  /** El Code del grupo, que es lo que viaja en `role` y `availableRoles`. */
  name?: string;
  description?: string | null;
};

type RolesResponse = { data?: RoleCard[] };

/** Los grupos casi nunca cambian, pero un renombrado no debería exigir reinicio. */
const CACHE_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class OpenmaintRolesService {
  private cache: Record<string, string> | null = null;
  private cachedAt = 0;

  constructor(
    private readonly client: OpenmaintClient,
    private readonly serviceSession: OpenmaintServiceSession,
  ) {}

  /**
   * Code → Description de cada grupo, p. ej. `MaintOffice` → "TPM Equipment".
   *
   * Es lo que la interfaz muestra al usuario: `role` y `availableRoles` solo
   * traen el Code, que es un identificador interno y no siempre legible.
   *
   * Se lee con la cuenta de servicio porque `/roles` no es visible para
   * cualquier grupo, y se cachea: se consulta en cada login y en cada cambio de
   * rol, y la lista es prácticamente inmutable.
   */
  async getLabels(): Promise<Record<string, string>> {
    const fresh = Date.now() - this.cachedAt < CACHE_TTL_MS;

    if (this.cache && fresh) {
      return this.cache;
    }

    try {
      const sessionId = await this.serviceSession.get();
      const response = (await this.client.get(
        '/roles?limit=200',
        sessionId,
      )) as RolesResponse;

      const labels = (response?.data ?? []).reduce<Record<string, string>>(
        (map, role) => {
          if (role.name) {
            map[role.name] = role.description ?? role.name;
          }
          return map;
        },
        {},
      );

      this.cache = labels;
      this.cachedAt = Date.now();

      return labels;
    } catch {
      // Sin etiquetas la interfaz cae en su nombre por defecto; no es motivo
      // para tumbar un login que por lo demás fue correcto.
      return this.cache ?? {};
    }
  }
}
