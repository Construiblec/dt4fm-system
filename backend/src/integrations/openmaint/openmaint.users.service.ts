import { Injectable } from '@nestjs/common';
import { OpenmaintClient } from './openmaint.client';

/**
 * Recurso `/users/{id}`. Es el único que trae los grupos de la cuenta y el
 * único que acepta escritura; `/classes/User/cards/{id}` expone `Password` pero
 * no los grupos.
 */
export type OpenmaintUserAccount = {
  _id: number;
  username: string;
  description: string | null;
  email: string | null;
  active: boolean;
  defaultUserGroup?: number | null;
  userGroups?: { _id: number; name: string }[];
};

type AccountResponse = { data?: OpenmaintUserAccount };

@Injectable()
export class OpenmaintUsersService {
  constructor(private readonly client: OpenmaintClient) {}

  /** Requiere sesión de servicio: `/users` no es legible con la del usuario. */
  async getAccount(
    userId: number,
    sessionId: string,
  ): Promise<OpenmaintUserAccount | null> {
    const response = (await this.client.get(
      `/users/${userId}`,
      sessionId,
    )) as AccountResponse;

    return response?.data ?? null;
  }

  /**
   * Cambia la contraseña conservando el resto de la cuenta.
   *
   * `PUT /users/{id}` **reemplaza el recurso completo**, así que hay que
   * reenviar los grupos tal y como venían del GET. Escribir aquí una lista fija
   * de grupos deja al usuario solo con esos: con cuentas multi-rol eso significa
   * perder todos los demás accesos al cambiar la contraseña.
   */
  async updatePassword(
    account: OpenmaintUserAccount,
    newPassword: string,
    sessionId: string,
  ): Promise<void> {
    await this.client.put(
      `/users/${account._id}`,
      {
        username: account.username,
        description: account.description ?? '',
        email: account.email ?? '',
        active: account.active,
        password: newPassword,
        defaultUserGroup: account.defaultUserGroup ?? null,
        userGroups: account.userGroups ?? [],
      },
      sessionId,
    );
  }
}
