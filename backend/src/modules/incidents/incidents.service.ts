import { Injectable, InternalServerErrorException } from '@nestjs/common'
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service'
import { CreateIncidentDto } from './dto/create-incident.dto'

type UploadedImage = {
  buffer: Buffer
  originalname: string
  mimetype: string
}

@Injectable()
export class IncidentsService {

  constructor(
    private readonly openmaintService: OpenmaintService
  ) {}

  async createIncident(
    sessionId: string,
    employeeId: number,
    dto: CreateIncidentDto,
    images: UploadedImage[] = []
  ) {
    const incidentResponse = await this.openmaintService.createCorrectiveMaintIncident(
      {
        _type: 'CorrectiveMaint',
        _activity: 'CM01-Opening',
        _advance: true,
        OpeningDate: new Date().toISOString(),
        ShortDescr: dto.floorArea,
        ProcessNotes: dto.notes,
        Requester: employeeId,
        Type: 268288,
        Priority: dto.priority,
        Site: dto.buildingId,
        Category: 510370,
        Subcategory: 510391,
        ProcessStatus: 277461
      },
      sessionId
    )

    const incidentId = this.openmaintService.extractIncidentId(incidentResponse)

    if (!incidentId) {
      throw new InternalServerErrorException('No se pudo obtener el identificador del incidente creado')
    }

    const attachmentResults = images.length > 0
      ? await Promise.allSettled(
        images.map((image) => this.openmaintService.uploadIncidentAttachment(
          incidentId,
          image,
          sessionId
        ))
      )
      : []

    const attachmentsUploaded = attachmentResults.filter(
      (result) => result.status === 'fulfilled' && result.value
    ).length

    const attachmentsFailed = attachmentResults.length - attachmentsUploaded

    return {
      incidentId,
      requester: employeeId,
      buildingId: dto.buildingId,
      attachmentsUploaded,
      attachmentsFailed
    }
  }

}
