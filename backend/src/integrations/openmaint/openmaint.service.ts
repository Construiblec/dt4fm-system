import { Injectable } from '@nestjs/common'
import { OpenmaintClient } from './openmaint.client'

type EmployeeCard = {
  _id: number
}

type EmployeeCardsResponse = {
  data?: EmployeeCard[]
}

@Injectable()
export class OpenmaintService {

  constructor(
    private readonly client: OpenmaintClient
  ) {}

  async getBuildings(sessionId: string) {
    return this.client.get('/classes/Building/cards', sessionId)
  }

  async resolveEmployeeId(userId: number, sessionId?: string): Promise<number | null> {
    const filter = {
      attribute: {
        simple: {
          attribute: 'LoginUser',
          operator: 'equal',
          value: userId
        }
      }
    }

    const encodedFilter = encodeURIComponent(JSON.stringify(filter))

    try {
      const response = await this.client.get(
        `/classes/Employee/cards?filter=${encodedFilter}`,
        sessionId
      ) as EmployeeCardsResponse

      return response.data?.[0]?._id ?? null
    } catch {
      return null
    }
  }

}
