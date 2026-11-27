import {
  Body,
  Controller,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { IntegrationsApiDocs } from '../integrations-api/decorators/integrations-api-docs.decorator';
import { IntegrationsClient } from '../integrations-api/decorators/integrations-client.decorator';
import { EmptyQueryDto } from '../integrations-api/dto/empty-query.dto';
import { MaintenanceWriteApiKeyGuard } from '../integrations-api/guards/maintenance-write-api-key.guard';
import { MaintenanceCacheService } from '../integrations-api/maintenance-cache.service';
import { PositiveIntPipe } from '../integrations-api/pipes/positive-int.pipe';
import { strictBody } from '../integrations-api/pipes/strict-body.pipe';
import { strictQuery } from '../integrations-api/pipes/strict-query.pipe';
import type {
  MaintenanceBatchResult,
  MaintenancePlanResult,
} from '../maintenance-supervision/maintenance-integration.types';
import { MaintenancePlanningService } from '../maintenance-supervision/maintenance-planning.service';
import { CancelMaintenanceDto, MAX_CHANGES } from './dto/maintenance-plan.dto';
import {
  PreventivePlanBatchDto,
  PreventivePlanFieldsDto,
  toPlanChanges,
  toPlanFields,
} from './dto/preventive-plan.dto';

type WriteResponse = Omit<MaintenancePlanResult, 'id'>;
type BatchSummary = Record<MaintenanceBatchResult['result'], number>;

const toResponse = (change: MaintenancePlanResult): WriteResponse => ({
  data: change.data,
  result: change.result,
  warnings: change.warnings,
});

const summarize = (results: MaintenanceBatchResult[]): BatchSummary => {
  const summary: BatchSummary = {
    applied: 0,
    unchanged: 0,
    valid: 0,
    failed: 0,
    not_attempted: 0,
  };

  for (const { result } of results) summary[result] += 1;

  return summary;
};

// Query estricta también aquí: un `?dryRun=true` ignorado escribiría de verdad.
// Los ids van como `unknown`: con `number`, el pipe global convierte «1e2» antes que PositiveIntPipe.
@IntegrationsApiDocs('API de mantenimiento')
@ApiResponse({ status: 403, description: 'La clave no puede escribir.' })
@UseGuards(MaintenanceWriteApiKeyGuard)
@Controller('integrations/v1/preventives')
export class PreventivesWriteController {
  constructor(
    private readonly planning: MaintenancePlanningService,
    private readonly cache: MaintenanceCacheService,
  ) {}

  @Patch(':id')
  @ApiOperation({
    summary: 'Cambiar el técnico o la fecha prevista de un preventivo',
    description: 'Campo ausente = sin cambio; ningún campo admite null.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: PreventivePlanFieldsDto })
  @ApiResponse({ status: 200, description: '{ data, result, warnings }' })
  @ApiResponse({ status: 404, description: 'El preventivo no existe.' })
  @ApiResponse({ status: 409, description: 'Su estado no admite el cambio.' })
  async update(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
    @Param('id', PositiveIntPipe) id: unknown,
    @Body(strictBody(PreventivePlanFieldsDto)) body: Record<string, any>,
    @IntegrationsClient() client: string,
  ): Promise<WriteResponse> {
    const fields = toPlanFields(body as PreventivePlanFieldsDto);

    return toResponse(
      await this.write(() =>
        this.planning.update('preventive', id as number, fields, client),
      ),
    );
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancelar un preventivo en planificación' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: CancelMaintenanceDto })
  @ApiResponse({ status: 200, description: '{ data, result, warnings }' })
  @ApiResponse({ status: 404, description: 'El preventivo no existe.' })
  @ApiResponse({ status: 409, description: 'Su estado no admite cancelarlo.' })
  async cancel(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
    @Param('id', PositiveIntPipe) id: unknown,
    @Body(strictBody(CancelMaintenanceDto)) body: Record<string, any>,
    @IntegrationsClient() client: string,
  ): Promise<WriteResponse> {
    const { reason } = body as CancelMaintenanceDto;

    return toResponse(
      await this.write(() =>
        this.planning.cancel('preventive', id as number, reason, client),
      ),
    );
  }

  @Post('plans')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cambiar la planificación de varios preventivos',
    description: `De 1 a ${MAX_CHANGES} cambios, sin repetir preventivo. No es atómico: cada cambio trae su resultado.`,
  })
  @ApiBody({ type: PreventivePlanBatchDto })
  @ApiResponse({ status: 200, description: '{ dryRun, results, summary }' })
  async plans(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
    @Body(strictBody(PreventivePlanBatchDto)) body: Record<string, any>,
    @IntegrationsClient() client: string,
  ): Promise<{
    dryRun: boolean;
    results: MaintenanceBatchResult[];
    summary: BatchSummary;
  }> {
    const dto = body as PreventivePlanBatchDto;
    const dryRun = dto.dryRun ?? false;
    const changes = toPlanChanges(dto.changes);
    const run = () =>
      this.planning.batch('preventive', changes, dryRun, client);
    const results = await (dryRun ? run() : this.write(run));

    return { dryRun, results, summary: summarize(results) };
  }

  // También con error: pudo haberse guardado algo antes de fallar.
  private async write<T>(action: () => Promise<T>): Promise<T> {
    try {
      return await action();
    } finally {
      this.cache.clear();
    }
  }
}
