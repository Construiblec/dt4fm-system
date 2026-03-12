import { Test, TestingModule } from '@nestjs/testing'
import { OpenmaintClient } from './openmaint.client'
import { OpenmaintService } from './openmaint.service'

describe('OpenmaintService', () => {
  let service: OpenmaintService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenmaintService,
        {
          provide: OpenmaintClient,
          useValue: {
            get: jest.fn(),
            post: jest.fn()
          }
        }
      ],
    }).compile()

    service = module.get<OpenmaintService>(OpenmaintService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
