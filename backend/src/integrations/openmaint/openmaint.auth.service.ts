import { Injectable } from '@nestjs/common'
import { OpenmaintClient } from './openmaint.client'

@Injectable()
export class OpenmaintAuthService {

  constructor(private readonly client: OpenmaintClient) {}

  async login(username: string, password: string) {

    const body = {
      username,
      password
    }

    return this.client.post(
      '/sessions?scope=service&returnId=true',
      body
    )
  }

}