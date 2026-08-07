import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError, AxiosRequestConfig, AxiosResponse } from 'axios';
import { firstValueFrom } from 'rxjs';
import {
  getMockCheckouts,
  HostawayCheckoutsResponse,
  HostawayBillingReservation,
} from './hostaway.mock';

interface TokenCache {
  accessToken: string;
  expiresAt: number; // ms timestamp
}

// Solo estos statuses generan tarea de limpieza
const VALID_RESERVATION_STATUSES = ['new', 'modified', 'confirmed'];

/** Máximo por página que acepta Hostaway en /v1/reservations */
const HOSTAWAY_PAGE_SIZE = 100;

/** Tope defensivo de páginas para no quedar iterando ante un cursor anómalo */
const MAX_CHECKOUT_PAGES = 25;

@Injectable()
export class HostawayService {
  private readonly logger = new Logger(HostawayService.name);
  private tokenCache: TokenCache | null = null;
  private readonly requestTimeoutMs = 15_000;
  private readonly maxRetries = 2;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private async delay(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableError(error: AxiosError | Error): boolean {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status;
    const code = axiosError.code;

    if (status === 401) return false;
    if (status != null) return status >= 500 || status === 429;

    return [
      'ECONNABORTED',
      'ETIMEDOUT',
      'ECONNRESET',
      'ENOTFOUND',
      'EAI_AGAIN',
      'ERR_CANCELED',
    ].includes(code ?? '');
  }

  private buildSafeErrorMessage(error: AxiosError | Error): string {
    const axiosError = error as AxiosError<{
      message?: string;
      error_description?: string;
    }>;

    const status = axiosError.response?.status;
    const code = axiosError.code;
    const apiMessage =
      axiosError.response?.data?.error_description ??
      axiosError.response?.data?.message;

    return [
      status ? `status=${status}` : null,
      code ? `code=${code}` : null,
      apiMessage,
    ]
      .filter(Boolean)
      .join(' | ');
  }

  private async performRequest<T>(
    operationName: string,
    request: () => Promise<AxiosResponse<T>>,
  ): Promise<AxiosResponse<T>> {
    let lastError: AxiosError | Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries + 1; attempt++) {
      try {
        return await request();
      } catch (error) {
        lastError = error as AxiosError | Error;
        const safeMessage = this.buildSafeErrorMessage(lastError);
        const shouldRetry =
          attempt <= this.maxRetries && this.isRetryableError(lastError);

        this.logger.warn(
          `${operationName} fallo en intento ${attempt}/${this.maxRetries + 1}` +
            (safeMessage ? ` -> ${safeMessage}` : ''),
        );

        if (!shouldRetry) break;

        const backoffMs = attempt * 1_500;
        this.logger.warn(`${operationName}: reintentando en ${backoffMs} ms`);
        await this.delay(backoffMs);
      }
    }

    const finalError = lastError as AxiosError<{
      message?: string;
      error_description?: string;
    }>;
    const safeMessage = this.buildSafeErrorMessage(finalError);

    if (finalError?.response?.status === 401) {
      throw new UnauthorizedException(
        `Hostaway rechazo las credenciales OAuth` +
          (safeMessage ? ` (${safeMessage})` : ''),
      );
    }

    throw new ServiceUnavailableException(
      `No fue posible completar la operacion con Hostaway` +
        (safeMessage ? ` (${safeMessage})` : ''),
    );
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();

    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.accessToken;
    }

    const rawClientId = this.configService.get<string>('HOSTAWAY_CLIENT_ID');
    const rawClientSecret = this.configService.get<string>(
      'HOSTAWAY_CLIENT_SECRET',
    );
    const clientId = rawClientId?.trim();
    const clientSecret = rawClientSecret?.trim();

    if (!clientId || !clientSecret) {
      throw new Error(
        'Credenciales de Hostaway no configuradas (HOSTAWAY_CLIENT_ID / HOSTAWAY_CLIENT_SECRET)',
      );
    }

    if (rawClientId !== clientId || rawClientSecret !== clientSecret) {
      this.logger.warn(
        'Las credenciales de Hostaway contienen espacios o saltos de linea y fueron normalizadas',
      );
    }

