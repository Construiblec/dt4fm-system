import { Test, TestingModule } from '@nestjs/testing';
import { OpenmaintService } from './openmaint.service';

describe('OpenmaintService', () => {
  let service: OpenmaintService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OpenmaintService],
    }).compile();

    service = module.get<OpenmaintService>(OpenmaintService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
