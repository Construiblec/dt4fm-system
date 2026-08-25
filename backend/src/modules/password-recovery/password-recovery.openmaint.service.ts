import { Injectable } from '@nestjs/common';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { OpenmaintServiceSession } from '../../integrations/openmaint/openmaint.service-session';
import {
  OpenmaintUsersService,
  type OpenmaintUserAccount,
} from '../../integrations/openmaint/openmaint.users.service';

/** Tarjeta de la clase `User`. Es la única lectura que expone `Password`. */
export type OpenmaintUserCard = {
  _id: number;
  Username: string;
  Email: string | null;
  Password: string | null;
  Active: boolean;
  Service: boolean;
};

export type { OpenmaintUserAccount };

type CardsResponse = { data?: OpenmaintUserCard[] };

@Injectable()
export class PasswordRecoveryOpenmaintService {
  constructor(
    private readonly client: OpenmaintClient,
    private readonly serviceSession: OpenmaintServiceSession,
    private readonly users: OpenmaintUsersService,
  ) {}

  /**
   * Sesión de la cuenta de servicio. El flujo es público, así que no hay
   * sesión del usuario: las lecturas y la escritura de la contraseña van con
   * la cuenta administrativa del `.env`.
   */
  async getServiceSessionId(): Promise<string> {
    return this.serviceSession.get();
  }

  /** Busca por `Username` o `Email`; puede devolver más de una coincidencia. */
  async findUsers(
    usernameOrEmail: string,
    sessionId: string,
  ): Promise<OpenmaintUserCard[]> {
    const filter = {
      attribute: {
        or: [
          {
            simple: {
              attribute: 'Username',
              operator: 'equal',
              value: usernameOrEmail,
            },
          },
          {
            simple: {
              attribute: 'Email',
              operator: 'equal',
              value: usernameOrEmail,
            },
          },
        ],
      },
    };

    const response = (await this.client.get(
      `/classes/User/cards?limit=10&filter=${encodeURIComponent(JSON.stringify(filter))}`,
      sessionId,
    )) as CardsResponse;

    return response.data ?? [];
  }

  async getUserCard(
    userId: number,
    sessionId: string,
  ): Promise<OpenmaintUserCard | null> {
    const response = (await this.client.get(
      `/classes/User/cards/${userId}`,
      sessionId,
    )) as { data?: OpenmaintUserCard };

    return response?.data ?? null;
  }

  async getUserAccount(
    userId: number,
    sessionId: string,
  ): Promise<OpenmaintUserAccount | null> {
    return this.users.getAccount(userId, sessionId);
  }

  /** Conserva los grupos de la cuenta; ver `OpenmaintUsersService`. */
  async updatePassword(
    account: OpenmaintUserAccount,
    newPassword: string,
    sessionId: string,
  ): Promise<void> {
    return this.users.updatePassword(account, newPassword, sessionId);
  }
}
