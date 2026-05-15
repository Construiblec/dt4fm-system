import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { OwnersService } from './owners.service';
import { VerifyOwnerDto } from './dto/verify-owner.dto';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ContactAdminDto } from './dto/contact-admin.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { LoginDto } from '../auth/dto/login.dto';

@Controller('owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  // ─── Auth ─────────────────────────────────────────────────────────────────

  @Get('buildings')
  async getBuildings() {
    return this.ownersService.getBuildings();
  }

  @Post('verify')
  async verifyOwner(@Body() dto: VerifyOwnerDto) {
    return this.ownersService.verifyOwner(dto);
  }

  @Post('register')
  async registerOwner(@Body() dto: RegisterOwnerDto) {
    return this.ownersService.registerOwner(dto);
  }

  @Post('login')
  async loginOwner(@Body() dto: LoginDto) {
    return this.ownersService.loginOwner(dto.username, dto.password);
  }

  // ─── Áreas comunales ──────────────────────────────────────────────────────

  /**
   * GET /owners/common-areas?buildingId=xxx
   * Lista todas las áreas comunales, opcionalmente filtradas por edificio.
   */
  @Get('common-areas')
  async getCommonAreas(@Query('buildingId') buildingId?: string) {
    return this.ownersService.getCommonAreas(
      buildingId ? Number(buildingId) : undefined,
    );
  }

  /**
   * GET /owners/common-areas/:areaId
   * Detalle de un área comunal específica con precio y fechas.
   */
  @Get('common-areas/:areaId')
  async getCommonAreaById(@Param('areaId', ParseIntPipe) areaId: number) {
    return this.ownersService.getCommonAreaById(areaId);
  }

  /**
   * POST /owners/:tenantId/reservations
   * Crea una reserva para el propietario en el área especificada.
   * Body: { commonAreaId, fechaInicio, fechaFin, notes? }
   */
  @Post(':tenantId/reservations')
  async createReservation(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() dto: CreateReservationDto,
  ) {
    return this.ownersService.createReservation(dto, tenantId);
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  @Get(':tenantId/units')
  async getOwnerUnits(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.ownersService.getOwnerUnits(tenantId);
  }

  @Get(':tenantId/payments')
  async getOwnerPayments(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.ownersService.getOwnerPendingPayments(tenantId);
  }

  // ─── Perfil ───────────────────────────────────────────────────────────────

  @Get(':userId/profile')
  async getOwnerProfile(@Param('userId', ParseIntPipe) userId: number) {
    return this.ownersService.getOwnerProfile(userId);
  }

  @Put(':userId/password')
  async changePassword(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.ownersService.changeOwnerPassword(userId, dto);
  }

  @Post(':tenantId/contact')
  async contactAdmin(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() dto: ContactAdminDto,
  ) {
    return this.ownersService.contactAdmin(tenantId, dto);
  }
}
