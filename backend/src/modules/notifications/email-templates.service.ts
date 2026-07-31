import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

const DEFAULT_TEMPLATE_CLASS = 'EmailTemplate';

// ─── Tipos internos ───────────────────────────────────────────────────────────

export type EmailTemplate = {
  _id: number;
  Code: string;
  Description?: string;
  Subject: string;
  Body: string;
  Active?: boolean;
};

type SingleResponse = { data?: EmailTemplate };
type ListResponse = { data?: EmailTemplate[]; meta?: { total: number } };

/**
 * Servicio de gestión de plantillas de correo.
 *
 * Responsabilidad única: CRUD de cards de la clase EmailTemplate
 * en openMAINT. No conoce el motor de envío ni la lógica de destinatarios.
 */
@Injectable()
export class EmailTemplatesService {
  private readonly logger = new Logger(EmailTemplatesService.name);
  private readonly templateClass: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly openmaintAuthService: OpenmaintAuthService,
    private readonly openmaintClient: OpenmaintClient,
  ) {
    this.templateClass =
      this.configService.get<string>('OPENMAINT_TEMPLATE_CLASS') ??
      DEFAULT_TEMPLATE_CLASS;
  }

  // ─── Listar ───────────────────────────────────────────────────────────────

  async findAll(): Promise<{ data: EmailTemplate[]; total: number }> {
    const sessionId = await this.getAdminSessionId();

    try {
      const response = (await this.openmaintClient.get(
        `/classes/${this.templateClass}/cards?limit=200`,
        sessionId,
      )) as ListResponse;

      return {
        data: response.data ?? [],
        total: response.meta?.total ?? 0,
      };
    } catch (error) {
      this.logger.error('Error al listar plantillas en openMAINT', {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
      });
      throw new InternalServerErrorException(
        'No se pudieron obtener las plantillas',
      );
    }
  }

  // ─── Obtener una ──────────────────────────────────────────────────────────

  async findOne(id: string): Promise<EmailTemplate> {
    const sessionId = await this.getAdminSessionId();

    try {
      const response = (await this.openmaintClient.get(
        `/classes/${this.templateClass}/cards/${id}`,
        sessionId,
      )) as SingleResponse;

      if (!response.data) {
        throw new NotFoundException(`Plantilla ${id} no encontrada`);
      }

      return response.data;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error al obtener plantilla ${id}`, {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
      });
      throw new InternalServerErrorException('No se pudo obtener la plantilla');
    }
  }

  // ─── Crear ────────────────────────────────────────────────────────────────

  async create(dto: CreateEmailTemplateDto): Promise<EmailTemplate> {
    const sessionId = await this.getAdminSessionId();

    try {
      const response = (await this.openmaintClient.post(
        `/classes/${this.templateClass}/cards`,
        { ...dto, Active: dto.Active ?? true },
        sessionId,
      )) as SingleResponse;

      if (!response.data) {
        throw new InternalServerErrorException(
          'openMAINT no devolvió la plantilla creada',
        );
      }

      return response.data;
    } catch (error) {
      if (error instanceof InternalServerErrorException) throw error;
      this.logger.error('Error al crear plantilla en openMAINT', {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
      });
      throw new InternalServerErrorException('No se pudo crear la plantilla');
    }
  }

  // ─── Actualizar ───────────────────────────────────────────────────────────

  async update(
    id: string,
    dto: UpdateEmailTemplateDto,
  ): Promise<EmailTemplate> {
    const sessionId = await this.getAdminSessionId();

    // Verificar que existe antes de actualizar
    await this.findOne(id);

    try {
      const response = (await this.openmaintClient.put(
        `/classes/${this.templateClass}/cards/${id}`,
        dto,
        sessionId,
      )) as SingleResponse;

      if (!response.data) {
        throw new InternalServerErrorException(
          'openMAINT no devolvió la plantilla actualizada',
        );
      }

      return response.data;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }
      this.logger.error(`Error al actualizar plantilla ${id}`, {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
      });
      throw new InternalServerErrorException(
        'No se pudo actualizar la plantilla',
      );
    }
  }

  // ─── Eliminar ─────────────────────────────────────────────────────────────

  async remove(id: string): Promise<{ success: boolean }> {
    const sessionId = await this.getAdminSessionId();

    // Verificar que existe antes de eliminar
    await this.findOne(id);

    try {
      await this.openmaintClient.delete(
        `/classes/${this.templateClass}/cards/${id}`,
        sessionId,
      );

      return { success: true };
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error al eliminar plantilla ${id}`, {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
      });
      throw new InternalServerErrorException(
        'No se pudo eliminar la plantilla',
      );
    }
  }

  // ─── Helper de sesión ─────────────────────────────────────────────────────

  private async getAdminSessionId(): Promise<string> {
    const username = this.configService.get<string>('OPENMAINT_USERNAME');
    const password = this.configService.get<string>('OPENMAINT_PASSWORD');
    const response = await this.openmaintAuthService.login(
      username!,
      password!,
    );

    if (!response?.data?._id) {
      throw new InternalServerErrorException(
        'No se pudo obtener sesión de servicio con openMAINT',
      );
    }

    return response.data._id;
  }
}
