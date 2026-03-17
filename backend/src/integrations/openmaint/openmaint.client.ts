import { Injectable } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { AxiosRequestConfig } from 'axios'
import { firstValueFrom } from 'rxjs'

@Injectable()
export class OpenmaintClient {

  private baseUrl: string

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService
  ) {
    this.baseUrl = this.configService.get<string>('OPENMAINT_URL') || '';
  }

  async get(path: string, sessionId?: string, config?: AxiosRequestConfig) {

    const url = `${this.baseUrl}${path}`

    const headers = sessionId
      ? { 'Cmdbuild-authorization': sessionId }
      : {}

    const response = await firstValueFrom(
      this.httpService.get(url, {
        ...config,
        headers: {
          ...headers,
          ...(config?.headers ?? {})
        }
      })
    )

    return response.data
  }

  async post(path: string, body: any, sessionId?: string, config?: AxiosRequestConfig) {

    const url = `${this.baseUrl}${path}`

    const headers = sessionId
      ? { 'Cmdbuild-authorization': sessionId }
      : {}

    const response = await firstValueFrom(
      this.httpService.post(url, body, {
        ...config,
        headers: {
          ...headers,
          ...(config?.headers ?? {})
        }
      })
    )

    return response.data
  }

}
