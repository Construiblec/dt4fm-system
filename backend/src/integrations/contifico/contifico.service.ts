import {
  Injectable,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { describeError } from '../../common/logging/describe-error.util';
import { ContificoClient } from './contifico.client';
import {
  ContificoCreateDocumentoDto,
  ContificoDocumentoResponse,
} from './contifico.types';

@Injectable()
export class ContificoService {
  private readonly logger = new Logger(ContificoService.name);

  constructor(
    private readonly client: ContificoClient,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Con CONTIFICO_USE_MOCK=true no se sale a la red: cada documento que la API
   * acepta es una factura real, así que cualquier entorno que no sea
   * producción debe usarlo.
   */
  private useMock(): boolean {
    return this.configService.get<string>('CONTIFICO_USE_MOCK') === 'true';
  }

  /**
   * Crea una factura de cliente en Contifico.
   * Retorna el documento creado con su ID y número de documento.
   * Si CONTIFICO_USE_MOCK=true retorna un documento simulado.
   */
  async createDocumento(
    dto: ContificoCreateDocumentoDto,
  ): Promise<ContificoDocumentoResponse> {
    // El número de documento identifica la factura; el nombre del huésped
    // (`razon_social`) es un dato personal y no va al log.
    if (this.useMock()) {
      this.logger.warn(`[MOCK] Factura simulada ${dto.documento}`);
      // El prefijo MOCK- viaja hasta HostawayInvoice en openMAINT, donde
      // distingue a simple vista una factura simulada de una real.
      return {
        id: `MOCK-${randomUUID()}`,
        documento: `MOCK-${dto.documento}`,
        total: dto.total.toFixed(2),
        estado: dto.estado ?? 'P',
        fecha_emision: dto.fecha_emision,
        electronico: false,
      };
    }

    try {
      const response = await this.client.post<ContificoDocumentoResponse>(
        '/documento/',
        dto,
      );

      this.logger.log(
        `Factura creada: ${response.documento} (id ${response.id})`,
      );

      return response;
    } catch (error) {
      this.logger.error(
        `No se pudo crear la factura ${dto.documento} — ${describeError(error)}`,
      );

      throw new InternalServerErrorException(
        'No se pudo crear la factura en Contifico',
      );
    }
  }

  /**
   * Consulta un documento por su ID.
   */
  async getDocumento(id: string): Promise<ContificoDocumentoResponse> {
    if (this.useMock()) {
      this.logger.warn(`[MOCK] Documento simulado ${id}`);
      return {
        id,
        documento: 'MOCK',
        total: '0.00',
        estado: 'P',
        fecha_emision: '',
        electronico: false,
      };
    }

    return this.client.get<ContificoDocumentoResponse>(`/documento/${id}`);
  }
}
