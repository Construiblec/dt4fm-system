import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { IntegrationsApiDocs } from '../integrations-api/decorators/integrations-api-docs.decorator';
import { EmptyQueryDto } from '../integrations-api/dto/empty-query.dto';
import { MaintenanceApiKeyGuard } from '../integrations-api/guards/maintenance-api-key.guard';
import { MaintenanceCacheService } from '../integrations-api/maintenance-cache.service';
import { strictQuery } from '../integrations-api/pipes/strict-query.pipe';
import {
  resolveDefaultRange,
  type Range,
} from '../integrations-api/utils/default-range.util';
import type {
  MaintenanceCategory,
  MaintenanceTechnician,
} from '../maintenance-supervision/maintenance-integration.types';
import { MaintenanceReadService } from '../maintenance-supervision/maintenance-read.service';
import {
  ListTechniciansQueryDto,
  MAX_RANGE_DAYS,
} from './dto/list-technicians-query.dto';

/** Lecturas de apoyo para planificar. */
@IntegrationsApiDocs('API de mantenimiento')
@UseGuards(MaintenanceApiKeyGuard)
@Controller('integrations/v1')
export class MaintenanceSupportController {
  constructor(
    private readonly reader: MaintenanceReadService,
    private readonly cache: MaintenanceCacheService,
  ) {}

  @Get('technicians')
  @ApiOperation({
    summary: 'Técnicos y sus órdenes abiertas',
    description: `Por defecto, hoy y mañana (UTC-5). Máximo ${MAX_RANGE_DAYS} días. Las órdenes sin fecha prevista van en unscheduled.`,
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Desde, incluido (ISO 8601 con zona); va junto con to',
    example: '2026-11-16T00:00:00-05:00',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Hasta, excluido (ISO 8601 con zona); va junto con from',
    example: '2026-11-18T00:00:00-05:00',
  })
  @ApiResponse({ status: 200, description: '{ data, meta: { from, to } }' })
  async technicians(
    @Query(strictQuery(ListTechniciansQueryDto)) query: Record<string, any>,
  ): Promise<{ data: MaintenanceTechnician[]; meta: Range }> {
    const range = resolveDefaultRange(query as ListTechniciansQueryDto);
    const data = await this.cache.getOrLoad(
      `technicians:${range.from}:${range.to}`,
      () => this.reader.technicians(range),
    );

    return { data, meta: range };
  }

  @Get('corrective-categories')
  @ApiOperation({ summary: 'Categorías y subcategorías de correctivos' })
  @ApiResponse({ status: 200, description: '{ data }' })
  async categories(
    // Solo valida que no lleguen parámetros.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
  ): Promise<{ data: MaintenanceCategory[] }> {
    const data = await this.cache.getOrLoad('corrective-categories', () =>
      this.reader.categories(),
    );

    return { data };
  }
}
