import { Injectable } from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
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

  async get(path: string, sessionId?: string) {

    const url = `${this.baseUrl}${path}`

    const headers = sessionId
      ? { 'Cmdbuild-authorization': sessionId }
      : {}

    const response = await firstValueFrom(
      this.httpService.get(url, { headers })
    )

    return response.data
  }

  async post(path: string, body: any, sessionId?: string) {

    const url = `${this.baseUrl}${path}`

    const headers = sessionId
      ? { 'Cmdbuild-authorization': sessionId }
      : {}

    const response = await firstValueFrom(
      this.httpService.post(url, body, { headers })
    )

    return response.data
  }

}