import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ContificoClient } from './contifico.client';
import {
  ContificoCreateDocumentoDto,
  ContificoDocumentoResponse,
} from './contifico.types';

@Injectable()
export class ContificoService {
  private readonly logger = new Logger(ContificoService.name);

  constructor(private readonly client: ContificoClient) {}

  /**
   * Crea una factura de cliente en Contifico.
   * Retorna el documento creado con su ID y número de documento.
   */
  async createDocumento(
    dto: ContificoCreateDocumentoDto,
  ): Promise<ContificoDocumentoResponse> {
    this.logger.log(
      `[Contifico] Creando documento para cliente: ${dto.cliente.razon_social}`,
    );

    try {
      const response = await this.client.post<ContificoDocumentoResponse>(
        '/documento/',
        dto,
      );

      this.logger.log(
        `[Contifico] Documento creado: ${response.documento} (id: ${response.id})`,
      );

      return response;
    } catch (error) {
      this.logger.error('[Contifico] Error al crear documento', {
        status: error?.response?.status,
        data: JSON.stringify(error?.response?.data),
        message: error?.message,
      });

      throw new InternalServerErrorException(
        'No se pudo crear la factura en Contifico',
      );
    }
  }

  /**
   * Consulta un documento por su ID.
   */
  async getDocumento(id: string): Promise<ContificoDocumentoResponse> {
    return this.client.get<ContificoDocumentoResponse>(`/documento/${id}`);
  }
}
