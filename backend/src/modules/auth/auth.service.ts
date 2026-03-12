import { Injectable, UnauthorizedException } from '@nestjs/common'
import { LoginDto } from './dto/login.dto'
import { OpenmaintAuthService } from '../../integrations/openmaint/openmaint.auth.service'

@Injectable()
export class AuthService {

  constructor(
    private readonly openmaintAuthService: OpenmaintAuthService
  ) {}

  async login(dto: LoginDto) {

    const response = await this.openmaintAuthService.login(
      dto.username,
      dto.password
    )

    if (!response?.data?._id) {
      throw new UnauthorizedException('Credenciales inválidas')
    }

    return {
      sessionId: response.data._id,
      username: response.data.username,
      role: response.data.role
    }

  }

}