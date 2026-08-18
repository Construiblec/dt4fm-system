import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';

/** Tarjeta de la clase `User`. Es la única lectura que expone `Password`. */
export type OpenmaintUserCard = {
  _id: number;
  Username: string;
  Email: string | null;
  Password: string | null;
  Active: boolean;
  Service: boolean;
};

/** Recurso `/users/{id}`, que sí trae los grupos y es el que acepta escritura. */
export type OpenmaintUserAccount = {
  _id: number;
  username: string;
  description: string | null;
  email: string | null;
  active: boolean;
  defaultUserGroup?: number | null;
  userGroups?: { _id: number; name: string }[];
};

type CardsResponse = { data?: OpenmaintUserCard[] };
type AccountResponse = { data?: OpenmaintUserAccount };

@Injectable()
export class PasswordRecoveryOpenmaintService {
  constructor(
    private readonly client: OpenmaintClient,
    private readonly authService: OpenmaintAuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Sesión de la cuenta de servicio. El flujo es público, así que no hay
   * sesión del usuario: las lecturas y la escritura de la contraseña van con
   * la cuenta administrativa del `.env`.
   */
  async getServiceSessionId(): Promise<string> {
    const username = this.configService.get<string>('OPENMAINT_USERNAME');
    const password = this.configService.get<string>('OPENMAINT_PASSWORD');

    const response = await this.authService.login(username!, password!);

    if (!response?.data?._id) {
      throw new InternalServerErrorException(
        'No se pudo obtener sesión de servicio con OpenMAINT',
      );
    }

    return response.data._id;
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
    const response = (await this.client.get(
      `/users/${userId}`,
      sessionId,
    )) as AccountResponse;

    return response?.data ?? null;
  }

  /**
   * Cambia la contraseña conservando el resto de la cuenta.
   *
   * `PUT /users/{id}` reemplaza el recurso completo, así que hay que reenviar
   * los grupos leídos del GET. Ojo: `changeOwnerPassword` en OwnersService
   * los hardcodea al grupo Propietarios; replicar eso aquí borraría los grupos
   * del personal, que suele pertenecer a varios.
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
