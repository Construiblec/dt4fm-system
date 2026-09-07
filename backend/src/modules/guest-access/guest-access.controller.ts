import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { IssueMagicLinkDto } from './dto/issue-magic-link.dto';
import { GuestAccessService } from './guest-access.service';
import {
  GUEST_ISSUER_SECRET_HEADER,
  GuestLinkIssuerGuard,
} from './guards/guest-link-issuer.guard';
import {
  GUEST_TOKEN_HEADER,
  GuestTokenGuard,
} from './guards/guest-token.guard';
import type { RequestWithGuest } from './guards/guest-token.guard';

@ApiTags('Acceso de huéspedes')
@Controller('guest')
export class GuestAccessController {
  constructor(private readonly guestAccess: GuestAccessService) {}

  @Post('magic-link')
  @HttpCode(HttpStatus.CREATED)
  @UseGuards(GuestLinkIssuerGuard)
  @ApiHeader({
    name: GUEST_ISSUER_SECRET_HEADER,
    description: 'Secreto compartido de emisión (GUEST_LINK_ISSUER_SECRET)',
    required: true,
  })
  @ApiOperation({
    summary: 'Emitir el enlace de acceso de un huésped',
    description:
      'Endpoint interno. Devuelve un enlace firmado, válido desde antes del ' +
      'check-in hasta después del check-out de la reserva indicada. La ' +
      'ventana exacta la fijan GUEST_LINK_LEAD_HOURS y GUEST_LINK_GRACE_HOURS.',
  })
  @ApiResponse({ status: 201, description: 'Enlace emitido.' })
  @ApiResponse({ status: 401, description: 'Secreto de emisión inválido.' })
  @ApiResponse({
    status: 404,
    description: 'La reserva no existe o está cancelada.',
  })
  @ApiResponse({
    status: 503,
    description: 'Falta configurar el acceso de huéspedes.',
  })
  async issueMagicLink(@Body() dto: IssueMagicLinkDto) {
    return this.guestAccess.issueMagicLink(dto.reservationId);
  }

  @Get('me')
  @UseGuards(GuestTokenGuard)
  @ApiHeader({
    name: GUEST_TOKEN_HEADER,
    description:
      'Token del magiclink. También se acepta en `Authorization: Bearer` ' +
      'o, solo para la primera carga, en el query string `?token=`.',
    required: false,
  })
  @ApiOperation({
    summary: 'Datos del huésped que abrió el enlace',
    description:
      'Punto de entrada del dashboard. Valida el enlace y devuelve la ' +
      'reserva a la que da derecho. La identidad sale siempre del token, ' +
      'nunca de un parámetro de la petición.',
  })
  @ApiResponse({ status: 200, description: 'Enlace válido.' })
  @ApiResponse({ status: 401, description: 'Enlace inválido o vencido.' })
  @ApiResponse({ status: 429, description: 'Demasiadas peticiones.' })
  getMe(@Req() request: RequestWithGuest) {
    return request.guest;
  }
}
