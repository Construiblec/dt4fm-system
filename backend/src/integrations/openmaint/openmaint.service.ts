import { Injectable } from '@nestjs/common'
import { OpenmaintClient } from './openmaint.client'

@Injectable()
export class OpenmaintService {

  constructor(
    private readonly client: OpenmaintClient
  ) {}

  async getBuildings(sessionId: string) {
    return this.client.get('/classes/Building/cards', sessionId)
  }

}
