import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';
import { CreateEmailTemplateDto } from './dto/create-email-template.dto';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';

/**
 * Endpoints CRUD de plantillas de correo.
 * Los consume la página personalizada de openMAINT.
 *
 * GET    /notifications/templates          → listar todas
 * GET    /notifications/templates/:id      → obtener una
 * POST   /notifications/templates          → crear
 * PUT    /notifications/templates/:id      → actualizar
 * DELETE /notifications/templates/:id      → eliminar
 */
@Controller('notifications/templates')
export class EmailTemplatesController {
  constructor(private readonly emailTemplatesService: EmailTemplatesService) {}

  @Get()
  findAll() {
    return this.emailTemplatesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.emailTemplatesService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateEmailTemplateDto) {
    return this.emailTemplatesService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateEmailTemplateDto) {
    return this.emailTemplatesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.emailTemplatesService.remove(id);
  }
}
