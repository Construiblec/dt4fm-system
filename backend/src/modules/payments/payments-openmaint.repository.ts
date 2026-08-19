import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';

export const OPENMAINT_PAYMENTS_CLASS = 'Pagos';
export const OPENMAINT_TENANTS_VIEW = 'TenantAlicuotaSummary';
export const OPENMAINT_TENANT_CLASS = 'Tenant';
export const OPENMAINT_CONFIG_EXPENSA_CLASS = 'ConfigExpensa';
export const LOOKUP_ESTADO_PENDIENTE = 3166839;
export const TIPO_EXPENSA = 'Expensas';

export interface TenantAlicuotaRaw {
  _id: number;
  Propietario: string;
  'Unidad Inmobiliaria': string;
  'Valor Expensa $': number;
}

export interface TenantAlicuota {
  propietarioId: number;
  propietarioNombre: string;
  unidadNombre: string;
  monto: number;
}

export interface ConfigExpensa {
  DiaEmision: number;
  DiaVencimiento: number;
  Tiempo: number;
}

/** Card de la clase Pagos tal como la devuelve openMAINT (atributos relevantes). */
export interface PagoCard {
  _id?: number;
  Description: string;
  Propietario: number;
  Periodo: string;
  Monto?: number;
}

interface TenantEmailRaw {
  _id: number;
  Email: string | null;
}

/**
 * Acceso a datos de openMAINT para el dominio de pagos.
 *
 * Responsabilidad única: hablar con openMAINT (login, lectura y escritura de
 * cards de Pagos/Tenant/ConfigExpensa). Tanto la generación de pagos como el
 * envío de recordatorios dependen SOLO de este repositorio, evitando duplicar
 * la lógica de sesión y de consultas que antes vivía en cada service.
 */
@Injectable()
export class PaymentsOpenmaintRepository {
  private readonly logger = new Logger(PaymentsOpenmaintRepository.name);

  constructor(
    private readonly openmaintClient: OpenmaintClient,
    private readonly openmaintAuthService: OpenmaintAuthService,
    private readonly configService: ConfigService,
  ) {}

  /** Inicia sesión de servicio en openMAINT y devuelve el sessionId. */
  async getSession(): Promise<string> {
    const username = this.configService.get<string>('OPENMAINT_USERNAME') ?? '';
    const password = this.configService.get<string>('OPENMAINT_PASSWORD') ?? '';
    const response = await this.openmaintAuthService.login(username, password);
    return response?.data?._id ?? '';
  }

  /** Lee la configuración de expensas (un único registro). */
  async getConfigExpensa(sessionId: string): Promise<ConfigExpensa | null> {
    try {
      const response = (await this.openmaintClient.get(
        `/classes/${OPENMAINT_CONFIG_EXPENSA_CLASS}/cards?limit=1`,
        sessionId,
      )) as { data?: ConfigExpensa[] };

      const record = response?.data?.[0];

      if (!record) {
        this.logger.warn('[PaymentsRepo] ConfigExpensa no tiene registros');
        return null;
      }

      this.logger.log(
        `[PaymentsRepo] ConfigExpensa -> DiaEmision:${record.DiaEmision} DiaVencimiento:${record.DiaVencimiento} Tiempo:${record.Tiempo}`,
      );

      return record;
    } catch (error) {
      this.logger.error(
        '[PaymentsRepo] Error al obtener ConfigExpensa:',
        (error as Error)?.message,
      );
      return null;
    }
  }

  /** Devuelve las unidades activas con su alícuota desde la vista resumen. */
  async getTenants(sessionId: string): Promise<TenantAlicuota[]> {
    try {
      const response = (await this.openmaintClient.get(
        `/views/${OPENMAINT_TENANTS_VIEW}/cards`,
        sessionId,
      )) as { data?: TenantAlicuotaRaw[] };

      const raw = response?.data ?? [];

      return raw.map((r) => ({
        propietarioId: r._id,
        propietarioNombre: r['Propietario'],
        unidadNombre: r['Unidad Inmobiliaria'],
        monto: r['Valor Expensa $'],
      }));
    } catch (error) {
      this.logger.error(
        '[PaymentsRepo] Error al obtener tenants:',
        (error as Error)?.message,
      );
      throw error;
    }
  }

