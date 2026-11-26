import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CleaningPlanningService } from '../cleaning-tasks/cleaning-planning.service';
import type {
  CleanerAgenda,
  CleaningChecklistOption,
} from '../cleaning-tasks/cleaning-planning.types';
import { CleaningSyncService } from '../cleaning-tasks/cleaning-sync.service';
import type { CleaningSyncStatus } from '../cleaning-tasks/cleaning-sync.types';
import { CleaningsCacheService } from './cleanings-cache.service';
import { CleaningsApiDocs } from './cleanings-api-docs.decorator';
import {
  ListCleanersQueryDto,
  MAX_RANGE_DAYS,
} from './dto/list-cleaners-query.dto';
import { EmptyQueryDto } from '../integrations-api/dto/empty-query.dto';
import { CleaningsApiKeyGuard } from './guards/cleanings-api-key.guard';
import { strictQuery } from '../integrations-api/pipes/strict-query.pipe';
import {
  resolveDefaultRange,
  type Range,
} from '../integrations-api/utils/default-range.util';

/** Lecturas de apoyo para planificar. */
@CleaningsApiDocs()
@UseGuards(CleaningsApiKeyGuard)
@Controller('integrations/v1')
export class CleaningsPlanningController {
  constructor(
    private readonly planning: CleaningPlanningService,
    private readonly sync: CleaningSyncService,
    private readonly cache: CleaningsCacheService,
  ) {}

  @Get('cleaners')
  @ApiOperation({
    summary: 'Operarios y sus limpiezas asignadas',
    description: `Por defecto, hoy y mañana (UTC-5). Máximo ${MAX_RANGE_DAYS} días.`,
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
  async cleaners(
    @Query(strictQuery(ListCleanersQueryDto)) query: Record<string, any>,
  ): Promise<{ data: CleanerAgenda[]; meta: Range }> {
    const range = resolveDefaultRange(query as ListCleanersQueryDto);
    const data = await this.cache.getOrLoad(
      `cleaners:${range.from}:${range.to}`,
      () => this.planning.listCleaners(range.from, range.to),
    );

    return { data, meta: range };
  }

  @Get('checklists')
  @ApiOperation({ summary: 'Checklists asignables a una limpieza' })
  @ApiResponse({ status: 200, description: '{ data }' })
  async checklists(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
  ): Promise<{ data: CleaningChecklistOption[] }> {
    void _query;

    const data = await this.cache.getOrLoad('checklists', () =>
      this.planning.listChecklists(),
    );

    return { data };
  }

  @Get('cleaning-sync')
  @ApiOperation({ summary: 'Estado de la sincronización de reservas' })
  @ApiResponse({ status: 200, description: '{ data }' })
  syncStatus(@Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>): {
    data: CleaningSyncStatus;
  } {
    void _query;

    return { data: this.sync.status() };
  }
}
