import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenmaintClient } from '../../integrations/openmaint/openmaint.client';
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service';

const OPENMAINT_PAYMENTS_CLASS = 'Pagos';
const OPENMAINT_TENANTS_VIEW = 'TenantAlicuotaSummary';
const OPENMAINT_CONFIG_EXPENSA_CLASS = 'ConfigExpensa';
const LOOKUP_ESTADO_PENDIENTE = 3166839;
const TIPO_EXPENSA = 'Expensas';

export interface TenantAlicuotaRaw {
  _id: number;
  'Propietario': string;
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

export interface PaymentsGenerationResult {
  periodo: string;
  total: number;
  created: number;
  skipped: number;
  failed: number;
  errors: string[];
  skippedReason?: string;
}

interface PagoCard {
  Description: string;
  Propietario: number;
  Periodo: string;
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly openmaintClient: OpenmaintClient,
    private readonly openmaintAuthService: OpenmaintAuthService,
    private readonly configService: ConfigService,
  ) {}

  async generateMonthlyPayments(periodo: string): Promise<PaymentsGenerationResult> {
    this.logger.log(`[Payments] Iniciando verificacion para periodo ${periodo}`);

    const result: PaymentsGenerationResult = {
      periodo,
      total: 0,
      created: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    const sessionId = await this.getOpenmaintSession();

    const config = await this.getConfigExpensa(sessionId);

    if (!config) {
      const msg = 'No se encontro configuracion en ConfigExpensa';
      this.logger.warn(`[Payments] ${msg}`);
      result.skippedReason = msg;
      return result;
    }

    const today = new Date();
    const todayDay = today.getDate();

    if (todayDay !== config.DiaEmision) {
      const msg = `Hoy es dia ${todayDay}, DiaEmision configurado es ${config.DiaEmision} - no se generan pagos`;
      this.logger.log(`[Payments] ${msg}`);
      result.skippedReason = msg;
      return result;
    }

    this.logger.log(
      `[Payments] DiaEmision coincide (dia ${config.DiaEmision}) - procediendo a generar pagos para ${periodo}`,
    );

    const tenants = await this.getTenants(sessionId);
    result.total = tenants.length;

    if (tenants.length === 0) {
      this.logger.log('[Payments] Sin unidades activas encontradas');
      return result;
    }

    const pagosExistentes = await this.getPagosDelPeriodo(periodo, sessionId);
    this.logger.log(`[Payments] Pagos existentes para ${periodo}: ${pagosExistentes.length}`);

    for (const tenant of tenants) {
      try {
        const alreadyExists = pagosExistentes.some(
          (p) =>
            p.Propietario === tenant.propietarioId &&
            p.Description === tenant.unidadNombre,
        );

        if (alreadyExists) {
          this.logger.log(
            `[Payments] Pago de "${tenant.unidadNombre}" (${tenant.propietarioNombre}) para ${periodo} ya existe - omitiendo`,
          );
          result.skipped++;
          continue;
        }

        await this.createPaymentCard(tenant, periodo, sessionId);
        result.created++;
        this.logger.log(
          `[Payments] Pago creado - "${tenant.unidadNombre}" - ${tenant.propietarioNombre} - $${tenant.monto} - ${periodo}`,
        );
      } catch (error) {
        const msg = `"${tenant.unidadNombre}" (${tenant.propietarioNombre}): ${error?.message ?? 'Error desconocido'}`;
        this.logger.error(`[Payments] ${msg}`);
        result.failed++;
        result.errors.push(msg);
      }
    }

    this.logger.log(
      `[Payments] Completado ${periodo} -> total:${result.total} creados:${result.created} omitidos:${result.skipped} fallidos:${result.failed}`,
    );

    return result;
  }

  private async getPagosDelPeriodo(periodo: string, sessionId: string): Promise<PagoCard[]> {
    try {
      const cql = encodeURIComponent(`Periodo = "${periodo}"`);

      const response = (await this.openmaintClient.get(
        `/classes/${OPENMAINT_PAYMENTS_CLASS}/cards?cql=${cql}&limit=9999`,
        sessionId,
      )) as { data?: PagoCard[] };

      return response?.data ?? [];
    } catch (error) {
      this.logger.warn(`[Payments] No se pudieron obtener pagos existentes: ${error?.message}`);
      return [];
    }
  }

  private async getConfigExpensa(sessionId: string): Promise<ConfigExpensa | null> {
    try {
      const response = (await this.openmaintClient.get(
        `/classes/${OPENMAINT_CONFIG_EXPENSA_CLASS}/cards?limit=1`,
        sessionId,
      )) as { data?: ConfigExpensa[] };

      const record = response?.data?.[0];

      if (!record) {
        this.logger.warn('[Payments] ConfigExpensa no tiene registros');
        return null;
      }

      this.logger.log(
        `[Payments] ConfigExpensa -> DiaEmision:${record.DiaEmision} DiaVencimiento:${record.DiaVencimiento} Tiempo:${record.Tiempo}`,
      );

      return record;
    } catch (error) {
      this.logger.error('[Payments] Error al obtener ConfigExpensa:', error?.message);
      return null;
    }
  }

  private async getTenants(sessionId: string): Promise<TenantAlicuota[]> {
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
      this.logger.error('[Payments] Error al obtener tenants:', error?.message);
      throw error;
    }
  }

  private async createPaymentCard(
    tenant: TenantAlicuota,
    periodo: string,
    sessionId: string,
  ): Promise<void> {
    const card = {
      Propietario: tenant.propietarioId,
      Description: tenant.unidadNombre,
      Unidad: tenant.unidadNombre,
      Monto: tenant.monto,
      Periodo: periodo,
      Estado: LOOKUP_ESTADO_PENDIENTE,
      Tipo: TIPO_EXPENSA,
    };

    const response = (await this.openmaintClient.post(
      `/classes/${OPENMAINT_PAYMENTS_CLASS}/cards`,
      card,
      sessionId,
    )) as { success?: boolean; data?: { _id?: number } };

    if (!response?.success) {
      throw new Error(
        `openMAINT retornó success:false para unidad "${tenant.unidadNombre}"`,
      );
    }

    this.logger.log(
      `[Payments] Card creada id=${response?.data?._id} - "${tenant.unidadNombre}" - ${tenant.propietarioNombre}`,
    );
  }

  private async getOpenmaintSession(): Promise<string> {
    const username = this.configService.get<string>('OPENMAINT_USERNAME') ?? '';
    const password = this.configService.get<string>('OPENMAINT_PASSWORD') ?? '';
    const response = await this.openmaintAuthService.login(username, password);
    return response?.data?._id ?? '';
  }
}
