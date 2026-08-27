import { Injectable } from '@nestjs/common';
import { OpenmaintClient } from './openmaint.client';

/**
 * Datos de sesión que devuelven `/sessions` (POST, PUT y GET). `role` es el
 * grupo activo y `availableRoles` **todos** los grupos de la cuenta; ambos son
 * Codes de openMAINT, no Descriptions.
 */
export type OpenmaintSession = {
  _id: string;
  username: string;
  userId: number;
  /** Nombre legible del usuario; `username` es el de acceso. */
  userDescription?: string | null;
  role?: string | null;
  availableRoles?: string[] | null;
  multigroup?: boolean;
};

export type OpenmaintSessionResponse = { data?: OpenmaintSession };

@Injectable()
export class OpenmaintAuthService {
  constructor(private readonly client: OpenmaintClient) {}

  /**
   * Autentica contra openMAINT. `role` es opcional: sin él CMDBuild emite la
   * sesión en el grupo por defecto del usuario; con él, directamente en el
   * grupo pedido (útil para entrar ya con el rol elegido en el selector).
   *
   * La respuesta trae `availableRoles` con **todos** los grupos de la cuenta,
   * así que la lista de roles no necesita ninguna llamada extra.
   */
  async login(
    username: string,
    password: string,
    role?: string,
  ): Promise<OpenmaintSessionResponse> {
    const body = { username, password, ...(role ? { role } : {}) };

    return (await this.client.post(
      '/sessions?scope=service&returnId=true',
      body,
    )) as OpenmaintSessionResponse;
  }

  /**
   * Cambia el grupo activo de una sesión ya emitida **sin re-autenticar**: el
   * `sessionId` se conserva y openMAINT le recalcula los privilegios reales.
   *
   * Esto es lo que hace que cambiar de rol en la app no sea cosmético. Si en su
   * lugar solo cambiáramos la etiqueta en el cliente, openMAINT seguiría
   * aplicando los permisos del grupo original y las vistas del rol nuevo
   * saldrían vacías o con 403.
   */
  async setSessionRole(
    sessionId: string,
    role: string,
  ): Promise<OpenmaintSessionResponse> {
    return (await this.client.put(
      `/sessions/${sessionId}`,
      { role },
      sessionId,
    )) as OpenmaintSessionResponse;
  }

  /**
   * Estado de una sesión viva: `username`, `userId`, `userDescription`, el rol
   * activo y `availableRoles`. Sirve para validar un cambio de rol contra los
   * grupos reales del usuario sin necesidad de sesión de servicio.
   */
  async getSession(sessionId: string): Promise<OpenmaintSessionResponse> {
    return (await this.client.get(
      `/sessions/${sessionId}`,
      sessionId,
    )) as OpenmaintSessionResponse;
  }
}
