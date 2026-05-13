import { Body, Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { OwnersService } from './owners.service';
import { VerifyOwnerDto } from './dto/verify-owner.dto';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import { LoginDto } from '../auth/dto/login.dto';

@Controller('owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  /**
   * GET /owners/buildings
   * Lista de edificios para el selector del registro. Sin auth.
   */
  @Get('buildings')
  async getBuildings() {
    return this.ownersService.getBuildings();
  }

  /**
   * POST /owners/verify
   * Verifica que el propietario exista por cédula + edificio.
   */
  @Post('verify')
  async verifyOwner(@Body() dto: VerifyOwnerDto) {
    return this.ownersService.verifyOwner(dto);
  }

  /**
   * POST /owners/register
   * Crea el usuario propietario en OpenMAINT.
   */
  @Post('register')
  async registerOwner(@Body() dto: RegisterOwnerDto) {
    return this.ownersService.registerOwner(dto);
  }

  /**
   * POST /owners/login
   * Login del propietario — valida rol Propietarios.
   */
  @Post('login')
  async loginOwner(@Body() dto: LoginDto) {
    return this.ownersService.loginOwner(dto.username, dto.password);
  }

  /**
   * GET /owners/:tenantId/units
   * Unidades del propietario con sus alícuotas y valor de expensa.
   */
  @Get(':tenantId/units')
  async getOwnerUnits(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.ownersService.getOwnerUnits(tenantId);
  }

  /**
   * GET /owners/:tenantId/payments
   * Pagos del propietario — pendientes e historial completo.
   */
  @Get(':tenantId/payments')
  async getOwnerPayments(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.ownersService.getOwnerPendingPayments(tenantId);
  }
}
