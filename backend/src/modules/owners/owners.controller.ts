import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OwnersService } from './owners.service';
import { VerifyOwnerDto } from './dto/verify-owner.dto';
import { RegisterOwnerDto } from './dto/register-owner.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ContactAdminDto } from './dto/contact-admin.dto';
import { CreateReservationDto } from './dto/create-reservation.dto';
import { PayPaymentDto } from './dto/pay-payment.dto';
import { LoginDto } from '../auth/dto/login.dto';

type UploadedFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
};

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
   */
  @Get('common-areas')
  async getCommonAreas(@Query('buildingId') buildingId?: string) {
    return this.ownersService.getCommonAreas(
      buildingId ? Number(buildingId) : undefined,
    );
  }

  /**
   * GET /owners/common-areas/:areaId
   */
  @Get('common-areas/:areaId')
  async getCommonAreaById(@Param('areaId', ParseIntPipe) areaId: number) {
    return this.ownersService.getCommonAreaById(areaId);
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

  // ─── Pagos ────────────────────────────────────────────────────────────────

  /**
   * POST /owners/:tenantId/payments/pay
   * Marca uno o varios pagos como Pagado en OpenMAINT.
   * Body: { paymentIds: number[], method: string, paymentDate: string, notes?: string }
   * Soporta pago individual (una unidad) o total (todas las pendientes).
   */
  @Post(':tenantId/payments/pay')
  async payPayments(
    @Param('tenantId', ParseIntPipe) _tenantId: number,
    @Body() dto: PayPaymentDto,
  ) {
    return this.ownersService.payPayments(dto);
  }

  /**
   * POST /owners/payments/:paymentId/voucher
   * Sube el comprobante de pago como adjunto a la card de Pagos.
   * Multipart/form-data con campo "file".
   */
  @Post('payments/:paymentId/voucher')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
      fileFilter: (_req, file, callback) => {
        const allowed = /^(image\/(png|jpeg|jpg|webp)|application\/pdf)$/i.test(
          file.mimetype,
        );
        callback(
          allowed
            ? null
            : new BadRequestException('Solo se permiten imágenes o PDF'),
          allowed,
        );
      },
    }),
  )
  async uploadVoucher(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @UploadedFile() file: UploadedFile,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    return this.ownersService.uploadPaymentVoucher(paymentId, file);
  }

  // ─── Reservas ─────────────────────────────────────────────────────────────

  /**
   * POST /owners/:tenantId/reservations
   */
  @Post(':tenantId/reservations')
  async createReservation(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() dto: CreateReservationDto,
  ) {
    return this.ownersService.createReservation(dto, tenantId);
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