  /**
   * Devuelve un mapa propietarioId -> email consultando la clase Tenant.
   * El _id de la vista TenantAlicuotaSummary corresponde al _id del Tenant,
   * por eso podemos cruzarlos directamente. Best-effort: ante un fallo
   * devuelve un mapa vacío (no se notifica, pero los pagos sí se generan).
   */
  async getTenantsEmailMap(sessionId: string): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    try {
      const response = (await this.openmaintClient.get(
        `/classes/${OPENMAINT_TENANT_CLASS}/cards?onlyGridAttrs=true&start=0&limit=9999`,
        sessionId,
      )) as { data?: TenantEmailRaw[] };

      for (const t of response?.data ?? []) {
        const email = t.Email?.trim();
        if (email) {
          map.set(t._id, email);
        }
      }
    } catch (error) {
      this.logger.warn(
        `[PaymentsRepo] No se pudieron obtener emails de Tenant: ${(error as Error).message}`,
      );
    }
    return map;
  }

  /** Pagos existentes de un período (para evitar duplicados en la generación). */
  async getPagosDelPeriodo(
    periodo: string,
    sessionId: string,
  ): Promise<PagoCard[]> {
    try {
      const cql = encodeURIComponent(`Periodo = "${periodo}"`);

      const response = (await this.openmaintClient.get(
        `/classes/${OPENMAINT_PAYMENTS_CLASS}/cards?cql=${cql}&limit=9999`,
        sessionId,
      )) as { data?: PagoCard[] };

      return response?.data ?? [];
    } catch (error) {
      this.logger.warn(
        `[PaymentsRepo] No se pudieron obtener pagos existentes: ${(error as Error)?.message}`,
      );
      return [];
    }
  }

  /**
   * Devuelve TODOS los pagos en estado pendiente, de cualquier período.
   * Se usa para armar los recordatorios consolidados por propietario.
   * Best-effort: ante un fallo devuelve lista vacía.
   */
  async getPendingPayments(sessionId: string): Promise<PagoCard[]> {
    try {
      // Se filtra con el parámetro `filter` (JSON), no con `cql`: esta versión
      // de OpenMAINT ACEPTA el cql pero lo ignora en silencio y devuelve todas
      // las cards, pagadas incluidas. Verificado contra la instancia: el cql
      // devolvía 4 cards (3 ya pagadas) donde el filter devuelve 1.
      const filter = {
        attribute: {
          simple: {
            attribute: 'Estado',
            operator: 'equal',
            value: LOOKUP_ESTADO_PENDIENTE,
          },
        },
      };

      const response = (await this.openmaintClient.get(
        `/classes/${OPENMAINT_PAYMENTS_CLASS}/cards?limit=9999&filter=${encodeURIComponent(
          JSON.stringify(filter),
        )}`,
        sessionId,
      )) as { data?: PagoCard[] };

      return response?.data ?? [];
    } catch (error) {
      this.logger.warn(
        `[PaymentsRepo] No se pudieron obtener pagos pendientes: ${(error as Error)?.message}`,
      );
      return [];
    }
  }

  /**
   * Crea una card de pago en openMAINT. Lanza si openMAINT responde
   * success:false para que el llamador contabilice el fallo.
   */
  async createPaymentCard(
    card: Record<string, unknown>,
    sessionId: string,
  ): Promise<number | undefined> {
    const response = (await this.openmaintClient.post(
      `/classes/${OPENMAINT_PAYMENTS_CLASS}/cards`,
      card,
      sessionId,
    )) as { success?: boolean; data?: { _id?: number } };

    if (!response?.success) {
      throw new Error(
        `openMAINT retornó success:false al crear pago "${String(card.Description)}"`,
      );
    }

    return response?.data?._id;
  }
}
