import { Test, TestingModule } from '@nestjs/testing'
import { OpenmaintClient } from './openmaint.client'
import { OpenmaintService } from './openmaint.service'

describe('OpenmaintService', () => {
  let service: OpenmaintService
  let client: jest.Mocked<OpenmaintClient>

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
    client = module.get(OpenmaintClient)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  it('should resolve employee id from the first matching employee', async () => {
    client.get.mockResolvedValue({
      success: true,
      data: [{ _id: 629039 }]
    })

    await expect(service.resolveEmployeeId(628914, 'session-id')).resolves.toBe(629039)
  })

  it('should return null when employee lookup fails', async () => {
    client.get.mockRejectedValue(new Error('OpenMAINT error'))

    await expect(service.resolveEmployeeId(628914, 'session-id')).resolves.toBeNull()
  })
})
