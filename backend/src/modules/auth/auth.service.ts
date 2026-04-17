import { Injectable, UnauthorizedException } from '@nestjs/common'
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service'
import { OpenmaintService } from '../../integrations/openmaint/openmaint.service'
import { LoginDto } from './dto/login.dto'

@Injectable()
export class AuthService {

  constructor(
    private readonly openmaintAuthService: OpenmaintAuthService,
    private readonly openmaintService: OpenmaintService
  ) {}

  async login(dto: LoginDto) {
    const response = await this.openmaintAuthService.login(
      dto.username,
      dto.password
    )

    if (!response?.data?._id) {
      throw new UnauthorizedException('Credenciales invÃ¡lidas')
    }

    const sessionId = response.data._id
    const userId = response.data.userId
    const username = response.data.username

    const employeeId = typeof userId === 'number'
      ? await this.openmaintService.resolveEmployeeId(userId, sessionId)
      : null

    const cleaningEmployeeId = await this.openmaintService.resolveCleaningEmployeeId(
      username,
      sessionId,
    )

    return {
      sessionId,
      username,
      userId,
      role: response.data.role,
      employeeId,
      cleaningEmployeeId,
    }
  }

}
