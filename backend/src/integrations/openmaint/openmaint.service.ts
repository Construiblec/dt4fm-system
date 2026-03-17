import { InternalServerErrorException, Injectable } from '@nestjs/common'
import FormData from 'form-data'
import { OpenmaintClient } from './openmaint.client'

type EmployeeCard = {
  _id: number
}

type EmployeeCardsResponse = {
  data?: EmployeeCard[]
}

type OpenmaintCreateIncidentBody = {
  _type: 'CorrectiveMaint'
  _activity: 'CM01-Opening'
  _advance: true
  OpeningDate: string
  ShortDescr: string
  ProcessNotes: string
  Requester: number
  Type: number
  Priority: number
  Site: number
  Category: number
  Subcategory: number
  ProcessStatus: number
}

type OpenmaintIncidentResponse = {
  success?: boolean
  data?: {
    _id?: number
    Id?: number
    id?: number
  }
}

type UploadedImage = {
  buffer: Buffer
  originalname: string
  mimetype: string
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

  async createCorrectiveMaintIncident(body: OpenmaintCreateIncidentBody, sessionId: string) {
    try {
      const response = await this.client.post(
        '/processes/CorrectiveMaint/instances',
        body,
        sessionId
      ) as OpenmaintIncidentResponse

      if (response.success === false) {
        throw new InternalServerErrorException('OpenMAINT no pudo crear el incidente')
      }

      return response
    } catch (error) {
      if (error instanceof InternalServerErrorException) {
        throw error
      }

      throw new InternalServerErrorException('Error al crear incidente en OpenMAINT')
    }
  }

  extractIncidentId(response: OpenmaintIncidentResponse): number | null {
    return response.data?._id ?? response.data?.Id ?? response.data?.id ?? null
  }

  async uploadIncidentAttachment(
    incidentId: number,
    image: UploadedImage,
    sessionId: string
  ): Promise<boolean> {
    const formData = new FormData()

    formData.append('file', image.buffer, {
      filename: image.originalname,
      contentType: image.mimetype
    })

    try {
      await this.client.post(
        `/processes/CorrectiveMaint/instances/${incidentId}/attachments`,
        formData,
        sessionId,
        {
          headers: formData.getHeaders()
        }
      )

      return true
    } catch {
      return false
    }
  }

}
