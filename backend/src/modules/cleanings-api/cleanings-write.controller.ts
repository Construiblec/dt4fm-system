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
import { CleaningPlanningService } from '../cleaning-tasks/cleaning-planning.service';
import type {
  CleaningBatchResult,
  CleaningPlanResult,
} from '../cleaning-tasks/cleaning-planning.types';
import { CleaningsCacheService } from './cleanings-cache.service';
import { CleaningsApiDocs } from './cleanings-api-docs.decorator';
import { IntegrationsClient } from '../integrations-api/decorators/integrations-client.decorator';
import {
  CancelCleaningDto,
  CleaningPlanBatchDto,
  CleaningPlanFieldsDto,
  MAX_CHANGES,
  toPlanChanges,
  toPlanFields,
} from './dto/cleaning-plan.dto';
import { EmptyQueryDto } from '../integrations-api/dto/empty-query.dto';
import { CleaningsWriteApiKeyGuard } from './guards/cleanings-write-api-key.guard';
import { PositiveIntPipe } from '../integrations-api/pipes/positive-int.pipe';
import { strictBody } from '../integrations-api/pipes/strict-body.pipe';
import { strictQuery } from '../integrations-api/pipes/strict-query.pipe';

type WriteResponse = Omit<CleaningPlanResult, 'id'>;
type BatchSummary = Record<CleaningBatchResult['result'], number>;

const toResponse = (change: CleaningPlanResult): WriteResponse => ({
  data: change.data,
  result: change.result,
  warnings: change.warnings,
});

const summarize = (results: CleaningBatchResult[]): BatchSummary => {
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
@CleaningsApiDocs()
@ApiResponse({ status: 403, description: 'La clave no puede escribir.' })
@UseGuards(CleaningsWriteApiKeyGuard)
@Controller('integrations/v1')
export class CleaningsWriteController {
  constructor(
    private readonly planning: CleaningPlanningService,
    private readonly cache: CleaningsCacheService,
  ) {}

  @Patch('cleanings/:id')
  @ApiOperation({
    summary: 'Cambiar la planificación de una limpieza',
    description: 'Campo ausente = sin cambio; null = borrar.',
  })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: CleaningPlanFieldsDto })
  @ApiResponse({ status: 200, description: '{ data, result, warnings }' })
  @ApiResponse({ status: 404, description: 'La limpieza no existe.' })
  async update(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
    @Param('id', PositiveIntPipe) id: unknown,
    @Body(strictBody(CleaningPlanFieldsDto)) body: Record<string, any>,
    @IntegrationsClient() client: string,
  ): Promise<WriteResponse> {
    const fields = toPlanFields(body as CleaningPlanFieldsDto);

    return toResponse(
      await this.write(() =>
        this.planning.update(id as number, fields, client),
      ),
    );
  }

  @Post('cleanings/:id/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Cancelar una limpieza abierta' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: CancelCleaningDto })
  @ApiResponse({ status: 200, description: '{ data, result, warnings }' })
  @ApiResponse({ status: 404, description: 'La limpieza no existe.' })
  @ApiResponse({ status: 409, description: 'Su estado no admite cancelarla.' })
  async cancel(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
    @Param('id', PositiveIntPipe) id: unknown,
    @Body(strictBody(CancelCleaningDto)) body: Record<string, any>,
    @IntegrationsClient() client: string,
  ): Promise<WriteResponse> {
    const { reason } = body as CancelCleaningDto;

    return toResponse(
      await this.write(() =>
        this.planning.cancel(id as number, reason, client),
      ),
    );
  }

  @Post('plans')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Cambiar la planificación de varias limpiezas',
    description: `De 1 a ${MAX_CHANGES} cambios, sin repetir limpieza. No es atómico: cada cambio trae su resultado.`,
  })
  @ApiBody({ type: CleaningPlanBatchDto })
  @ApiResponse({ status: 200, description: '{ dryRun, results, summary }' })
  async plans(
    @Query(strictQuery(EmptyQueryDto)) _query: Record<string, any>,
    @Body(strictBody(CleaningPlanBatchDto)) body: Record<string, any>,
    @IntegrationsClient() client: string,
  ): Promise<{
    dryRun: boolean;
    results: CleaningBatchResult[];
    summary: BatchSummary;
  }> {
    const dto = body as CleaningPlanBatchDto;
    const dryRun = dto.dryRun ?? false;
    const changes = toPlanChanges(dto.changes);
    const run = () => this.planning.batch(changes, { dryRun, actor: client });
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
