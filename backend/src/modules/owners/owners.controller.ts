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
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { OwnerSessionGuard } from './guards/owner-session.guard';
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

@ApiTags('Propietarios')
@Controller('owners')
export class OwnersController {
  constructor(private readonly ownersService: OwnersService) {}

  // ─── Auth ─────────────────────────────────────────────────────────────────

  @Get('buildings')
  @ApiOperation({ summary: 'Obtener la lista de todos los edificios' })
  @ApiResponse({
    status: 200,
    description: 'Listado de edificios disponibles.',
  })
  async getBuildings() {
    return this.ownersService.getBuildings();
  }

  @Post('verify')
  @ApiOperation({
    summary: 'Verificar si un propietario existe en OpenMAINT por su Cédula/ID',
  })
  @ApiResponse({ status: 200, description: 'Resultado de la verificación.' })
  @ApiResponse({ status: 400, description: 'Datos de entrada inválidos.' })
  async verifyOwner(@Body() dto: VerifyOwnerDto) {
    return this.ownersService.verifyOwner(dto);
  }

  @Post('register')
  @ApiOperation({ summary: 'Registrar un propietario en el portal' })
  @ApiResponse({
    status: 201,
    description: 'Propietario registrado exitosamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'Datos de entrada inválidos o error en registro.',
  })
  async registerOwner(@Body() dto: RegisterOwnerDto) {
    return this.ownersService.registerOwner(dto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Inicio de sesión para propietarios' })
  @ApiResponse({
    status: 200,
    description:
      'Inicio de sesión exitoso. Retorna token y datos del propietario.',
  })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas.' })
  async loginOwner(@Body() dto: LoginDto) {
    return this.ownersService.loginOwner(dto.username, dto.password);
  }

  // ─── Áreas comunales ──────────────────────────────────────────────────────

  @Get('common-areas')
  @ApiOperation({ summary: 'Listar áreas comunes' })
  @ApiQuery({
    name: 'buildingId',
    required: false,
    description: 'Filtrar áreas por ID de edificio',
    type: 'string',
  })
  @ApiResponse({
    status: 200,
    description: 'Lista de áreas comunales encontradas.',
  })
  async getCommonAreas(@Query('buildingId') buildingId?: string) {
    return this.ownersService.getCommonAreas(
      buildingId ? Number(buildingId) : undefined,
    );
  }

  @Get('common-areas/:areaId')
  @ApiOperation({ summary: 'Obtener el detalle de una área común específica' })
  @ApiParam({
    name: 'areaId',
    description: 'ID de la área común',
    type: 'integer',
  })
  @ApiResponse({
    status: 200,
    description: 'Detalle de la área común obtenido correctamente.',
  })
  @ApiResponse({ status: 404, description: 'Área común no encontrada.' })
  async getCommonAreaById(@Param('areaId', ParseIntPipe) areaId: number) {
    return this.ownersService.getCommonAreaById(areaId);
  }

  @Get(':tenantId/common-areas')
  @ApiOperation({
    summary: 'Áreas comunales del edificio del residente y sus reservas',
  })
  @ApiParam({
    name: 'tenantId',
    description: 'ID del propietario (Tenant)',
    type: 'integer',
  })
  @ApiResponse({
    status: 200,
    description: 'Áreas reservables del edificio y reservas del residente.',
  })
  @ApiResponse({
    status: 400,
    description: 'El residente no tiene un edificio asignado.',
  })
  async getOwnerCommonAreas(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.ownersService.getOwnerCommonAreas(tenantId);
  }

  @Get(':tenantId/common-areas/:areaId')
  @ApiOperation({
    summary: 'Detalle de un área comunal del edificio del residente',
  })
  @ApiParam({
    name: 'tenantId',
    description: 'ID del propietario (Tenant)',
    type: 'integer',
  })
  @ApiParam({
    name: 'areaId',
    description: 'ID de la área común',
    type: 'integer',
  })
  @ApiResponse({ status: 200, description: 'Detalle del área comunal.' })
  @ApiResponse({
    status: 403,
    description: 'El área no pertenece al edificio del residente.',
  })
  @ApiResponse({
    status: 404,
    description: 'Área no encontrada o no habilitada para reservas.',
  })
  async getOwnerCommonAreaById(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Param('areaId', ParseIntPipe) areaId: number,
  ) {
    return this.ownersService.getOwnerCommonAreaById(tenantId, areaId);
  }

  // ─── Dashboard ────────────────────────────────────────────────────────────

  @Get(':tenantId/units')
  @UseGuards(OwnerSessionGuard)
  @ApiHeader({
    name: 'authorization',
    description: 'Sesión de openMAINT del residente',
    required: true,
  })
  @ApiOperation({
    summary: 'Obtener las unidades inmobiliarias asociadas al propietario',
  })
  @ApiParam({
    name: 'tenantId',
    description: 'ID del propietario (Tenant)',
    type: 'integer',
  })
  @ApiResponse({ status: 200, description: 'Lista de unidades inmobiliarias.' })
  async getOwnerUnits(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.ownersService.getOwnerUnits(tenantId);
  }

  @Get(':tenantId/payments')
  @UseGuards(OwnerSessionGuard)
  @ApiHeader({
    name: 'authorization',
    description: 'Sesión de openMAINT del residente',
    required: true,
  })
  @ApiOperation({ summary: 'Obtener pagos pendientes del propietario' })
  @ApiParam({
    name: 'tenantId',
    description: 'ID del propietario (Tenant)',
    type: 'integer',
  })
  @ApiResponse({ status: 200, description: 'Lista de pagos pendientes.' })
  async getOwnerPayments(@Param('tenantId', ParseIntPipe) tenantId: number) {
    return this.ownersService.getOwnerPendingPayments(tenantId);
  }

  // ─── Pagos ────────────────────────────────────────────────────────────────

  @Post(':tenantId/payments/pay')
  @UseGuards(OwnerSessionGuard)
  @ApiHeader({
    name: 'authorization',
    description: 'Sesión de openMAINT del residente',
    required: true,
  })
  @ApiOperation({
    summary: 'Registrar la declaración de pago de una o más expensas',
  })
  @ApiParam({
    name: 'tenantId',
    description: 'ID del propietario (Tenant)',
    type: 'integer',
  })
  @ApiResponse({
    status: 200,
    description: 'Declaración de pago registrada correctamente.',
  })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos.' })
  async payPayments(
    @Param('tenantId', ParseIntPipe) _tenantId: number,
    @Body() dto: PayPaymentDto,
  ) {
    return this.ownersService.payPayments(dto);
  }

  @Post('payments/:paymentId/voucher')
  @UseGuards(OwnerSessionGuard)
  @ApiHeader({
    name: 'authorization',
    description: 'Sesión de openMAINT del residente',
    required: true,
  })
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
  @ApiOperation({
    summary: 'Subir el comprobante físico del pago (Imagen o PDF)',
  })
  @ApiParam({
    name: 'paymentId',
    description: 'ID de la card de Pago en OpenMAINT',
    type: 'integer',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description:
      'Archivo de imagen o PDF del comprobante de transferencia o depósito',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Comprobante de pago',
        },
      },
      required: ['file'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Comprobante subido y asociado correctamente.',
  })
  @ApiResponse({
    status: 400,
    description: 'Archivo requerido o no soportado.',
  })
  async uploadVoucher(
    @Param('paymentId', ParseIntPipe) paymentId: number,
    @UploadedFile() file: UploadedFile,
  ) {
    if (!file) throw new BadRequestException('Archivo requerido');
    return this.ownersService.uploadPaymentVoucher(paymentId, file);
  }

  // ─── Reservas ─────────────────────────────────────────────────────────────

  @Post(':tenantId/reservations')
  @UseGuards(OwnerSessionGuard)
  @ApiHeader({
    name: 'authorization',
    description: 'Sesión de openMAINT del residente',
    required: true,
  })
  @ApiOperation({
    summary: 'Crear una reservación de área comunal para el propietario',
  })
  @ApiParam({
    name: 'tenantId',
    description: 'ID del propietario (Tenant)',
    type: 'integer',
  })
  @ApiResponse({ status: 201, description: 'Reservación creada con éxito.' })
  @ApiResponse({
    status: 400,
    description: 'Conflicto de horario o parámetros inválidos.',
  })
  @ApiResponse({
    status: 403,
    description: 'El área no pertenece al edificio del residente.',
  })
  @ApiResponse({
    status: 409,
    description: 'El área ya está reservada o está en mantenimiento.',
  })
  async createReservation(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() dto: CreateReservationDto,
  ) {
    return this.ownersService.createReservation(dto, tenantId);
  }

  // ─── Perfil ───────────────────────────────────────────────────────────────

  @Get(':userId/profile')
  @UseGuards(OwnerSessionGuard)
  @ApiHeader({
    name: 'authorization',
    description: 'Sesión de openMAINT del residente',
    required: true,
  })
  @ApiOperation({ summary: 'Obtener perfil del propietario' })
  @ApiParam({
    name: 'userId',
    description: 'ID de usuario del propietario',
    type: 'integer',
  })
  @ApiResponse({ status: 200, description: 'Datos del perfil del usuario.' })
  async getOwnerProfile(@Param('userId', ParseIntPipe) userId: number) {
    return this.ownersService.getOwnerProfile(userId);
  }

  @Put(':userId/password')
  @UseGuards(OwnerSessionGuard)
  @ApiHeader({
    name: 'authorization',
    description: 'Sesión de openMAINT del residente',
    required: true,
  })
  @ApiOperation({ summary: 'Cambiar la contraseña del propietario' })
  @ApiParam({
    name: 'userId',
    description: 'ID de usuario del propietario',
    type: 'integer',
  })
  @ApiResponse({
    status: 200,
    description: 'Contraseña actualizada con éxito.',
  })
  @ApiResponse({
    status: 400,
    description: 'Contraseña actual incorrecta o nueva inválida.',
  })
  async changePassword(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.ownersService.changeOwnerPassword(userId, dto);
  }

  @Post(':tenantId/contact')
  @UseGuards(OwnerSessionGuard)
  @ApiHeader({
    name: 'authorization',
    description: 'Sesión de openMAINT del residente',
    required: true,
  })
  @ApiOperation({
    summary: 'Enviar mensaje de contacto/soporte al administrador',
  })
  @ApiParam({
    name: 'tenantId',
    description: 'ID del propietario (Tenant)',
    type: 'integer',
  })
  @ApiResponse({
    status: 201,
    description: 'Mensaje de contacto enviado con éxito.',
  })
  @ApiResponse({
    status: 400,
    description: 'Parámetros de entrada incorrectos.',
  })
  async contactAdmin(
    @Param('tenantId', ParseIntPipe) tenantId: number,
    @Body() dto: ContactAdminDto,
  ) {
    return this.ownersService.contactAdmin(tenantId, dto);
  }
}
