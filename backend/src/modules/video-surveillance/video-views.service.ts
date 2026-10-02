import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ListViewsQueryDto } from './dto/list-views.query.dto';
import { LiveViewRequest } from './entities/live-view-request.entity';

const DEFAULT_LIMIT = 50;

export interface LiveViewItem {
  requestId: string;
  cameraId: string;
  buildingId: number | null;
  username: string;
  status: LiveViewRequest['status'];
  errorCode: LiveViewRequest['errorCode'];
  requestedAt: Date;
  finishedAt: Date | null;
}

@Injectable()
export class VideoViewsService {
  constructor(
    @InjectRepository(LiveViewRequest)
    private readonly views: Repository<LiveViewRequest>,
  ) {}

  async list(query: ListViewsQueryDto): Promise<LiveViewItem[]> {
    const builder = this.views
      .createQueryBuilder('view')
      .orderBy('view.requestedAt', 'DESC')
      .take(query.limit ?? DEFAULT_LIMIT);

    if (query.cameraId) {
      builder.andWhere('view.cameraId = :cameraId', {
        cameraId: query.cameraId,
      });
    }
    if (query.username) {
      builder.andWhere('view.actorUsername = :username', {
        username: query.username,
      });
    }
    if (query.buildingId) {
      builder.andWhere('view.buildingId = :buildingId', {
        buildingId: query.buildingId,
      });
    }
    if (query.from) {
      builder.andWhere('view.requestedAt >= :from', {
        from: new Date(query.from),
      });
    }
    if (query.to) {
      builder.andWhere('view.requestedAt < :to', { to: new Date(query.to) });
    }

    const rows = await builder.getMany();

    return rows.map((row) => ({
      requestId: row.requestId,
      cameraId: row.cameraId,
      buildingId: row.buildingId,
      username: row.actorUsername,
      status: row.status,
      errorCode: row.errorCode,
      requestedAt: row.requestedAt,
      finishedAt: row.finishedAt,
    }));
  }
}
