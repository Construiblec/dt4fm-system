import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintAuthService } from './openmaint.auth.service';

@Injectable()
export class OpenmaintServiceSession {
  constructor(
    private readonly authService: OpenmaintAuthService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Sesión de la cuenta administrativa del `.env`.
   *
   * Hace falta para lo que la sesión del propio usuario no puede leer ni
   * escribir: `/users/{id}` (grupos, descripción) y las búsquedas de `Tenant`
   * por nombre. Estaba implementada por triplicado en `owners.service.ts`,
   * `password-recovery.openmaint.service.ts` y `meeting-reminders.service.ts`.
   *
   * No cachea: cada llamada abre una sesión nueva, igual que antes. Añadir
   * caché aquí es seguro y beneficia a los tres consumidores a la vez, pero
   * requiere decidir la caducidad, así que se deja para cuando haga falta.
   */
  async get(): Promise<string> {
    const username = this.configService.get<string>('OPENMAINT_USERNAME') ?? '';
    const password = this.configService.get<string>('OPENMAINT_PASSWORD') ?? '';

    const response = await this.authService.login(username, password);

    if (!response?.data?._id) {
      throw new InternalServerErrorException(
        'No se pudo obtener sesión de servicio con OpenMAINT',
      );
    }

    return response.data._id;
  }
}