    this.logger.log('Solicitando token OAuth a Hostaway...');

    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'general',
    });

    const requestConfig: AxiosRequestConfig = {
      timeout: this.requestTimeoutMs,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    };

    const response = await this.performRequest<{
      access_token: string;
      expires_in?: number;
    }>('Solicitud de token OAuth a Hostaway', () =>
      firstValueFrom(
        this.httpService.post(
          'https://api.hostaway.com/v1/accessTokens',
          params.toString(),
          requestConfig,
        ),
      ),
    );

    const { access_token, expires_in } = response.data;

    this.tokenCache = {
      accessToken: access_token,
      expiresAt: now + (expires_in ?? 3600) * 1000,
    };

    this.logger.log('Token Hostaway obtenido');
    return access_token;
  }

  /**
   * Obtiene checkouts entre dateFrom y dateTo (inclusive).
   * Si HOSTAWAY_USE_MOCK=true retorna datos de prueba.
   *
   * NOTA: Hostaway no filtra por checkOutDateFrom/To en el resultado —
   * devuelve las reservas más recientes. Por eso filtramos en código
   * por departureDate y por status válido.
   *
   * Recorremos todas las páginas con el cursor afterId (mismo patrón que
   * getReservationsByArrivalDate). Con una sola página de 100 un rango de
   * varios días se truncaba en silencio: a ~16 checkouts diarios, una semana
   * ya roza el tope y el usuario recibía un listado incompleto sin error.
   */
  async getCheckouts(
    dateFrom: string,
    dateTo: string,
  ): Promise<HostawayCheckoutsResponse> {
    const useMock =
      this.configService.get<string>('HOSTAWAY_USE_MOCK') === 'true';

    if (useMock) {
      this.logger.warn('[MOCK] Usando datos de prueba de Hostaway');
      return getMockCheckouts(dateFrom, dateTo);
    }

    const token = await this.getAccessToken();

    this.logger.log(
      `Consultando checkouts Hostaway [${dateFrom} -> ${dateTo}]`,
    );

    const filtered: any[] = [];
    const seenReservationIds = new Set<string>();
    let totalReceived = 0;
    let afterId: number | undefined = undefined;
    let page = 1;

    while (page <= MAX_CHECKOUT_PAGES) {
      const params: Record<string, unknown> = {
        checkOutDateFrom: dateFrom,
        checkOutDateTo: dateTo,
        includeResources: 1,
        limit: HOSTAWAY_PAGE_SIZE,
      };

      if (afterId !== undefined) {
        params.afterId = afterId;
      }

      const response = await this.performRequest<{
        result?: unknown[];
        count?: number;
      }>(`Consulta de checkouts Hostaway página ${page}`, () =>
        firstValueFrom(
          this.httpService.get('https://api.hostaway.com/v1/reservations', {
            timeout: this.requestTimeoutMs,
            headers: { Authorization: `Bearer ${token}` },
            params,
          }),
        ),
      );

      const rawBatch: any[] = response.data?.result ?? [];
      totalReceived += rawBatch.length;

      for (const r of rawBatch) {
        // Filtro 1: solo reservas cuya departureDate esté en el rango solicitado
        const dep = r.departureDate ?? '';
        if (dep < dateFrom || dep > dateTo) continue;

        // Filtro 2: solo status válidos para generar tarea de limpieza
        if (!VALID_RESERVATION_STATUSES.includes(r.status ?? '')) continue;

        // El cursor puede solaparse entre páginas; evitamos duplicados.
        const id = String(r.hostawayReservationId ?? r.id ?? '');
        if (id && seenReservationIds.has(id)) continue;
        if (id) seenReservationIds.add(id);

        filtered.push(r);
      }

      // Última página: Hostaway devolvió menos de lo pedido.
      if (rawBatch.length < HOSTAWAY_PAGE_SIZE) break;

      const nextAfterId = rawBatch[rawBatch.length - 1]?.id;
      // Sin cursor válido o sin avance no podemos seguir sin ciclar.
      if (nextAfterId == null || nextAfterId === afterId) break;

      afterId = nextAfterId as number;
      page++;
    }

    if (page > MAX_CHECKOUT_PAGES) {
      this.logger.warn(
        `Hostaway: se alcanzó el tope de ${MAX_CHECKOUT_PAGES} páginas para [${dateFrom}/${dateTo}]; el resultado podría estar incompleto`,
      );
    }

    this.logger.log(
      `Hostaway: ${totalReceived} recibidas en ${page} página(s) → ${filtered.length} en rango [${dateFrom}/${dateTo}] con status válido`,
    );

    return {
      result: filtered.map((r) => ({
        reservationId: String(r.hostawayReservationId ?? r.id ?? ''),
        guestName: r.guestFirstName
          ? `${r.guestFirstName} ${r.guestLastName ?? ''}`.trim()
          : (r.guestName ?? 'Desconocido'),
        listingName: r.listingName ?? '',
        listingId: String(r.listingMapId ?? ''),
        checkoutDate: r.departureDate ?? dateFrom,
        checkoutTime: r.checkOutTime ?? 11,
      })),
      count: filtered.length,
    };
  }

  /**
   * Obtiene reservaciones por arrivalDate para facturación diaria.
   * Filtra por paymentStatus=Paid y status válidos.
   * Usa cursor-based pagination con afterId para recorrer todos los resultados.
   */
  async getReservationsByArrivalDate(
    date: string,
  ): Promise<HostawayBillingReservation[]> {
    const token = await this.getAccessToken();
    const VALID_BILLING_STATUSES = ['new', 'modified', 'confirmed'];
    const allReservations: HostawayBillingReservation[] = [];
    let afterId: number | undefined = undefined;
    let page = 1;

    this.logger.log(
      `[Billing] Consultando reservaciones para facturar arrivalDate=${date}`,
    );

    do {
      const params: Record<string, unknown> = {
        arrivalStartDate: date,
        arrivalEndDate: date,
        limit: 100,
        includeResources: 1,
      };

      if (afterId !== undefined) {
        params.afterId = afterId;
      }

      const response = await this.performRequest<{
        result?: unknown[];
        count?: number;
      }>(`Consulta billing Hostaway página ${page}`, () =>
        firstValueFrom(
          this.httpService.get('https://api.hostaway.com/v1/reservations', {
            timeout: this.requestTimeoutMs,
            headers: { Authorization: `Bearer ${token}` },
            params,
          }),
        ),
      );

      const rawBatch: any[] = response.data?.result ?? [];

      const filtered = rawBatch.filter(
        (r) =>
          r.paymentStatus === 'Paid' &&
          VALID_BILLING_STATUSES.includes(r.status ?? ''),
      );

      this.logger.log(
        `[Billing] Página ${page}: ${rawBatch.length} recibidas → ${filtered.length} válidas para facturar`,
      );

      for (const r of filtered) {
        allReservations.push({
          hostawayReservationId: String(r.hostawayReservationId ?? r.id ?? ''),
          guestName: r.guestFirstName
            ? `${r.guestFirstName} ${r.guestLastName ?? ''}`.trim()
            : (r.guestName ?? 'Huesped'),
          guestPhone: r.phone ?? null,
          guestEmail: r.guestEmail ?? null,
          guestCountry: r.guestCountry ?? null,
          listingMapId: String(r.listingMapId ?? ''),
          listingName: r.listingName ?? '',
          arrivalDate: r.arrivalDate ?? date,
          departureDate: r.departureDate ?? '',
          totalPrice: r.totalPrice ?? 0,
          cleaningFee: r.cleaningFee ?? 0,
          currency: r.currency ?? 'USD',
          channelName: r.channelName ?? '',
          confirmationCode: r.confirmationCode ?? '',
          nights: r.nights ?? 1,
        });
      }

      // Preparar cursor para siguiente página
      if (rawBatch.length === 100) {
        afterId = rawBatch[rawBatch.length - 1]?.id;
        page++;
      } else {
        break; // Última página
      }
    } while (true);

    this.logger.log(
      `[Billing] Total reservaciones a facturar para ${date}: ${allReservations.length}`,
    );

    return allReservations;
  }

  /**
   * Alias para compatibilidad; consulta un único día.
   */
  async getCheckoutsByDate(date: string): Promise<HostawayCheckoutsResponse> {
    return this.getCheckouts(date, date);
  }
}
