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
import { getMockCheckouts, HostawayCheckoutsResponse } from './hostaway.mock';

interface TokenCache {
  accessToken: string;
  expiresAt: number; // ms timestamp
}

@Injectable()
export class HostawayService {
  private readonly logger = new Logger(HostawayService.name);
  private tokenCache: TokenCache | null = null;
  private readonly requestTimeoutMs = 15_000;
  private readonly maxRetries = 2;
  private readonly pageSize = 100;
  private readonly maxPages = 1000;

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

  private buildSafeErrorMessage(
    error: AxiosError | Error,
  ): string {
    const axiosError = error as AxiosError<{
      message?: string;
      error_description?: string;
    }>;

    const status = axiosError.response?.status;
    const code = axiosError.code;
    const apiMessage =
      axiosError.response?.data?.error_description ??
      axiosError.response?.data?.message;

    return [status ? `status=${status}` : null, code ? `code=${code}` : null, apiMessage]
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
        this.logger.warn(
          `${operationName}: reintentando en ${backoffMs} ms`,
        );
        await this.delay(backoffMs);
      }
    }

    const finalError = lastError as AxiosError<{
      message?: string;
      error_description?: string;
    }>;
    const status = finalError?.response?.status;
    const safeMessage = this.buildSafeErrorMessage(finalError);

    if (status === 401) {
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

    // Reutilizar token si aun tiene mas de 60 s de vida
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
        'Las credenciales de Hostaway contienen espacios o saltos de linea y fueron normalizadas antes de enviar la solicitud OAuth',
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
   */
  async getCheckouts(
    dateFrom: string,
    dateTo: string,
  ): Promise<HostawayCheckoutsResponse> {
    const useMock =
      this.configService.get<string>('HOSTAWAY_USE_MOCK') === 'true';

    if (useMock) {
      this.logger.warn('[MOCK] Usando datos de prueba de Hostaway');
      return getMockCheckouts(dateFrom);
    }

    const token = await this.getAccessToken();

    this.logger.log(`Consultando checkouts Hostaway [${dateFrom} -> ${dateTo}]`);
    const rawReservations = await this.getAllReservations(token, dateFrom, dateTo);

    return {
      result: rawReservations.map((r) => ({
        reservationId: String(r.hostawayReservationId ?? r.id ?? ''),
        guestName: r.guestFirstName
          ? `${r.guestFirstName} ${r.guestLastName ?? ''}`.trim()
          : (r.guestName ?? 'Desconocido'),
        listingName: r.listingName ?? '',
        listingId: String(r.listingMapId ?? ''),
        checkoutDate: r.departureDate ?? dateFrom,
        checkoutTime: r.checkOutTime ?? '11:00',
      })),
      count: rawReservations.length,
    };
  }

  /**
   * Alias para compatibilidad; consulta un unico dia.
   */
  async getCheckoutsByDate(date: string): Promise<HostawayCheckoutsResponse> {
    return this.getCheckouts(date, date);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getAllReservations(token: string, dateFrom: string, dateTo: string): Promise<any[]> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allReservations: any[] = [];
    let afterId: number | null = null;

    for (let page = 1; page <= this.maxPages; page++) {
      const response = await this.performRequest<{
        result?: unknown[];
        count?: number;
        totalPages?: number;
      }>('Consulta de reservas Hostaway', () =>
        firstValueFrom(
          this.httpService.get('https://api.hostaway.com/v1/reservations', {
            timeout: this.requestTimeoutMs,
            headers: { Authorization: `Bearer ${token}` },
            params: {
              departureStartDate: dateFrom,
              departureEndDate: dateTo,
              includeResources: 1,
              limit: this.pageSize,
              ...(afterId != null ? { afterId } : {}),
            },
          }),
        ),
      );

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pageReservations: any[] = response.data?.result ?? [];

      if (pageReservations.length === 0) {
        this.logger.log(
          `Hostaway no devolvio mas reservas. Total acumulado: ${allReservations.length}`,
        );
        break;
      }

      allReservations.push(...pageReservations);

      this.logger.log(
        `Hostaway pagina ${page}: recibidas ${pageReservations.length}, acumuladas ${allReservations.length}`,
      );

      if (pageReservations.length < this.pageSize) {
        break;
      }

      const lastReservationId = Number(
        pageReservations[pageReservations.length - 1]?.id,
      );

      if (!Number.isFinite(lastReservationId) || lastReservationId <= 0) {
        this.logger.warn(
          'Hostaway no devolvio un id valido para continuar la paginacion. Se detiene en la pagina actual.',
        );
        break;
      }

      if (afterId === lastReservationId) {
        this.logger.warn(
          'Hostaway repitio el cursor afterId. Se detiene la paginacion para evitar un bucle infinito.',
        );
        break;
      }

      afterId = lastReservationId;
    }

    if (allReservations.length > 0 && allReservations.length % this.pageSize === 0) {
      this.logger.warn(
        `Se alcanzo un total multiplo del tamano de pagina (${this.pageSize}). Si faltan reservas, revisa rate limits o filtros de Hostaway.`,
      );
    }

    return allReservations;
  }
}
